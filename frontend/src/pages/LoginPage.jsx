import { useState } from 'react';
import { AlertCircle, ArrowLeft, Lock } from 'lucide-react';
import { adminApi } from '../services/adminApi.js';

export function LoginPage({ onLoginSucesso, onVoltarCliente }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const data = await adminApi.login(email, senha);
      onLoginSucesso(data.barbeiro);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-topo">
          <img
            src="/logo-seu-bigode.jpg"
            alt="Logo Seu Bigode"
            className="login-logo"
          />
          <span className="hero-selinho login-selinho">PAINEL DO BARBEIRO</span>
          <h1>Seu Bigode</h1>
          <p>Acesse sua agenda e controle de caixa.</p>
        </div>

        {erro && (
          <div className="alerta-erro" role="alert">
            <AlertCircle size={18} />
            <span>{erro}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="campo">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="campo">
            <label htmlFor="login-senha">Senha</label>
            <input
              id="login-senha"
              type="password"
              placeholder="Digite sua senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn-primario btn-full" disabled={carregando}>
            <Lock size={16} />
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <button type="button" className="btn-link-voltar" onClick={onVoltarCliente}>
          <ArrowLeft size={16} />
          Voltar ao agendamento
        </button>
      </div>
    </div>
  );
}
