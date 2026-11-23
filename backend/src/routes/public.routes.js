import { Router } from 'express';
import {
  formatMinutesToTime,
  getAvailableSlots,
  getCalendarAvailability,
  isValidDateString,
  parseTimeToMinutes
} from '../services/slots.service.js';

function gerarCodigoAgendamento() {
  const numero = Math.floor(1000 + Math.random() * 9000);
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const sufixo = letras[Math.floor(Math.random() * letras.length)];
  return `SB-${numero}${sufixo}`;
}

export function createPublicRouter(db, config = {}, eventHub = null) {
  const router = Router();

  router.get('/config', async (_req, res) => {
    const cfg = await db.get(
      `SELECT nome, whatsapp, pix_chave AS "pixChave", pix_tipo AS "pixTipo", pix_titular AS "pixTitular"
       FROM configuracoes_barbearia
       WHERE id = 1`
    );

    res.json({
      nome: cfg?.nome || config.barbeariaNome || 'Seu Bigode',
      desde: 2019,
      whatsapp: cfg?.whatsapp || config.barbeariaWhatsapp || '5511999999999',
      pixChave: cfg?.pixChave || '',
      pixTipo: cfg?.pixTipo || 'Celular',
      pixTitular: cfg?.pixTitular || 'Barbearia Seu Bigode'
    });
  });

  router.get('/barbeiros', async (_req, res) => {
    const barbeiros = await db.all(
      `SELECT id, nome, especialidade, foto_url AS "fotoUrl", papel
       FROM barbeiros
       WHERE ativo = 1
       ORDER BY CASE WHEN papel = 'dono' THEN 0 ELSE 1 END, id ASC`
    );

    res.json(barbeiros);
  });

  router.get('/servicos', async (_req, res) => {
    const servicos = await db.all(
      `SELECT id, nome, descricao, categoria, duracao_min AS "duracaoMin", preco_centavos AS "precoCentavos"
       FROM servicos
       WHERE ativo = 1
       ORDER BY CASE categoria
         WHEN 'cabelo' THEN 1
         WHEN 'barba' THEN 2
         WHEN 'combo' THEN 3
         ELSE 4
       END, id ASC`
    );

    res.json(servicos);
  });

  router.get('/calendario', async (req, res) => {
    const barbeiroId = req.query.barbeiroId || 'qualquer';
    const duracaoMin = Number(req.query.duracaoMin) || 30;
    const dias = Number(req.query.dias) || 14;

    const calendario = await getCalendarAvailability({
      db,
      barbeiroId,
      duracaoMin,
      dias
    });

    res.json(calendario);
  });

  router.get('/horarios', async (req, res) => {
    const barbeiroId = req.query.barbeiroId || 'qualquer';
    const data = String(req.query.data || '');
    const duracaoMin = Number(req.query.duracaoMin) || 30;

    if (!isValidDateString(data)) {
      return res.status(400).json({ erro: 'Data inválida. Use o formato YYYY-MM-DD.' });
    }

    const horarios = await getAvailableSlots({
      db,
      barbeiroId,
      data,
      duracaoMin
    });

    res.json(horarios);
  });

  router.post('/agendamentos', async (req, res) => {
    const {
      barbeiroId = 'qualquer',
      servicoIds,
      data,
      horaInicio,
      clienteNome,
      clienteWhatsapp,
      observacoes = ''
    } = req.body || {};

    if (!Array.isArray(servicoIds) || servicoIds.length === 0) {
      return res.status(400).json({ erro: 'Selecione pelo menos um serviço.' });
    }

    if (!isValidDateString(String(data || ''))) {
      return res.status(400).json({ erro: 'Data inválida.' });
    }

    if (!/^\d{2}:\d{2}$/.test(String(horaInicio || ''))) {
      return res.status(400).json({ erro: 'Horário inválido.' });
    }

    const nomeLimpo = String(clienteNome || '').trim();
    const whatsappLimpo = String(clienteWhatsapp || '').replace(/\D/g, '');

    if (nomeLimpo.length < 2) {
      return res.status(400).json({ erro: 'Informe seu nome para confirmar.' });
    }

    if (whatsappLimpo.length < 10) {
      return res.status(400).json({ erro: 'Informe um WhatsApp válido com DDD.' });
    }

    const idsUnicos = [...new Set(servicoIds.map(Number).filter(Number.isInteger))];
    if (idsUnicos.length === 0) {
      return res.status(400).json({ erro: 'Serviços inválidos.' });
    }

    const placeholders = idsUnicos.map(() => '?').join(', ');
    const servicos = await db.all(
      `SELECT id, nome, duracao_min AS "duracaoMin", preco_centavos AS "precoCentavos"
       FROM servicos
       WHERE ativo = 1 AND id IN (${placeholders})`,
      ...idsUnicos
    );

    if (servicos.length !== idsUnicos.length) {
      return res.status(400).json({ erro: 'Um ou mais serviços selecionados não estão disponíveis.' });
    }

    const duracaoTotalMin = servicos.reduce((acc, s) => acc + Number(s.duracaoMin), 0);
    const totalCentavos = servicos.reduce((acc, s) => acc + Number(s.precoCentavos), 0);
    const horaFim = formatMinutesToTime(parseTimeToMinutes(horaInicio) + duracaoTotalMin);

    try {
      const resultado = await db.transaction(async (tx) => {
        const slotsLivres = await getAvailableSlots({
          db: tx,
          barbeiroId,
          data,
          duracaoMin: duracaoTotalMin
        });

        const slotEscolhido = slotsLivres.find((s) => s.horaInicio === horaInicio);
        if (!slotEscolhido) {
          return { conflito: true };
        }

        const barbeiroEscolhidoId =
          barbeiroId === 'qualquer' ? slotEscolhido.barbeirosDisponiveis[0] : Number(barbeiroId);

        const codigo = gerarCodigoAgendamento();

        const agendamentoId = await tx.insert(
          `INSERT INTO agendamentos (
            codigo, barbeiro_id, cliente_nome, cliente_whatsapp,
            data, hora_inicio, hora_fim, duracao_total_min, total_centavos, observacoes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          codigo,
          barbeiroEscolhidoId,
          nomeLimpo,
          whatsappLimpo,
          data,
          horaInicio,
          horaFim,
          duracaoTotalMin,
          totalCentavos,
          String(observacoes || '').trim() || null
        );

        for (const servico of servicos) {
          await tx.run(
            `INSERT INTO agendamento_servicos (
              agendamento_id, servico_id, nome_snapshot, preco_centavos_snapshot, duracao_min_snapshot
            ) VALUES (?, ?, ?, ?, ?)`,
            agendamentoId,
            servico.id,
            servico.nome,
            servico.precoCentavos,
            servico.duracaoMin
          );
        }

        const barbeiro = await tx.get(
          'SELECT id, nome FROM barbeiros WHERE id = ?',
          barbeiroEscolhidoId
        );

        return {
          conflito: false,
          resposta: {
            id: agendamentoId,
            codigo,
            barbeiro,
            clienteNome: nomeLimpo,
            clienteWhatsapp: whatsappLimpo,
            data,
            horaInicio,
            horaFim,
            duracaoTotalMin,
            totalCentavos,
            servicos,
            status: 'agendado'
          }
        };
      });

      if (resultado.conflito) {
        return res.status(409).json({
          erro: 'Ops! Esse horário acabou de ser ocupado. Escolha outro horário disponível.'
        });
      }

      eventHub?.broadcast('novo_agendamento', resultado.resposta);
      return res.status(201).json(resultado.resposta);
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      return res.status(500).json({ erro: 'Não foi possível concluir o agendamento.' });
    }
  });

  return router;
}
