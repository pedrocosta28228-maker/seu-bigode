import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import { createEventHub } from './services/events.service.js';
import { createAuthMiddleware } from './middlewares/auth.middleware.js';
import { createPublicRouter } from './routes/public.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createCaixaRouter } from './routes/caixa.routes.js';

export function createApp(db, config = {}) {
  const app = express();
  const eventHub = createEventHub();
  const jwtSecret = config.jwtSecret || process.env.JWT_SECRET || 'seu-bigode-dev-secret-local';
  const requireAuth = createAuthMiddleware(db, jwtSecret);

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'seu-bigode' });
  });

  app.use('/api/public', createPublicRouter(db, config, eventHub));
  app.use('/api/auth', createAuthRouter(db, jwtSecret, requireAuth));
  app.use('/api/admin', createAdminRouter(db, eventHub, requireAuth));
  app.use('/api/admin/caixa', createCaixaRouter(db, requireAuth));

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
    barbeariaWhatsapp: process.env.BARBEARIA_WHATSAPP || '5511999999999',
    jwtSecret: process.env.JWT_SECRET || 'seu-bigode-dev-secret-local'
  });

  app.listen(port, () => {
    console.log(`💈 API Seu Bigode rodando em http://localhost:${port}`);
  });
}
