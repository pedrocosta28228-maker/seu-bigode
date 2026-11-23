import { useEffect, useState } from 'react';
import { AgendarPage } from './pages/AgendarPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { adminApi, getStoredToken } from './services/adminApi.js';

function getRotaAtual() {
  return window.location.pathname.startsWith('/admin') ? 'admin' : 'cliente';
}

export default function App() {
  const [rota, setRota] = useState(getRotaAtual);
  const [barbeiro, setBarbeiro] = useState(null);
  const [verificandoSessao, setVerificandoSessao] = useState(true);

  useEffect(() => {
    const onPopState = () => setRota(getRotaAtual());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let ativo = true;
    async function verificar() {
      if (!getStoredToken()) {
        if (ativo) setVerificandoSessao(false);
        return;
      }
      try {
        const data = await adminApi.me();
        if (ativo) setBarbeiro(data.barbeiro);
      } catch {
        adminApi.logout();
      } finally {
        if (ativo) setVerificandoSessao(false);
      }
    }
    verificar();
    return () => {
      ativo = false;
    };
  }, []);

  function navegar(destino) {
    const path = destino === 'admin' ? '/admin' : '/';
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setRota(destino);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleLogout() {
    adminApi.logout();
    setBarbeiro(null);
  }

  if (rota === 'admin') {
    if (verificandoSessao) {
      return (
        <div className="login-shell">
          <div className="estado-vazio">Verificando sessão...</div>
        </div>
      );
    }

    if (!barbeiro) {
      return (
        <LoginPage
          onLoginSucesso={(b) => setBarbeiro(b)}
          onVoltarCliente={() => navegar('cliente')}
        />
      );
    }

    return (
      <AdminPage
        barbeiroLogado={barbeiro}
        onAtualizarBarbeiroLogado={setBarbeiro}
        onLogout={handleLogout}
        onIrCliente={() => navegar('cliente')}
      />
    );
  }

  return <AgendarPage />;
}
