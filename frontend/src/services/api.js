const API_BASE = '/api/public';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.erro || 'Erro ao se comunicar com o servidor.');
  }
  return data;
}

export const publicApi = {
  getConfig: () => request('/config'),
  getBarbeiros: () => request('/barbeiros'),
  getServicos: () => request('/servicos'),
  getCalendario: ({ barbeiroId, duracaoMin, dias = 14 }) => {
    const params = new URLSearchParams({
      barbeiroId: String(barbeiroId),
      duracaoMin: String(duracaoMin),
      dias: String(dias)
    });
    return request(`/calendario?${params.toString()}`);
  },
  getHorarios: ({ barbeiroId, data, duracaoMin }) => {
    const params = new URLSearchParams({
      barbeiroId: String(barbeiroId),
      data,
      duracaoMin: String(duracaoMin)
    });
    return request(`/horarios?${params.toString()}`);
  },
  criarAgendamento: (payload) =>
    request('/agendamentos', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
};
