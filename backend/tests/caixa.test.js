import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed.js';
import { createApp } from '../src/server.js';

describe('API de Caixa e Estatísticas (Fase 3)', () => {
  let server;
  let baseUrl;
  let db;
  let token;

  before(async () => {
    db = await createDatabase(':memory:');
    await seedDatabase(db);
    const app = createApp(db, { jwtSecret: 'test-secret-caixa' });

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dono@seubigode.com', senha: '123456' })
    });
    token = (await loginRes.json()).token;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('lança automaticamente no caixa ao concluir um agendamento (sem duplicar)', async () => {
    const calRes = await fetch(`${baseUrl}/api/public/calendario?barbeiroId=1&duracaoMin=30&dias=14`);
    const dia = (await calRes.json()).find((d) => d.disponivel);
    const horRes = await fetch(`${baseUrl}/api/public/horarios?barbeiroId=1&data=${dia.data}&duracaoMin=30`);
    const horarios = await horRes.json();

    const agRes = await fetch(`${baseUrl}/api/public/agendamentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        barbeiroId: 1,
        servicoIds: [1], // Corte Tradicional R$ 40,00
        data: dia.data,
        horaInicio: horarios[0].horaInicio,
        clienteNome: 'Cliente Caixa',
        clienteWhatsapp: '11977776666'
      })
    });
    const ag = await agRes.json();

    // Conclui com Pix
    const conclRes = await fetch(`${baseUrl}/api/admin/agendamentos/${ag.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'concluido', formaPagamento: 'pix' })
    });
    assert.equal(conclRes.status, 200);
    const conclBody = await conclRes.json();
    assert.equal(conclBody.lancadoNoCaixa, true);

    // Chamar novamente não deve duplicar entrada
    const conclRes2 = await fetch(`${baseUrl}/api/admin/agendamentos/${ag.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'concluido', formaPagamento: 'pix' })
    });
    assert.equal((await conclRes2.json()).lancadoNoCaixa, false);

    // Confere resumo do caixa
    const resumo = await (
      await fetch(`${baseUrl}/api/admin/caixa/resumo`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    ).json();
    assert.equal(resumo.hoje.entradasCentavos, 4000);
    assert.equal(resumo.hoje.qtdEntradas, 1);
  });

  it('registra atendimento avulso e saída/despesa calculando saldo líquido', async () => {
    // Entrada avulsa R$ 45,00 (dinheiro) no Barbeiro 2
    const avulsoRes = await fetch(`${baseUrl}/api/admin/caixa/movimentacoes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        barbeiroId: 2,
        tipo: 'entrada',
        formaPagamento: 'dinheiro',
        valorCentavos: 4500,
        descricao: 'Atendimento avulso — Corte Degradê'
      })
    });
    assert.equal(avulsoRes.status, 201);

    // Saída / Despesa R$ 20,00 (pix)
    const saidaRes = await fetch(`${baseUrl}/api/admin/caixa/movimentacoes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        barbeiroId: 1,
        tipo: 'saida',
        formaPagamento: 'pix',
        valorCentavos: 2000,
        descricao: 'Compra de lâminas'
      })
    });
    assert.equal(saidaRes.status, 201);

    const resumo = await (
      await fetch(`${baseUrl}/api/admin/caixa/resumo`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    ).json();

    assert.equal(resumo.hoje.entradasCentavos, 8500);
    assert.equal(resumo.hoje.saidasCentavos, 2000);
    assert.equal(resumo.hoje.saldoCentavos, 6500);
    assert.equal(resumo.serie7Dias.length, 7);
    assert.equal(resumo.porBarbeiro.length, 2);
  });
});
