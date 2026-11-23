import { Router } from 'express';
import { hashPassword, signToken, verifyPassword } from '../services/auth.service.js';

export function createAuthRouter(db, jwtSecret, requireAuth) {
  const router = Router();

  router.post('/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');

    if (!email || !senha) {
      return res.status(400).json({ erro: 'Informe email e senha.' });
    }

    const barbeiro = await db.get(
      `SELECT id, nome, especialidade, email, senha_hash, papel, ativo
       FROM barbeiros
       WHERE lower(email) = ?`,
      email
    );

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

  // Troca de senha do barbeiro autenticado
  router.patch('/senha', requireAuth, async (req, res) => {
    const senhaAtual = String(req.body?.senhaAtual || '');
    const novaSenha = String(req.body?.novaSenha || '');

    if (novaSenha.length < 4) {
      return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 4 caracteres.' });
    }

    const barbeiro = await db.get(
      'SELECT id, senha_hash FROM barbeiros WHERE id = ?',
      req.barbeiro.id
    );

    if (!barbeiro || !verifyPassword(senhaAtual, barbeiro.senha_hash)) {
      return res.status(401).json({ erro: 'Senha atual incorreta.' });
    }

    await db.run(
      'UPDATE barbeiros SET senha_hash = ? WHERE id = ?',
      hashPassword(novaSenha),
      req.barbeiro.id
    );

    return res.json({ ok: true, mensagem: 'Senha alterada com sucesso!' });
  });

  return router;
}
