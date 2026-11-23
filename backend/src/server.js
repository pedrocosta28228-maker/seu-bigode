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
import { createRateLimiter, securityHeaders } from './middlewares/security.middleware.js';
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
  const jwtSecret =
    config.jwtSecret || process.env.JWT_SECRET || (isProd ? '' : 'seu-bigode-dev-secret-local');

  if (isProd && !jwtSecret) {
    throw new Error('JWT_SECRET é obrigatório em produção.');
  }

  const requireAuth = createAuthMiddleware(db, jwtSecret);
  const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true;

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  // Proteção contra força bruta no login e spam de agendamentos
  const loginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'
  });
  const agendamentoLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Muitos agendamentos seguidos. Aguarde alguns minutos.'
  });

  app.use('/api/auth/login', loginLimiter);
  app.post('/api/public/agendamentos', agendamentoLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'seu-bigode', db: db.type });
  });

  app.use('/api/public', createPublicRouter(db, config, eventHub));
  app.use('/api/auth', createAuthRouter(db, jwtSecret, requireAuth));
  app.use('/api/admin', createAdminRouter(db, eventHub, requireAuth));
  app.use('/api/admin/caixa', createCaixaRouter(db, requireAuth));

  // Serve o frontend compilado (usado no atalho iniciar-seu-bigode.bat e em produção)
  if (existsSync(join(FRONTEND_DIST, 'index.html'))) {
    app.use(express.static(FRONTEND_DIST, { maxAge: isProd ? '1d' : 0 }));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(join(FRONTEND_DIST, 'index.html'));
    });
  }

  // Tratador global de erros — nunca vaza stack trace para o cliente
  app.use((err, _req, res, _next) => {
    console.error('Erro não tratado:', err);
    res.status(500).json({ erro: 'Erro interno no servidor.' });
  });

  return app;
}

const isMainModule =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const port = Number(process.env.PORT) || 3001;
  const dbPath = process.env.DB_PATH || join(__dirname, '..', 'seu-bigode.db');

  const db = await createDatabase({ dbPath });
  await seedDatabase(db);

  const app = createApp(db, {
    barbeariaNome: process.env.BARBEARIA_NOME || 'Seu Bigode',
    barbeariaWhatsapp: process.env.BARBEARIA_WHATSAPP || '5511999999999',
    jwtSecret: process.env.JWT_SECRET
  });

  app.listen(port, () => {
    console.log(`💈 Barbearia Seu Bigode rodando em http://localhost:${port} (banco: ${db.type})`);
  });
}
