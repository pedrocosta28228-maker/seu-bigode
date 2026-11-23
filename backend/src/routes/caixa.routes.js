import { Router } from 'express';
import { addDaysToDateString, formatLocalDate } from '../services/slots.service.js';

const FORMAS_VALIDAS = new Set(['pix', 'dinheiro', 'cartao']);
const TIPOS_VALIDOS = new Set(['entrada', 'saida']);

export function createCaixaRouter(db, requireAuth) {
  const router = Router();
  router.use(requireAuth);

  router.get('/resumo', async (req, res) => {
    const hoje = formatLocalDate(new Date());
    const inicioSemana = addDaysToDateString(hoje, -6);
    const inicioMes = `${hoje.slice(0, 7)}-01`;
    const barbeiroId =
      req.query.barbeiroId && req.query.barbeiroId !== 'todos'
        ? Number(req.query.barbeiroId)
        : null;

    const filtroBarbeiroSql = barbeiroId ? ' AND barbeiro_id = ?' : '';
    const filtroBarbeiroParams = barbeiroId ? [barbeiroId] : [];

    const somarPeriodo = async (dataInicio, dataFim) => {
      const row = await db.get(
        `SELECT
          COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor_centavos ELSE 0 END), 0) AS "entradasCentavos",
          COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor_centavos ELSE 0 END), 0) AS "saidasCentavos",
          COUNT(CASE WHEN tipo = 'entrada' THEN 1 END) AS "qtdEntradas"
         FROM movimentacoes_caixa
         WHERE substr(data_hora, 1, 10) BETWEEN ? AND ?${filtroBarbeiroSql}`,
        dataInicio,
        dataFim,
        ...filtroBarbeiroParams
      );

      const entradasCentavos = Number(row?.entradasCentavos || 0);
      const saidasCentavos = Number(row?.saidasCentavos || 0);
      const qtdEntradas = Number(row?.qtdEntradas || 0);

      return {
        entradasCentavos,
        saidasCentavos,
        saldoCentavos: entradasCentavos - saidasCentavos,
        qtdEntradas,
        ticketMedioCentavos: qtdEntradas > 0 ? Math.round(entradasCentavos / qtdEntradas) : 0
      };
    };

    const [resumoHoje, resumoSemana, resumoMes] = await Promise.all([
      somarPeriodo(hoje, hoje),
      somarPeriodo(inicioSemana, hoje),
      somarPeriodo(inicioMes, hoje)
    ]);

    const porBarbeiroRows = await db.all(
      `SELECT
        b.id, b.nome,
        COUNT(CASE WHEN m.tipo = 'entrada' THEN 1 END) AS "qtdAtendimentos",
        COALESCE(SUM(CASE WHEN m.tipo = 'entrada' THEN m.valor_centavos ELSE 0 END), 0) AS "entradasCentavos"
       FROM barbeiros b
       LEFT JOIN movimentacoes_caixa m
         ON m.barbeiro_id = b.id
        AND substr(m.data_hora, 1, 10) BETWEEN ? AND ?
       WHERE b.ativo = 1
       GROUP BY b.id, b.nome
       ORDER BY "entradasCentavos" DESC, b.id ASC`,
      inicioMes,
      hoje
    );

    const porBarbeiro = porBarbeiroRows.map((r) => ({
      id: Number(r.id),
      nome: r.nome,
      qtdAtendimentos: Number(r.qtdAtendimentos || 0),
      entradasCentavos: Number(r.entradasCentavos || 0)
    }));

    const porFormaRows = await db.all(
      `SELECT
        forma_pagamento AS "formaPagamento",
        COUNT(*) AS qtd,
        COALESCE(SUM(valor_centavos), 0) AS "totalCentavos"
       FROM movimentacoes_caixa
       WHERE tipo = 'entrada'
         AND substr(data_hora, 1, 10) BETWEEN ? AND ?${filtroBarbeiroSql}
       GROUP BY forma_pagamento
       ORDER BY "totalCentavos" DESC`,
      inicioMes,
      hoje,
      ...filtroBarbeiroParams
    );

    const porFormaPagamento = porFormaRows.map((r) => ({
      formaPagamento: r.formaPagamento,
      qtd: Number(r.qtd || 0),
      totalCentavos: Number(r.totalCentavos || 0)
    }));

    const rows7d = await db.all(
      `SELECT
        substr(data_hora, 1, 10) AS data,
        COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor_centavos ELSE 0 END), 0) AS "entradasCentavos",
        COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor_centavos ELSE 0 END), 0) AS "saidasCentavos"
       FROM movimentacoes_caixa
       WHERE substr(data_hora, 1, 10) BETWEEN ? AND ?${filtroBarbeiroSql}
       GROUP BY substr(data_hora, 1, 10)`,
      inicioSemana,
      hoje,
      ...filtroBarbeiroParams
    );

    const mapa7d = new Map(rows7d.map((r) => [r.data, r]));
    const serie7Dias = [];
    for (let i = 6; i >= 0; i--) {
      const data = addDaysToDateString(hoje, -i);
      const item = mapa7d.get(data);
      serie7Dias.push({
        data,
        label: `${data.slice(8, 10)}/${data.slice(5, 7)}`,
        entradasCentavos: Number(item?.entradasCentavos || 0),
        saidasCentavos: Number(item?.saidasCentavos || 0)
      });
    }

    const filtroBarbeiroAgSql = barbeiroId ? ' AND a.barbeiro_id = ?' : '';
    const topServicosRows = await db.all(
      `SELECT
        s.nome_snapshot AS nome,
        COUNT(*) AS qtd,
        COALESCE(SUM(s.preco_centavos_snapshot), 0) AS "totalCentavos"
       FROM agendamento_servicos s
       JOIN agendamentos a ON a.id = s.agendamento_id
       WHERE a.status = 'concluido'
         AND a.data BETWEEN ? AND ?${filtroBarbeiroAgSql}
       GROUP BY s.nome_snapshot
       ORDER BY qtd DESC, "totalCentavos" DESC
       LIMIT 5`,
      inicioMes,
      hoje,
      ...filtroBarbeiroParams
    );

    const topServicos = topServicosRows.map((r) => ({
      nome: r.nome,
      qtd: Number(r.qtd || 0),
      totalCentavos: Number(r.totalCentavos || 0)
    }));

    res.json({
      hoje: resumoHoje,
      semana: resumoSemana,
      mes: resumoMes,
      porBarbeiro,
      porFormaPagamento,
      serie7Dias,
      topServicos
    });
  });

  router.get('/movimentacoes', async (req, res) => {
    const hoje = formatLocalDate(new Date());
    const periodo = String(req.query.periodo || 'mes');
    const barbeiroId =
      req.query.barbeiroId && req.query.barbeiroId !== 'todos'
        ? Number(req.query.barbeiroId)
        : null;

    let dataInicio = `${hoje.slice(0, 7)}-01`;
    if (periodo === 'hoje') dataInicio = hoje;
    if (periodo === 'semana') dataInicio = addDaysToDateString(hoje, -6);

    const condicoes = ['substr(m.data_hora, 1, 10) BETWEEN ? AND ?'];
    const params = [dataInicio, hoje];

    if (barbeiroId) {
      condicoes.push('m.barbeiro_id = ?');
      params.push(barbeiroId);
    }

    const rows = await db.all(
      `SELECT
        m.id, m.agendamento_id AS "agendamentoId",
        m.barbeiro_id AS "barbeiroId", b.nome AS "barbeiroNome",
        m.tipo, m.forma_pagamento AS "formaPagamento",
        m.valor_centavos AS "valorCentavos",
        m.descricao, m.data_hora AS "dataHora"
       FROM movimentacoes_caixa m
       JOIN barbeiros b ON b.id = m.barbeiro_id
       WHERE ${condicoes.join(' AND ')}
       ORDER BY m.data_hora DESC, m.id DESC
       LIMIT 100`,
      ...params
    );

    res.json(
      rows.map((m) => ({
        ...m,
        valorCentavos: Number(m.valorCentavos)
      }))
    );
  });

  router.post('/movimentacoes', async (req, res) => {
    const barbeiroId = Number(req.body?.barbeiroId || req.barbeiro.id);
    const tipo = String(req.body?.tipo || 'entrada');
    const formaPagamento = String(req.body?.formaPagamento || 'pix');
    const valorCentavos = Math.round(Number(req.body?.valorCentavos));
    const descricao = String(req.body?.descricao || '').trim();

    if (!TIPOS_VALIDOS.has(tipo) || !FORMAS_VALIDAS.has(formaPagamento)) {
      return res.status(400).json({ erro: 'Tipo ou forma de pagamento inválidos.' });
    }
    if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) {
      return res.status(400).json({ erro: 'Informe um valor maior que zero.' });
    }
    if (descricao.length < 2) {
      return res.status(400).json({ erro: 'Informe uma descrição para o lançamento.' });
    }

    const id = await db.insert(
      `INSERT INTO movimentacoes_caixa (
        agendamento_id, barbeiro_id, tipo, forma_pagamento, valor_centavos, descricao
      ) VALUES (NULL, ?, ?, ?, ?, ?)`,
      barbeiroId,
      tipo,
      formaPagamento,
      valorCentavos,
      descricao
    );

    const criado = await db.get(
      `SELECT
        m.id, m.agendamento_id AS "agendamentoId",
        m.barbeiro_id AS "barbeiroId", b.nome AS "barbeiroNome",
        m.tipo, m.forma_pagamento AS "formaPagamento",
        m.valor_centavos AS "valorCentavos",
        m.descricao, m.data_hora AS "dataHora"
       FROM movimentacoes_caixa m
       JOIN barbeiros b ON b.id = m.barbeiro_id
       WHERE m.id = ?`,
      id
    );

    res.status(201).json({ ...criado, valorCentavos: Number(criado.valorCentavos) });
  });

  router.delete('/movimentacoes/:id', async (req, res) => {
    const id = Number(req.params.id);
    await db.run('DELETE FROM movimentacoes_caixa WHERE id = ?', id);
    res.json({ ok: true });
  });

  return router;
}
