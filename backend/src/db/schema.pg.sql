-- ============================================================================
-- Barbearia Seu Bigode (Desde 2019) — Schema do Banco de Dados (PostgreSQL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS barbeiros (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  especialidade TEXT DEFAULT 'Barbeiro',
  telefone TEXT,
  email TEXT UNIQUE,
  senha_hash TEXT,
  papel TEXT NOT NULL DEFAULT 'barbeiro' CHECK (papel IN ('dono', 'barbeiro')),
  foto_url TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS servicos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT NOT NULL DEFAULT 'cabelo' CHECK (categoria IN ('cabelo', 'barba', 'combo', 'extra')),
  duracao_min INTEGER NOT NULL CHECK (duracao_min > 0),
  preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS horarios_trabalho (
  id SERIAL PRIMARY KEY,
  barbeiro_id INTEGER NOT NULL REFERENCES barbeiros(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio TEXT NOT NULL,
  hora_fim TEXT NOT NULL,
  almoco_inicio TEXT,
  almoco_fim TEXT,
  UNIQUE (barbeiro_id, dia_semana)
);

CREATE TABLE IF NOT EXISTS bloqueios (
  id SERIAL PRIMARY KEY,
  barbeiro_id INTEGER NOT NULL REFERENCES barbeiros(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fim TEXT NOT NULL,
  motivo TEXT
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  barbeiro_id INTEGER NOT NULL REFERENCES barbeiros(id),
  cliente_nome TEXT NOT NULL,
  cliente_whatsapp TEXT NOT NULL,
  data TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fim TEXT NOT NULL,
  duracao_total_min INTEGER NOT NULL,
  total_centavos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'confirmado', 'concluido', 'cancelado', 'no_show')),
  status_pagamento TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status_pagamento IN ('pendente', 'pago_local', 'pago_pix')),
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS agendamento_servicos (
  id SERIAL PRIMARY KEY,
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  servico_id INTEGER NOT NULL REFERENCES servicos(id),
  nome_snapshot TEXT NOT NULL,
  preco_centavos_snapshot INTEGER NOT NULL,
  duracao_min_snapshot INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS movimentacoes_caixa (
  id SERIAL PRIMARY KEY,
  agendamento_id INTEGER REFERENCES agendamentos(id) ON DELETE SET NULL,
  barbeiro_id INTEGER NOT NULL REFERENCES barbeiros(id),
  tipo TEXT NOT NULL DEFAULT 'entrada' CHECK (tipo IN ('entrada', 'saida')),
  forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao')),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  descricao TEXT NOT NULL,
  data_hora TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS configuracoes_barbearia (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nome TEXT NOT NULL DEFAULT 'Seu Bigode',
  whatsapp TEXT NOT NULL DEFAULT '5511999999999',
  pix_chave TEXT NOT NULL DEFAULT '',
  pix_tipo TEXT NOT NULL DEFAULT 'Celular',
  pix_titular TEXT NOT NULL DEFAULT 'Barbearia Seu Bigode'
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_barbeiro_data
  ON agendamentos (barbeiro_id, data, status);
