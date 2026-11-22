/**
 * Popula o banco com dados iniciais da Barbearia Seu Bigode
 * apenas se ainda não houver barbeiros cadastrados.
 */
export function seedDatabase(db) {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM barbeiros').get();
  if (total > 0) return;

  const insertBarbeiro = db.prepare(`
    INSERT INTO barbeiros (nome, especialidade, telefone, email, papel, ativo)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const dono = insertBarbeiro.run(
    'Barbeiro Titular',
    'Degradê, Corte Clássico & Barba',
    '5511999999999',
    'dono@seubigode.com',
    'dono'
  );

  const barbeiro2 = insertBarbeiro.run(
    'Segundo Barbeiro',
    'Degradê, Navalhado & Sobrancelha',
    '5511988888888',
    'barbeiro2@seubigode.com',
    'barbeiro'
  );

  // Expediente padrão: Terça (2) a Sábado (6), 09:00 às 19:00, almoço 12:00 às 13:00
  const insertHorario = db.prepare(`
    INSERT INTO horarios_trabalho (barbeiro_id, dia_semana, hora_inicio, hora_fim, almoco_inicio, almoco_fim)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const diasUteis = [2, 3, 4, 5, 6];
  for (const barbeiroId of [dono.lastInsertRowid, barbeiro2.lastInsertRowid]) {
    for (const dia of diasUteis) {
      insertHorario.run(barbeiroId, dia, '09:00', '19:00', '12:00', '13:00');
    }
  }

  // Catálogo inicial (valores em centavos para precisão exata)
  const insertServico = db.prepare(`
    INSERT INTO servicos (nome, descricao, categoria, duracao_min, preco_centavos, ativo)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const servicosIniciais = [
    ['Corte Tradicional', 'Tesoura e máquina com acabamento na navalha', 'cabelo', 30, 4000],
    ['Corte Degradê', 'Fade limpo com transição suave e finalização', 'cabelo', 45, 4500],
    ['Barba Completa', 'Toalha quente, desenho na navalha e pós-barba', 'barba', 30, 3500],
    ['Sobrancelha', 'Limpeza e alinhamento na navalha', 'extra', 15, 1500],
    ['Hidratação Capilar', 'Tratamento nutritivo para brilho e maciez', 'extra', 15, 3000],
    ['Combo Corte + Barba', 'Corte completo (tradicional ou degradê) + barba', 'combo', 60, 7000]
  ];

  for (const servico of servicosIniciais) {
    insertServico.run(...servico);
  }
}
