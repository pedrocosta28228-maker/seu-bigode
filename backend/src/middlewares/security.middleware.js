/**
 * Middlewares leves de segurança (sem dependências extras):
 * - Headers HTTP de proteção (estilo Helmet)
 * - Rate limiter em memória por IP para proteger login e criação de agendamentos
 * - Controle de permissão por papel (ex.: apenas 'dono')
 */

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
}

export function createRateLimiter({ windowMs = 60_000, max = 30, message = 'Muitas requisições. Tente novamente em instantes.' } = {}) {
  const buckets = new Map();

  // Limpeza periódica para evitar crescimento infinito de memória
  const cleanup = setInterval(() => {
    const agora = Date.now();
    for (const [ip, info] of buckets.entries()) {
      if (info.resetAt <= agora) buckets.delete(ip);
    }
  }, windowMs);
  cleanup.unref?.();

  return function rateLimitMiddleware(req, res, next) {
    // Não bloqueia testes automatizados locais
    if (process.env.NODE_ENV === 'test') return next();

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const agora = Date.now();
    const atual = buckets.get(ip);

    if (!atual || atual.resetAt <= agora) {
      buckets.set(ip, { count: 1, resetAt: agora + windowMs });
      return next();
    }

    atual.count += 1;
    if (atual.count > max) {
      return res.status(429).json({ erro: message });
    }
    return next();
  };
}

export function requireRole(papelPermitido) {
  return function roleMiddleware(req, res, next) {
    if (req.barbeiro?.papel !== papelPermitido) {
      return res.status(403).json({ erro: 'Apenas o dono da barbearia tem permissão para esta ação.' });
    }
    return next();
  };
}
