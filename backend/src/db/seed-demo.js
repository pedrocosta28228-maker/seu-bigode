import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './database.js';
import { seedDatabase } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, '..', '..', 'seu-bigode.db');
const db = await createDatabase({ dbPath });
await seedDatabase(db);

const barbeiros = await db.all('SELECT id FROM barbeiros');
for (const b of barbeiros) {
  await db.run('DELETE FROM horarios_trabalho WHERE barbeiro_id = ?', b.id);
  for (const dia of [1, 2, 3, 4, 5]) {
    await db.run(
      `INSERT INTO horarios_trabalho (barbeiro_id, dia_semana, hora_inicio, hora_fim, almoco_inicio, almoco_fim)
       VALUES (?, ?, '07:00', '19:00', '12:00', '14:00')`,
      b.id,
      dia
    );
  }
  await db.run(
    `INSERT INTO horarios_trabalho (barbeiro_id, dia_semana, hora_inicio, hora_fim, almoco_inicio, almoco_fim)
     VALUES (?, 6, '07:00', '12:00', NULL, NULL)`,
    b.id
  );
}

await db.close();
console.log('✅ Expediente atualizado no banco com sucesso.');
