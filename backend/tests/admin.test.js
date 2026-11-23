import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed.js';
import { createApp } from '../src/server.js';

describe('API Administrativa do Barbeiro (Fase 2)', () => {
  let server;
  let baseUrl;
  let db;
  let token;

  before(async () => {
    db = await createDatabase(':memory:');
    await seedDatabase(db);
    const app = createApp(db, { jwtSecret: 'test-secret-seu-bigode' });

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

  it('bloqueia rotas /api/admin sem token (401)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/agendamentos`);
    assert.equal(res.status, 401);
  });

  it('autentica barbeiro com email e senha válidos e rejeita senha errada', async () => {
    const resErrada = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dono@seubigode.com', senha: 'errada' })
    });
    assert.equal(resErrada.status, 401);

    const resOk = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dono@seubigode.com', senha: '123456' })
    });
    assert.equal(resOk.status, 200);
    const body = await resOk.json();
    assert.ok(body.token);
    assert.equal(body.barbeiro.papel, 'dono');
    token = body.token;
  });

  it('lista agendamentos e permite atualizar status', async () => {
    // Cria um agendamento público primeiro
    const calRes = await fetch(`${baseUrl}/api/public/calendario?barbeiroId=1&duracaoMin=30&dias=14`);
    const dia = (await calRes.json()).find((d) => d.disponivel);
    const horRes = await fetch(`${baseUrl}/api/public/horarios?barbeiroId=1&data=${dia.data}&duracaoMin=30`);
    const horarios = await horRes.json();

    const agRes = await fetch(`${baseUrl}/api/public/agendamentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        barbeiroId: 1,
        servicoIds: [1],
        data: dia.data,
        horaInicio: horarios[0].horaInicio,
        clienteNome: 'Marcos Teste',
        clienteWhatsapp: '11988887777'
      })
    });
    const criado = await agRes.json();

    // Consulta pela agenda do barbeiro
    const listRes = await fetch(`${baseUrl}/api/admin/agendamentos?data=${dia.data}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(listRes.status, 200);
    const agenda = await listRes.json();
    assert.equal(agenda.agendamentos.length, 1);
    assert.equal(agenda.agendamentos[0].codigo, criado.codigo);

    // Atualiza status para confirmado
    const patchRes = await fetch(`${baseUrl}/api/admin/agendamentos/${criado.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'confirmado' })
    });
    assert.equal(patchRes.status, 200);
    assert.equal((await patchRes.json()).status, 'confirmado');
  });

  it('cadastra novo barbeiro, novo serviço e bloqueio de folga', async () => {
    // 1. Novo barbeiro
    const barbRes = await fetch(`${baseUrl}/api/admin/barbeiros`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        nome: 'Terceiro Barbeiro',
        especialidade: 'Barba e Pigmentação',
        email: 'barbeiro3@seubigode.com',
        senha: '123456'
      })
    });
    assert.equal(barbRes.status, 201);

    const pubBarbeiros = await (await fetch(`${baseUrl}/api/public/barbeiros`)).json();
    assert.equal(pubBarbeiros.length, 3);

    // 2. Novo serviço
    const servRes = await fetch(`${baseUrl}/api/admin/servicos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        nome: 'Platinado',
        categoria: 'extra',
        duracaoMin: 60,
        precoCentavos: 9000
      })
    });
    assert.equal(servRes.status, 201);

    // 3. Bloqueio de folga remove horário da tela pública
    const calRes = await fetch(`${baseUrl}/api/public/calendario?barbeiroId=2&duracaoMin=30&dias=14`);
    const dia = (await calRes.json()).find((d) => d.disponivel);

    const bloqRes = await fetch(`${baseUrl}/api/admin/bloqueios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        barbeiroId: 2,
        data: dia.data,
        horaInicio: '07:00',
        horaFim: '19:00',
        motivo: 'Folga de teste'
      })
    });
    assert.equal(bloqRes.status, 201);

    const horariosDepois = await (
      await fetch(`${baseUrl}/api/public/horarios?barbeiroId=2&data=${dia.data}&duracaoMin=30`)
    ).json();
    assert.equal(horariosDepois.length, 0);
  });

  it('permite trocar a senha do barbeiro autenticado', async () => {
    const res = await fetch(`${baseUrl}/api/auth/senha`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ senhaAtual: '123456', novaSenha: 'nova-senha-segura' })
    });
    assert.equal(res.status, 200);

    const loginNovo = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dono@seubigode.com', senha: 'nova-senha-segura' })
    });
    assert.equal(loginNovo.status, 200);
  });
});
