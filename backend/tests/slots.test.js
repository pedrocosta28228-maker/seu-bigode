import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed.js';
import {
  getAvailableSlots,
  getCalendarAvailability
} from '../src/services/slots.service.js';

// Data fixa de teste: terça-feira 2026-11-24 (barbearia aberta 09:00-19:00, almoço 12:00-13:00)
const TERCA = '2026-11-24';
const DOMINGO = '2026-11-22';
const AGORA_ANTES_ABERTURA = new Date(2026, 10, 22, 8, 0, 0);

describe('Motor de Horários Livres (Seu Bigode)', () => {
  let db;

  beforeEach(() => {
    db = createDatabase(':memory:');
    seedDatabase(db);
  });

  it('retorna lista vazia em dias fechados (Domingo)', () => {
    const slots = getAvailableSlots({
      db,
      barbeiroId: 1,
      data: DOMINGO,
      duracaoMin: 30,
      agora: AGORA_ANTES_ABERTURA
    });
    assert.equal(slots.length, 0);
  });

  it('respeita o horário de almoço (12:00 às 14:00) de segunda a sexta', () => {
    const slots = getAvailableSlots({
      db,
      barbeiroId: 1,
      data: TERCA,
      duracaoMin: 30,
      agora: AGORA_ANTES_ABERTURA
    });
    const horas = slots.map((s) => s.horaInicio);

    assert.ok(horas.includes('07:00'), '07:00 é a abertura');
    assert.ok(horas.includes('11:30'), '11:30 (termina 12:00) deve estar livre');
    assert.ok(!horas.includes('12:00'), '12:00 está no almoço');
    assert.ok(!horas.includes('13:30'), '13:30 ainda está no almoço');
    assert.ok(horas.includes('14:00'), '14:00 volta do almoço');
  });

  it('funciona no sábado das 07:00 às 12:00 sem expediente à tarde', () => {
    const SABADO = '2026-11-28';
    const slots = getAvailableSlots({
      db,
      barbeiroId: 1,
      data: SABADO,
      duracaoMin: 30,
      agora: AGORA_ANTES_ABERTURA
    });
    const horas = slots.map((s) => s.horaInicio);

    assert.ok(horas.includes('07:00'));
    assert.ok(horas.includes('11:30'));
    assert.ok(!horas.includes('12:00'));
    assert.ok(!horas.includes('14:00'));
  });

  it('bloqueia horários que invadiriam o almoço para combos longos (60 min)', () => {
    const slots = getAvailableSlots({
      db,
      barbeiroId: 1,
      data: TERCA,
      duracaoMin: 60,
      agora: AGORA_ANTES_ABERTURA
    });
    const horas = slots.map((s) => s.horaInicio);

    assert.ok(horas.includes('11:00'), '11:00–12:00 cabe antes do almoço');
    assert.ok(!horas.includes('11:30'), '11:30–12:30 invadiria o almoço');
    assert.ok(!horas.includes('18:30'), '18:30–19:30 passaria do fechamento (19:00)');
    assert.ok(horas.includes('18:00'), '18:00–19:00 cabe no fim do dia');
  });

  it('isola agendamentos entre barbeiros diferentes', () => {
    // Ocupa 10:00-11:00 apenas no Barbeiro 1
    db.prepare(
      `INSERT INTO agendamentos (
        codigo, barbeiro_id, cliente_nome, cliente_whatsapp,
        data, hora_inicio, hora_fim, duracao_total_min, total_centavos
      ) VALUES ('SB-0001A', 1, 'Carlos', '11999990000', ?, '10:00', '11:00', 60, 7000)`
    ).run(TERCA);

    const slotsBarbeiro1 = getAvailableSlots({
      db,
      barbeiroId: 1,
      data: TERCA,
      duracaoMin: 30,
      agora: AGORA_ANTES_ABERTURA
    }).map((s) => s.horaInicio);

    const slotsBarbeiro2 = getAvailableSlots({
      db,
      barbeiroId: 2,
      data: TERCA,
      duracaoMin: 30,
      agora: AGORA_ANTES_ABERTURA
    }).map((s) => s.horaInicio);

    const slotsQualquer = getAvailableSlots({
      db,
      barbeiroId: 'qualquer',
      data: TERCA,
      duracaoMin: 30,
      agora: AGORA_ANTES_ABERTURA
    });

    assert.ok(!slotsBarbeiro1.includes('10:00'));
    assert.ok(!slotsBarbeiro1.includes('10:30'));
    assert.ok(slotsBarbeiro2.includes('10:00'), 'Barbeiro 2 continua livre às 10:00');
    assert.deepEqual(
      slotsQualquer.find((s) => s.horaInicio === '10:00')?.barbeirosDisponiveis,
      [2]
    );
  });

  it('gera resumo de calendário para os próximos 7 dias', () => {
    const calendario = getCalendarAvailability({
      db,
      barbeiroId: 'qualquer',
      duracaoMin: 30,
      dias: 7,
      agora: AGORA_ANTES_ABERTURA
    });

    assert.equal(calendario.length, 7);
    assert.equal(calendario[0].data, '2026-11-22'); // Domingo (fechado)
    assert.equal(calendario[0].disponivel, false);
    assert.equal(calendario[1].data, '2026-11-23'); // Segunda (aberto 07h-19h)
    assert.equal(calendario[1].disponivel, true);
    assert.equal(calendario[2].data, '2026-11-24'); // Terça (aberto)
    assert.equal(calendario[2].disponivel, true);
    assert.ok(calendario[2].totalHorariosLivres > 0);
  });
});
