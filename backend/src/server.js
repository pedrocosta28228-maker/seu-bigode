import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import { createPublicRouter } from './routes/public.routes.js';

export function createApp(db, config = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'seu-bigode' });
  });

  app.use('/api/public', createPublicRouter(db, config));

  return app;
}

const isMainModule =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const port = Number(process.env.PORT) || 3001;
  const dbPath = process.env.DB_PATH || './seu-bigode.db';

  const db = createDatabase(dbPath);
  seedDatabase(db);

  const app = createApp(db, {
    barbeariaNome: process.env.BARBEARIA_NOME || 'Seu Bigode',
    barbeariaWhatsapp: process.env.BARBEARIA_WHATSAPP || '5511999999999'
  });

  app.listen(port, () => {
    console.log(`💈 API Seu Bigode rodando em http://localhost:${port}`);
  });
}
