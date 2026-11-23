import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import { createEventHub } from './services/events.service.js';
import { createAuthMiddleware } from './middlewares/auth.middleware.js';
import { createPublicRouter } from './routes/public.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createCaixaRouter } from './routes/caixa.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = resolve(__dirname, '..', '..', 'frontend', 'dist');

export function createApp(db, config = {}) {
  const app = express();
  const eventHub = createEventHub();
  const isProd = process.env.NODE_ENV === 'production';
  const jwtSecret = config.jwtSecret || process.env.JWT_SECRET || (isProd ? '' : 'seu-bigode-dev-secret-local');

  if (isProd && !jwtSecret) {
    throw new Error('JWT_SECRET é obrigatório em produção.');
  }

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

  // Serve o frontend compilado (usado no atalho iniciar-seu-bigode.bat e em produção)
  if (existsSync(join(FRONTEND_DIST, 'index.html'))) {
    app.use(express.static(FRONTEND_DIST));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(join(FRONTEND_DIST, 'index.html'));
    });
  }

  return app;
}

const isMainModule =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const port = Number(process.env.PORT) || 3001;
  const dbPath = process.env.DB_PATH || join(__dirname, '..', 'seu-bigode.db');

  const db = createDatabase(dbPath);
  seedDatabase(db);

  const app = createApp(db, {
    barbeariaNome: process.env.BARBEARIA_NOME || 'Seu Bigode',
    barbeariaWhatsapp: process.env.BARBEARIA_WHATSAPP || '5511999999999',
    jwtSecret: process.env.JWT_SECRET
  });

  app.listen(port, () => {
    console.log(`💈 Barbearia Seu Bigode rodando em http://localhost:${port}`);
  });
}
