import { hashPassword } from '../services/auth.service.js';

/**
 * Popula o banco com dados iniciais da Barbearia Seu Bigode
 * apenas se ainda não houver barbeiros cadastrados.
 */
export async function seedDatabase(db) {
  const cfgExiste = await db.get('SELECT id FROM configuracoes_barbearia WHERE id = 1');
  if (!cfgExiste) {
    await db.run(
      `INSERT INTO configuracoes_barbearia (id, nome, whatsapp, pix_chave, pix_tipo, pix_titular)
       VALUES (1, 'Seu Bigode', '5511999999999', '(11) 99999-9999', 'Celular', 'Barbearia Seu Bigode')`
    );
  }

  const row = await db.get('SELECT COUNT(*) AS total FROM barbeiros');
  if (Number(row?.total || 0) > 0) {
    const semSenha = await db.all('SELECT id FROM barbeiros WHERE senha_hash IS NULL');
    for (const b of semSenha) {
      await db.run('UPDATE barbeiros SET senha_hash = ? WHERE id = ?', hashPassword('123456'), b.id);
    }
    return;
  }

  const donoId = await db.insert(
    `INSERT INTO barbeiros (nome, especialidade, telefone, email, senha_hash, papel, ativo)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    'Barbeiro Titular',
    'Degradê, Corte Clássico & Barba',
    '5511999999999',
    'dono@seubigode.com',
    hashPassword('123456'),
    'dono'
  );

  const barbeiro2Id = await db.insert(
    `INSERT INTO barbeiros (nome, especialidade, telefone, email, senha_hash, papel, ativo)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    'Segundo Barbeiro',
    'Degradê, Navalhado & Sobrancelha',
    '5511988888888',
    'barbeiro2@seubigode.com',
    hashPassword('123456'),
    'barbeiro'
  );

  // Expediente real da Seu Bigode:
  // Seg a Sex: 07:00 às 19:00 (almoço 12:00 às 14:00) | Sábado: 07:00 às 12:00 | Domingo: fechado
  for (const barbeiroId of [donoId, barbeiro2Id]) {
    for (const dia of [1, 2, 3, 4, 5]) {
      await db.run(
        `INSERT INTO horarios_trabalho (barbeiro_id, dia_semana, hora_inicio, hora_fim, almoco_inicio, almoco_fim)
         VALUES (?, ?, ?, ?, ?, ?)`,
        barbeiroId,
        dia,
        '07:00',
        '19:00',
        '12:00',
        '14:00'
      );
    }
    await db.run(
      `INSERT INTO horarios_trabalho (barbeiro_id, dia_semana, hora_inicio, hora_fim, almoco_inicio, almoco_fim)
       VALUES (?, ?, ?, ?, ?, ?)`,
      barbeiroId,
      6,
      '07:00',
      '12:00',
      null,
      null
    );
  }

  const servicosIniciais = [
    ['Corte Tradicional', 'Tesoura e máquina com acabamento na navalha', 'cabelo', 30, 4000],
    ['Corte Degradê', 'Fade limpo com transição suave e finalização', 'cabelo', 45, 4500],
    ['Barba Completa', 'Toalha quente, desenho na navalha e pós-barba', 'barba', 30, 3500],
    ['Sobrancelha', 'Limpeza e alinhamento na navalha', 'extra', 15, 1500],
    ['Hidratação Capilar', 'Tratamento nutritivo para brilho e maciez', 'extra', 15, 3000],
    ['Combo Corte + Barba', 'Corte completo (tradicional ou degradê) + barba', 'combo', 60, 7000]
  ];

  for (const s of servicosIniciais) {
    await db.run(
      `INSERT INTO servicos (nome, descricao, categoria, duracao_min, preco_centavos, ativo)
       VALUES (?, ?, ?, ?, ?, 1)`,
      ...s
    );
  }
}
