import { hashPassword } from '../services/auth.service.js';

/**
 * Popula o banco com dados iniciais da Barbearia Seu Bigode
 * apenas se ainda não houver barbeiros cadastrados.
 * Também garante que barbeiros existentes sem senha recebam a senha padrão inicial.
 */
export function seedDatabase(db) {
  // Garante a linha única de configurações (Pix e WhatsApp editáveis no painel)
  const cfgExiste = db.prepare('SELECT id FROM configuracoes_barbearia WHERE id = 1').get();
  if (!cfgExiste) {
    db.prepare(
      `INSERT INTO configuracoes_barbearia (id, nome, whatsapp, pix_chave, pix_tipo, pix_titular)
       VALUES (1, 'Seu Bigode', '5511999999999', '(11) 99999-9999', 'Celular', 'Barbearia Seu Bigode')`
    ).run();
  }

  const { total } = db.prepare('SELECT COUNT(*) AS total FROM barbeiros').get();
  if (total > 0) {
    const semSenha = db.prepare('SELECT id FROM barbeiros WHERE senha_hash IS NULL').all();
    if (semSenha.length > 0) {
      const updateSenha = db.prepare('UPDATE barbeiros SET senha_hash = ? WHERE id = ?');
      for (const row of semSenha) {
        updateSenha.run(hashPassword('123456'), row.id);
      }
    }
    return;
  }

  const insertBarbeiro = db.prepare(`
    INSERT INTO barbeiros (nome, especialidade, telefone, email, senha_hash, papel, ativo)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const dono = insertBarbeiro.run(
    'Barbeiro Titular',
    'Degradê, Corte Clássico & Barba',
    '5511999999999',
    'dono@seubigode.com',
    hashPassword('123456'),
    'dono'
  );

  const barbeiro2 = insertBarbeiro.run(
    'Segundo Barbeiro',
    'Degradê, Navalhado & Sobrancelha',
    '5511988888888',
    'barbeiro2@seubigode.com',
    hashPassword('123456'),
    'barbeiro'
  );

  // Expediente real da Seu Bigode:
  // Segunda (1) a Sexta (5): 07:00 às 19:00, almoço 12:00 às 14:00
  // Sábado (6): 07:00 às 12:00 (sem pausa de almoço)
  // Domingo (0): fechado
  const insertHorario = db.prepare(`
    INSERT INTO horarios_trabalho (barbeiro_id, dia_semana, hora_inicio, hora_fim, almoco_inicio, almoco_fim)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const segASex = [1, 2, 3, 4, 5];
  for (const barbeiroId of [dono.lastInsertRowid, barbeiro2.lastInsertRowid]) {
    for (const dia of segASex) {
      insertHorario.run(barbeiroId, dia, '07:00', '19:00', '12:00', '14:00');
    }
    insertHorario.run(barbeiroId, 6, '07:00', '12:00', null, null);
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
