import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './database.js';
import { seedDatabase } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, '..', '..', 'seu-bigode.db');
const db = createDatabase(dbPath);
seedDatabase(db);

// 1. Atualiza o expediente de todos os barbeiros para o horário real da Seu Bigode:
// Seg a Sex: 07:00-19:00 (almoço 12:00-14:00) | Sábado: 07:00-12:00 | Domingo: fechado
const barbeiros = db.prepare('SELECT id FROM barbeiros').all();
const deleteHorarios = db.prepare('DELETE FROM horarios_trabalho WHERE barbeiro_id = ?');
const insertHorario = db.prepare(`
  INSERT INTO horarios_trabalho (barbeiro_id, dia_semana, hora_inicio, hora_fim, almoco_inicio, almoco_fim)
  VALUES (?, ?, ?, ?, ?, ?)
`);

for (const b of barbeiros) {
  deleteHorarios.run(b.id);
  for (const dia of [1, 2, 3, 4, 5]) {
    insertHorario.run(b.id, dia, '07:00', '19:00', '12:00', '14:00');
  }
  insertHorario.run(b.id, 6, '07:00', '12:00', null, null);
}

// 2. Injeta agendamentos de demonstração de 23/11/2026 em diante (Novembro e Dezembro)
const demoAgendamentos = [
  {
    codigo: 'SB-2001A',
    barbeiroId: 1,
    clienteNome: 'Matheus Oliveira',
    clienteWhatsapp: '11991112222',
    data: '2026-11-23',
    horaInicio: '08:00',
    horaFim: '08:45',
    duracao: 45,
    total: 4500,
    status: 'confirmado',
    obs: 'Degradê baixo na 0.5',
    servicos: [{ id: 2, nome: 'Corte Degradê', preco: 4500, duracao: 45 }]
  },
  {
    codigo: 'SB-2002B',
    barbeiroId: 2,
    clienteNome: 'Rafael Santos',
    clienteWhatsapp: '11992223333',
    data: '2026-11-23',
    horaInicio: '10:00',
    horaFim: '11:00',
    duracao: 60,
    total: 7000,
    status: 'agendado',
    obs: null,
    servicos: [{ id: 6, nome: 'Combo Corte + Barba', preco: 7000, duracao: 60 }]
  },
  {
    codigo: 'SB-2003C',
    barbeiroId: 1,
    clienteNome: 'Gabriel Costa',
    clienteWhatsapp: '11993334444',
    data: '2026-11-23',
    horaInicio: '15:00',
    horaFim: '15:45',
    duracao: 45,
    total: 5500,
    status: 'agendado',
    obs: 'Sobrancelha bem natural',
    servicos: [
      { id: 1, nome: 'Corte Tradicional', preco: 4000, duracao: 30 },
      { id: 4, nome: 'Sobrancelha', preco: 1500, duracao: 15 }
    ]
  },
  {
    codigo: 'SB-2004D',
    barbeiroId: 1,
    clienteNome: 'Bruno Almeida',
    clienteWhatsapp: '11994445555',
    data: '2026-11-24',
    horaInicio: '09:00',
    horaFim: '10:00',
    duracao: 60,
    total: 7000,
    status: 'confirmado',
    obs: 'Toalha quente na barba',
    servicos: [{ id: 6, nome: 'Combo Corte + Barba', preco: 7000, duracao: 60 }]
  },
  {
    codigo: 'SB-2005E',
    barbeiroId: 2,
    clienteNome: 'Thiago Ferreira',
    clienteWhatsapp: '11995556666',
    data: '2026-11-25',
    horaInicio: '14:30',
    horaFim: '15:00',
    duracao: 30,
    total: 3500,
    status: 'agendado',
    obs: null,
    servicos: [{ id: 3, nome: 'Barba Completa', preco: 3500, duracao: 30 }]
  },
  {
    codigo: 'SB-2006F',
    barbeiroId: 1,
    clienteNome: 'Lucas Pereira',
    clienteWhatsapp: '11996667777',
    data: '2026-11-27',
    horaInicio: '17:00',
    horaFim: '18:00',
    duracao: 60,
    total: 7500,
    status: 'confirmado',
    obs: 'Corte pro fim de semana',
    servicos: [
      { id: 2, nome: 'Corte Degradê', preco: 4500, duracao: 45 },
      { id: 5, nome: 'Hidratação Capilar', preco: 3000, duracao: 15 }
    ]
  },
  {
    codigo: 'SB-2007G',
    barbeiroId: 1,
    clienteNome: 'Diego Mendes',
    clienteWhatsapp: '11997778888',
    data: '2026-11-28',
    horaInicio: '08:00',
    horaFim: '09:00',
    duracao: 60,
    total: 7000,
    status: 'confirmado',
    obs: 'Sábado cedo',
    servicos: [{ id: 6, nome: 'Combo Corte + Barba', preco: 7000, duracao: 60 }]
  },
  {
    codigo: 'SB-2008H',
    barbeiroId: 2,
    clienteNome: 'Felipe Rocha',
    clienteWhatsapp: '11998889999',
    data: '2026-11-28',
    horaInicio: '10:00',
    horaFim: '10:45',
    duracao: 45,
    total: 4500,
    status: 'agendado',
    obs: null,
    servicos: [{ id: 2, nome: 'Corte Degradê', preco: 4500, duracao: 45 }]
  },
  // Dezembro de 2026
  {
    codigo: 'SB-2009J',
    barbeiroId: 1,
    clienteNome: 'Gustavo Lima',
    clienteWhatsapp: '11991234567',
    data: '2026-12-01',
    horaInicio: '09:30',
    horaFim: '10:30',
    duracao: 60,
    total: 7000,
    status: 'confirmado',
    obs: null,
    servicos: [{ id: 6, nome: 'Combo Corte + Barba', preco: 7000, duracao: 60 }]
  },
  {
    codigo: 'SB-2010K',
    barbeiroId: 2,
    clienteNome: 'Vinícius Souza',
    clienteWhatsapp: '11992345678',
    data: '2026-12-03',
    horaInicio: '16:00',
    horaFim: '16:45',
    duracao: 45,
    total: 5500,
    status: 'agendado',
    obs: null,
    servicos: [
      { id: 1, nome: 'Corte Tradicional', preco: 4000, duracao: 30 },
      { id: 4, nome: 'Sobrancelha', preco: 1500, duracao: 15 }
    ]
  },
  {
    codigo: 'SB-2011L',
    barbeiroId: 1,
    clienteNome: 'André Cardoso',
    clienteWhatsapp: '11993456789',
    data: '2026-12-05',
    horaInicio: '09:00',
    horaFim: '10:00',
    duracao: 60,
    total: 7000,
    status: 'agendado',
    obs: 'Sábado de manhã',
    servicos: [{ id: 6, nome: 'Combo Corte + Barba', preco: 7000, duracao: 60 }]
  }
];

const existeCodigo = db.prepare('SELECT id FROM agendamentos WHERE codigo = ?');
const insertAg = db.prepare(`
  INSERT INTO agendamentos (
    codigo, barbeiro_id, cliente_nome, cliente_whatsapp,
    data, hora_inicio, hora_fim, duracao_total_min, total_centavos, status, observacoes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertItem = db.prepare(`
  INSERT INTO agendamento_servicos (
    agendamento_id, servico_id, nome_snapshot, preco_centavos_snapshot, duracao_min_snapshot
  ) VALUES (?, ?, ?, ?, ?)
`);

let inseridos = 0;
for (const ag of demoAgendamentos) {
  if (existeCodigo.get(ag.codigo)) continue;
  const res = insertAg.run(
    ag.codigo,
    ag.barbeiroId,
    ag.clienteNome,
    ag.clienteWhatsapp,
    ag.data,
    ag.horaInicio,
    ag.horaFim,
    ag.duracao,
    ag.total,
    ag.status,
    ag.obs
  );
  const agId = Number(res.lastInsertRowid);
  for (const s of ag.servicos) {
    insertItem.run(agId, s.id, s.nome, s.preco, s.duracao);
  }
  inseridos++;
}

console.log(`✅ Expediente atualizado (Seg–Sex 07h–19h almoço 12h–14h | Sáb 07h–12h).`);
console.log(`✅ ${inseridos} agendamentos de demonstração injetados (Novembro e Dezembro/2026).`);

// 3. Injeta movimentações de demonstração nos últimos dias (somente se o caixa estiver vazio)
const { totalMovs } = db.prepare('SELECT COUNT(*) AS totalMovs FROM movimentacoes_caixa').get();
if (totalMovs === 0) {
  const insertMov = db.prepare(`
    INSERT INTO movimentacoes_caixa (
      agendamento_id, barbeiro_id, tipo, forma_pagamento, valor_centavos, descricao, data_hora
    ) VALUES (NULL, ?, ?, ?, ?, ?, ?)
  `);

  const demoCaixa = [
    [1, 'entrada', 'pix', 7000, 'Atendimento avulso — Combo Corte + Barba', '2026-11-17 10:30:00'],
    [2, 'entrada', 'dinheiro', 4500, 'Atendimento avulso — Corte Degradê', '2026-11-18 15:00:00'],
    [1, 'entrada', 'cartao', 5500, 'Atendimento — Corte + Sobrancelha', '2026-11-19 11:15:00'],
    [2, 'entrada', 'pix', 7000, 'Atendimento — Combo Corte + Barba', '2026-11-20 16:40:00'],
    [1, 'entrada', 'pix', 7500, 'Atendimento — Degradê + Hidratação', '2026-11-21 09:20:00'],
    [2, 'entrada', 'dinheiro', 4000, 'Atendimento avulso — Corte Tradicional', '2026-11-21 11:00:00'],
    [1, 'saida', 'pix', 3500, 'Reposição de lâminas e pós-barba', '2026-11-21 11:45:00']
  ];

  for (const m of demoCaixa) {
    insertMov.run(...m);
  }
  console.log(`✅ ${demoCaixa.length} movimentações de exemplo injetadas no Caixa.`);
}
