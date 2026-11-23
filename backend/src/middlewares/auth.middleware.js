import { verifyToken } from '../services/auth.service.js';

export function createAuthMiddleware(db, jwtSecret) {
  return async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const token = bearerToken || queryToken;

    if (!token) {
      return res.status(401).json({ erro: 'Autenticação necessária.' });
    }

    const payload = verifyToken(token, jwtSecret);
    if (!payload?.sub) {
      return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login novamente.' });
    }

    const barbeiro = await db.get(
      'SELECT id, nome, email, papel, ativo FROM barbeiros WHERE id = ?',
      payload.sub
    );

    if (!barbeiro || !barbeiro.ativo) {
      return res.status(401).json({ erro: 'Usuário inativo ou não encontrado.' });
    }

    req.barbeiro = barbeiro;
    return next();
  };
}
