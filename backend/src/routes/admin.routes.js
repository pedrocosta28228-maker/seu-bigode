import { Router } from 'express';
import { hashPassword } from '../services/auth.service.js';
import { formatLocalDate, isValidDateString } from '../services/slots.service.js';
import { requireRole } from '../middlewares/security.middleware.js';

const STATUS_VALIDOS = new Set([
  'agendado',
  'confirmado',
  'concluido',
  'cancelado',
  'no_show'
]);

const CATEGORIAS_VALIDAS = new Set(['cabelo', 'barba', 'combo', 'extra']);

export function createAdminRouter(db, eventHub, requireAuth) {
  const router = Router();
  router.use(requireAuth);

  // Stream SSE para notificações ao vivo no painel do barbeiro
  router.get('/events', (_req, res) => {
    eventHub.addClient(res);
  });

  // Agenda por dia ou por intervalo (dataInicio..dataFim)
  router.get('/agendamentos', async (req, res) => {
    const hoje = formatLocalDate(new Date());
    const data = req.query.data ? String(req.query.data) : '';
    const dataInicio = req.query.dataInicio ? String(req.query.dataInicio) : data || hoje;
    const dataFim = req.query.dataFim ? String(req.query.dataFim) : data || dataInicio;
    const barbeiroId =
      req.query.barbeiroId && req.query.barbeiroId !== 'todos'
        ? Number(req.query.barbeiroId)
        : null;
    const status =
      req.query.status && req.query.status !== 'todos' ? String(req.query.status) : null;

    if (!isValidDateString(dataInicio) || !isValidDateString(dataFim)) {
      return res.status(400).json({ erro: 'Intervalo de datas inválido.' });
    }

    const condicoes = ['a.data BETWEEN ? AND ?'];
    const params = [dataInicio, dataFim];

    if (barbeiroId) {
      condicoes.push('a.barbeiro_id = ?');
      params.push(barbeiroId);
    }

    if (status && STATUS_VALIDOS.has(status)) {
      condicoes.push('a.status = ?');
      params.push(status);
    }

    const rows = await db.all(
      `SELECT
        a.id, a.codigo, a.barbeiro_id AS "barbeiroId", b.nome AS "barbeiroNome",
        a.cliente_nome AS "clienteNome", a.cliente_whatsapp AS "clienteWhatsapp",
        a.data, a.hora_inicio AS "horaInicio", a.hora_fim AS "horaFim",
        a.duracao_total_min AS "duracaoTotalMin", a.total_centavos AS "totalCentavos",
        a.status, a.status_pagamento AS "statusPagamento", a.observacoes, a.criado_em AS "criadoEm"
      FROM agendamentos a
      JOIN barbeiros b ON b.id = a.barbeiro_id
      WHERE ${condicoes.join(' AND ')}
      ORDER BY a.data ASC, a.hora_inicio ASC`,
      ...params
    );

    // Busca todos os serviços dos agendamentos em 1 única query (evita problema N+1)
    const itensPorAgendamento = new Map();
    if (rows.length > 0) {
      const agIds = rows.map((r) => r.id);
      const placeholders = agIds.map(() => '?').join(', ');
      const todosItens = await db.all(
        `SELECT id, agendamento_id AS "agendamentoId", servico_id AS "servicoId",
                nome_snapshot AS nome, preco_centavos_snapshot AS "precoCentavos",
                duracao_min_snapshot AS "duracaoMin"
         FROM agendamento_servicos
         WHERE agendamento_id IN (${placeholders})`,
        ...agIds
      );
      for (const item of todosItens) {
        const chave = Number(item.agendamentoId);
        if (!itensPorAgendamento.has(chave)) itensPorAgendamento.set(chave, []);
        itensPorAgendamento.get(chave).push({
          id: item.id,
          servicoId: item.servicoId,
          nome: item.nome,
          precoCentavos: Number(item.precoCentavos),
          duracaoMin: Number(item.duracaoMin)
        });
      }
    }

    const agendamentos = rows.map((row) => ({
      ...row,
      duracaoTotalMin: Number(row.duracaoTotalMin),
      totalCentavos: Number(row.totalCentavos),
      servicos: itensPorAgendamento.get(Number(row.id)) || []
    }));

    const ativos = agendamentos.filter((a) => a.status !== 'cancelado' && a.status !== 'no_show');
    const resumo = {
      total: agendamentos.length,
      ativos: ativos.length,
      agendados: agendamentos.filter((a) => a.status === 'agendado').length,
      confirmados: agendamentos.filter((a) => a.status === 'confirmado').length,
      concluidos: agendamentos.filter((a) => a.status === 'concluido').length,
      faturamentoPrevistoCentavos: ativos.reduce((acc, a) => acc + a.totalCentavos, 0)
    };

    res.json({ dataInicio, dataFim, resumo, agendamentos });
  });

  // Atualiza status do atendimento (Confirmar, Concluir + lançar no caixa, Cancelar, Não compareceu)
  router.patch('/agendamentos/:id/status', async (req, res) => {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '');
    const formaPagamento = ['pix', 'dinheiro', 'cartao'].includes(String(req.body?.formaPagamento || ''))
      ? String(req.body.formaPagamento)
      : 'pix';

    if (!Number.isInteger(id) || !STATUS_VALIDOS.has(status)) {
      return res.status(400).json({ erro: 'Status ou agendamento inválido.' });
    }

    const agendamento = await db.get(
      `SELECT id, codigo, barbeiro_id AS "barbeiroId", cliente_nome AS "clienteNome",
              total_centavos AS "totalCentavos"
       FROM agendamentos
       WHERE id = ?`,
      id
    );

    if (!agendamento) {
      return res.status(404).json({ erro: 'Agendamento não encontrado.' });
    }

    try {
      const lancadoNoCaixa = await db.transaction(async (tx) => {
        if (status === 'concluido') {
          const statusPag = formaPagamento === 'pix' ? 'pago_pix' : 'pago_local';
          await tx.run(
            'UPDATE agendamentos SET status = ?, status_pagamento = ? WHERE id = ?',
            status,
            statusPag,
            id
          );

          const jaLancado = await tx.get(
            'SELECT id FROM movimentacoes_caixa WHERE agendamento_id = ?',
            id
          );

          if (!jaLancado && Number(agendamento.totalCentavos) > 0) {
            await tx.run(
              `INSERT INTO movimentacoes_caixa (
                agendamento_id, barbeiro_id, tipo, forma_pagamento, valor_centavos, descricao
              ) VALUES (?, ?, 'entrada', ?, ?, ?)`,
              id,
              agendamento.barbeiroId,
              formaPagamento,
              Number(agendamento.totalCentavos),
              `Atendimento ${agendamento.codigo} — ${agendamento.clienteNome}`
            );
            return true;
          }
          return false;
        }

        await tx.run('UPDATE agendamentos SET status = ? WHERE id = ?', status, id);
        return false;
      });

      eventHub.broadcast('status_atualizado', { id, status, lancadoNoCaixa });
      return res.json({ id, status, lancadoNoCaixa });
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      return res.status(500).json({ erro: 'Não foi possível atualizar o status.' });
    }
  });

  // ===================== SERVIÇOS (CRUD) =====================
  router.get('/servicos', async (_req, res) => {
    const rows = await db.all(
      `SELECT id, nome, descricao, categoria, duracao_min AS "duracaoMin",
              preco_centavos AS "precoCentavos", ativo
       FROM servicos
       ORDER BY ativo DESC, categoria ASC, id ASC`
    );

    res.json(
      rows.map((s) => ({
        ...s,
        duracaoMin: Number(s.duracaoMin),
        precoCentavos: Number(s.precoCentavos),
        ativo: Boolean(s.ativo)
      }))
    );
  });

  router.post('/servicos', async (req, res) => {
    const nome = String(req.body?.nome || '').trim();
    const descricao = String(req.body?.descricao || '').trim();
    const categoria = String(req.body?.categoria || 'cabelo');
    const duracaoMin = Number(req.body?.duracaoMin);
    const precoCentavos = Math.round(Number(req.body?.precoCentavos));

    if (nome.length < 2 || !CATEGORIAS_VALIDAS.has(categoria)) {
      return res.status(400).json({ erro: 'Nome ou categoria do serviço inválidos.' });
    }
    if (!Number.isFinite(duracaoMin) || duracaoMin < 5 || !Number.isFinite(precoCentavos) || precoCentavos < 0) {
      return res.status(400).json({ erro: 'Duração e preço devem ser valores válidos.' });
    }

    const id = await db.insert(
      `INSERT INTO servicos (nome, descricao, categoria, duracao_min, preco_centavos, ativo)
       VALUES (?, ?, ?, ?, ?, 1)`,
      nome,
      descricao || null,
      categoria,
      duracaoMin,
      precoCentavos
    );

    res.status(201).json({
      id,
      nome,
      descricao: descricao || null,
      categoria,
      duracaoMin,
      precoCentavos,
      ativo: true
    });
  });

  router.put('/servicos/:id', async (req, res) => {
    const id = Number(req.params.id);
    const atual = await db.get('SELECT * FROM servicos WHERE id = ?', id);
    if (!atual) {
      return res.status(404).json({ erro: 'Serviço não encontrado.' });
    }

    const nome = req.body?.nome !== undefined ? String(req.body.nome).trim() : atual.nome;
    const descricao =
      req.body?.descricao !== undefined ? String(req.body.descricao).trim() : atual.descricao;
    const categoria =
      req.body?.categoria !== undefined ? String(req.body.categoria) : atual.categoria;
    const duracaoMin =
      req.body?.duracaoMin !== undefined ? Number(req.body.duracaoMin) : Number(atual.duracao_min);
    const precoCentavos =
      req.body?.precoCentavos !== undefined
        ? Math.round(Number(req.body.precoCentavos))
        : Number(atual.preco_centavos);
    const ativo = req.body?.ativo !== undefined ? (req.body.ativo ? 1 : 0) : atual.ativo;

    if (nome.length < 2 || !CATEGORIAS_VALIDAS.has(categoria) || duracaoMin < 5 || precoCentavos < 0) {
      return res.status(400).json({ erro: 'Dados do serviço inválidos.' });
    }

    await db.run(
      `UPDATE servicos
       SET nome = ?, descricao = ?, categoria = ?, duracao_min = ?, preco_centavos = ?, ativo = ?
       WHERE id = ?`,
      nome,
      descricao || null,
      categoria,
      duracaoMin,
      precoCentavos,
      ativo,
      id
    );

    res.json({
      id,
      nome,
      descricao: descricao || null,
      categoria,
      duracaoMin,
      precoCentavos,
      ativo: Boolean(ativo)
    });
  });

  // ===================== EQUIPE / BARBEIROS =====================
  router.get('/barbeiros', async (_req, res) => {
    const rows = await db.all(
      `SELECT id, nome, especialidade, telefone, email, papel, ativo
       FROM barbeiros
       ORDER BY CASE WHEN papel = 'dono' THEN 0 ELSE 1 END, id ASC`
    );

    res.json(rows.map((b) => ({ ...b, ativo: Boolean(b.ativo) })));
  });

  router.post('/barbeiros', requireRole('dono'), async (req, res) => {
    const nome = String(req.body?.nome || '').trim();
    const especialidade = String(req.body?.especialidade || 'Barbeiro').trim();
    const telefone = String(req.body?.telefone || '').replace(/\D/g, '');
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '123456');

    if (nome.length < 2 || !email.includes('@') || senha.length < 4) {
      return res.status(400).json({ erro: 'Informe nome, email válido e senha (mín. 4 caracteres).' });
    }

    const jaExiste = await db.get('SELECT id FROM barbeiros WHERE lower(email) = ?', email);
    if (jaExiste) {
      return res.status(409).json({ erro: 'Já existe um barbeiro cadastrado com esse email.' });
    }

    const senhaHash = hashPassword(senha);
    const novoId = await db.insert(
      `INSERT INTO barbeiros (nome, especialidade, telefone, email, senha_hash, papel, ativo)
       VALUES (?, ?, ?, ?, ?, 'barbeiro', 1)`,
      nome,
      especialidade,
      telefone || null,
      email,
      senhaHash
    );

    for (const dia of [1, 2, 3, 4, 5]) {
      await db.run(
        `INSERT INTO horarios_trabalho (barbeiro_id, dia_semana, hora_inicio, hora_fim, almoco_inicio, almoco_fim)
         VALUES (?, ?, '07:00', '19:00', '12:00', '14:00')`,
        novoId,
        dia
      );
    }
    await db.run(
      `INSERT INTO horarios_trabalho (barbeiro_id, dia_semana, hora_inicio, hora_fim, almoco_inicio, almoco_fim)
       VALUES (?, 6, '07:00', '12:00', NULL, NULL)`,
      novoId
    );

    res.status(201).json({
      id: novoId,
      nome,
      especialidade,
      telefone: telefone || null,
      email,
      papel: 'barbeiro',
      ativo: true
    });
  });

  router.patch('/barbeiros/:id', async (req, res) => {
    const id = Number(req.params.id);
    const atual = await db.get('SELECT * FROM barbeiros WHERE id = ?', id);
    if (!atual) {
      return res.status(404).json({ erro: 'Barbeiro não encontrado.' });
    }

    const nome = req.body?.nome !== undefined ? String(req.body.nome).trim() : atual.nome;
    const especialidade =
      req.body?.especialidade !== undefined ? String(req.body.especialidade).trim() : atual.especialidade;
    const telefone =
      req.body?.telefone !== undefined ? String(req.body.telefone).replace(/\D/g, '') : atual.telefone;
    const ativo = req.body?.ativo !== undefined ? (req.body.ativo ? 1 : 0) : atual.ativo;

    await db.run(
      `UPDATE barbeiros SET nome = ?, especialidade = ?, telefone = ?, ativo = ? WHERE id = ?`,
      nome,
      especialidade,
      telefone || null,
      ativo,
      id
    );

    res.json({
      id,
      nome,
      especialidade,
      telefone: telefone || null,
      email: atual.email,
      papel: atual.papel,
      ativo: Boolean(ativo)
    });
  });

  // ===================== CONFIGURAÇÕES (PIX & WHATSAPP) =====================
  router.get('/config', async (_req, res) => {
    const cfg = await db.get(
      `SELECT nome, whatsapp, pix_chave AS "pixChave", pix_tipo AS "pixTipo", pix_titular AS "pixTitular"
       FROM configuracoes_barbearia
       WHERE id = 1`
    );
    res.json(
      cfg || {
        nome: 'Seu Bigode',
        whatsapp: '5511999999999',
        pixChave: '',
        pixTipo: 'Celular',
        pixTitular: 'Barbearia Seu Bigode'
      }
    );
  });

  router.put('/config', requireRole('dono'), async (req, res) => {
    const nome = String(req.body?.nome || 'Seu Bigode').trim();
    const whatsapp = String(req.body?.whatsapp || '').replace(/\D/g, '');
    const pixChave = String(req.body?.pixChave || '').trim();
    const pixTipo = String(req.body?.pixTipo || 'Celular').trim();
    const pixTitular = String(req.body?.pixTitular || '').trim();

    await db.run(
      `INSERT INTO configuracoes_barbearia (id, nome, whatsapp, pix_chave, pix_tipo, pix_titular)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         nome = excluded.nome,
         whatsapp = excluded.whatsapp,
         pix_chave = excluded.pix_chave,
         pix_tipo = excluded.pix_tipo,
         pix_titular = excluded.pix_titular`,
      nome || 'Seu Bigode',
      whatsapp || '5511999999999',
      pixChave,
      pixTipo,
      pixTitular
    );

    res.json({ nome, whatsapp, pixChave, pixTipo, pixTitular });
  });

  // ===================== BLOQUEIOS / FOLGAS =====================
  router.get('/bloqueios', async (req, res) => {
    const hoje = formatLocalDate(new Date());
    const barbeiroId =
      req.query.barbeiroId && req.query.barbeiroId !== 'todos'
        ? Number(req.query.barbeiroId)
        : null;

    const rows = barbeiroId
      ? await db.all(
          `SELECT bl.id, bl.barbeiro_id AS "barbeiroId", b.nome AS "barbeiroNome",
                  bl.data, bl.hora_inicio AS "horaInicio", bl.hora_fim AS "horaFim", bl.motivo
           FROM bloqueios bl
           JOIN barbeiros b ON b.id = bl.barbeiro_id
           WHERE bl.barbeiro_id = ? AND bl.data >= ?
           ORDER BY bl.data ASC, bl.hora_inicio ASC`,
          barbeiroId,
          hoje
        )
      : await db.all(
          `SELECT bl.id, bl.barbeiro_id AS "barbeiroId", b.nome AS "barbeiroNome",
                  bl.data, bl.hora_inicio AS "horaInicio", bl.hora_fim AS "horaFim", bl.motivo
           FROM bloqueios bl
           JOIN barbeiros b ON b.id = bl.barbeiro_id
           WHERE bl.data >= ?
           ORDER BY bl.data ASC, bl.hora_inicio ASC`,
          hoje
        );

    res.json(rows);
  });

  router.post('/bloqueios', async (req, res) => {
    const barbeiroId = Number(req.body?.barbeiroId);
    const data = String(req.body?.data || '');
    const horaInicio = String(req.body?.horaInicio || '07:00');
    const horaFim = String(req.body?.horaFim || '19:00');
    const motivo = String(req.body?.motivo || 'Folga / Compromisso').trim();

    if (!Number.isInteger(barbeiroId) || !isValidDateString(data)) {
      return res.status(400).json({ erro: 'Barbeiro ou data inválidos.' });
    }
    if (!/^\d{2}:\d{2}$/.test(horaInicio) || !/^\d{2}:\d{2}$/.test(horaFim) || horaInicio >= horaFim) {
      return res.status(400).json({ erro: 'Horário de início deve ser anterior ao término.' });
    }

    const id = await db.insert(
      `INSERT INTO bloqueios (barbeiro_id, data, hora_inicio, hora_fim, motivo)
       VALUES (?, ?, ?, ?, ?)`,
      barbeiroId,
      data,
      horaInicio,
      horaFim,
      motivo
    );

    const barbeiro = await db.get('SELECT nome FROM barbeiros WHERE id = ?', barbeiroId);

    res.status(201).json({
      id,
      barbeiroId,
      barbeiroNome: barbeiro?.nome || '',
      data,
      horaInicio,
      horaFim,
      motivo
    });
  });

  router.delete('/bloqueios/:id', async (req, res) => {
    const id = Number(req.params.id);
    await db.run('DELETE FROM bloqueios WHERE id = ?', id);
    res.json({ ok: true });
  });

  return router;
}
