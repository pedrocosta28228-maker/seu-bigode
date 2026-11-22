const TOKEN_KEY = 'seu_bigode_token';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function adminRequest(path, options = {}) {
  const token = getStoredToken();
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    setStoredToken('');
  }
  if (!response.ok) {
    throw new Error(data.erro || 'Erro ao se comunicar com o servidor.');
  }
  return data;
}

export const adminApi = {
  login: async (email, senha) => {
    const data = await adminRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, senha })
    });
    setStoredToken(data.token);
    return data;
  },
  me: () => adminRequest('/api/auth/me'),
  logout: () => setStoredToken(''),

  getAgendamentos: ({ data, dataInicio, dataFim, barbeiroId = 'todos', status = 'todos' }) => {
    const params = new URLSearchParams();
    if (data) params.set('data', data);
    if (dataInicio) params.set('dataInicio', dataInicio);
    if (dataFim) params.set('dataFim', dataFim);
    if (barbeiroId && barbeiroId !== 'todos') params.set('barbeiroId', String(barbeiroId));
    if (status && status !== 'todos') params.set('status', status);
    return adminRequest(`/api/admin/agendamentos?${params.toString()}`);
  },

  atualizarStatus: (id, status, formaPagamento) =>
    adminRequest(`/api/admin/agendamentos/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(formaPagamento ? { formaPagamento } : {}) })
    }),

  getCaixaResumo: (barbeiroId = 'todos') => {
    const q = barbeiroId && barbeiroId !== 'todos' ? `?barbeiroId=${barbeiroId}` : '';
    return adminRequest(`/api/admin/caixa/resumo${q}`);
  },
  getCaixaMovimentacoes: ({ periodo = 'mes', barbeiroId = 'todos' } = {}) => {
    const params = new URLSearchParams({ periodo });
    if (barbeiroId && barbeiroId !== 'todos') params.set('barbeiroId', String(barbeiroId));
    return adminRequest(`/api/admin/caixa/movimentacoes?${params.toString()}`);
  },
  criarMovimentacao: (payload) =>
    adminRequest('/api/admin/caixa/movimentacoes', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  removerMovimentacao: (id) =>
    adminRequest(`/api/admin/caixa/movimentacoes/${id}`, {
      method: 'DELETE'
    }),

  getServicos: () => adminRequest('/api/admin/servicos'),
  criarServico: (payload) =>
    adminRequest('/api/admin/servicos', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  atualizarServico: (id, payload) =>
    adminRequest(`/api/admin/servicos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  getBarbeiros: () => adminRequest('/api/admin/barbeiros'),
  criarBarbeiro: (payload) =>
    adminRequest('/api/admin/barbeiros', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  atualizarBarbeiro: (id, payload) =>
    adminRequest(`/api/admin/barbeiros/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  getBloqueios: (barbeiroId = 'todos') => {
    const query = barbeiroId && barbeiroId !== 'todos' ? `?barbeiroId=${barbeiroId}` : '';
    return adminRequest(`/api/admin/bloqueios${query}`);
  },
  criarBloqueio: (payload) =>
    adminRequest('/api/admin/bloqueios', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  removerBloqueio: (id) =>
    adminRequest(`/api/admin/bloqueios/${id}`, {
      method: 'DELETE'
    }),

  getConfig: () => adminRequest('/api/admin/config'),
  salvarConfig: (payload) =>
    adminRequest('/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  conectarEventos: ({ onNovoAgendamento, onStatusAtualizado, onConexao }) => {
    const token = getStoredToken();
    if (!token) return () => {};

    const source = new EventSource(`/api/admin/events?token=${encodeURIComponent(token)}`);

    source.addEventListener('conectado', () => {
      onConexao?.(true);
    });

    source.addEventListener('novo_agendamento', (event) => {
      try {
        onNovoAgendamento?.(JSON.parse(event.data));
      } catch {
        // ignora payload malformado
      }
    });

    source.addEventListener('status_atualizado', (event) => {
      try {
        onStatusAtualizado?.(JSON.parse(event.data));
      } catch {
        // ignora
      }
    });

    source.onerror = () => {
      onConexao?.(false);
    };

    return () => {
      source.close();
    };
  }
};
