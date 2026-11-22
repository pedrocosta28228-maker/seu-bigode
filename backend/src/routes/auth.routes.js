import { Router } from 'express';
import { signToken, verifyPassword } from '../services/auth.service.js';

export function createAuthRouter(db, jwtSecret, requireAuth) {
  const router = Router();

  router.post('/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');

    if (!email || !senha) {
      return res.status(400).json({ erro: 'Informe email e senha.' });
    }

    const barbeiro = db
      .prepare(
        `SELECT id, nome, especialidade, email, senha_hash, papel, ativo
         FROM barbeiros
         WHERE lower(email) = ?`
      )
      .get(email);

    if (!barbeiro || !barbeiro.ativo || !verifyPassword(senha, barbeiro.senha_hash)) {
      return res.status(401).json({ erro: 'Email ou senha inválidos.' });
    }

    const token = signToken(
      { sub: barbeiro.id, papel: barbeiro.papel, nome: barbeiro.nome },
      jwtSecret
    );

    return res.json({
      token,
      barbeiro: {
        id: barbeiro.id,
        nome: barbeiro.nome,
        especialidade: barbeiro.especialidade,
        email: barbeiro.email,
        papel: barbeiro.papel
      }
    });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ barbeiro: req.barbeiro });
  });

  return router;
}
