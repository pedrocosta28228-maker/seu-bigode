import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed.js';
import { createApp } from '../src/server.js';

describe('API Pública de Agendamento (Seu Bigode)', () => {
  let server;
  let baseUrl;
  let db;

  before(async () => {
    db = createDatabase(':memory:');
    seedDatabase(db);
    const app = createApp(db);

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('lista barbeiros e serviços iniciais', async () => {
    const [resBarbeiros, resServicos] = await Promise.all([
      fetch(`${baseUrl}/api/public/barbeiros`),
      fetch(`${baseUrl}/api/public/servicos`)
    ]);

    assert.equal(resBarbeiros.status, 200);
    assert.equal(resServicos.status, 200);

    const barbeiros = await resBarbeiros.json();
    const servicos = await resServicos.json();

    assert.equal(barbeiros.length, 2);
    assert.ok(servicos.length >= 5);
  });

  it('cria agendamento e impede horário duplicado (409 Conflict)', async () => {
    const calRes = await fetch(`${baseUrl}/api/public/calendario?barbeiroId=1&duracaoMin=45&dias=14`);
    const calendario = await calRes.json();
    const diaDisponivel = calendario.find((d) => d.disponivel);
    assert.ok(diaDisponivel, 'Deve existir ao menos um dia disponível nos próximos 14 dias');

    const horRes = await fetch(
      `${baseUrl}/api/public/horarios?barbeiroId=1&data=${diaDisponivel.data}&duracaoMin=45`
    );
    const horarios = await horRes.json();
    assert.ok(horarios.length > 0);

    const payload = {
      barbeiroId: 1,
      servicoIds: [1, 4], // Corte Tradicional (30m) + Sobrancelha (15m) = 45m, R$ 55,00
      data: diaDisponivel.data,
      horaInicio: horarios[0].horaInicio,
      clienteNome: 'João Silva',
      clienteWhatsapp: '11999998888'
    };

    const res1 = await fetch(`${baseUrl}/api/public/agendamentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res1.status, 201);
    const agendamento = await res1.json();
    assert.match(agendamento.codigo, /^SB-\d{4}[A-Z]$/);
    assert.equal(agendamento.duracaoTotalMin, 45);
    assert.equal(agendamento.totalCentavos, 5500);

    // Tentativa duplicada no mesmo barbeiro e horário deve falhar com 409
    const res2 = await fetch(`${baseUrl}/api/public/agendamentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res2.status, 409);
  });
});
