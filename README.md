# Barbearia Seu Bigode (Desde 2019)

Sistema web de agendamento online, agenda multi-barbeiro e controle de caixa da barbearia **Seu Bigode**.

## Estrutura
```text
seu-bigode/
├── backend/   # API Node.js + Express + SQLite (node:sqlite)
└── frontend/  # Interface web mobile-first em React + Vite
```

## Como rodar localmente
1. Instale as dependências:
   ```bash
   npm --prefix backend install
   npm --prefix frontend install
   ```
2. Inicie o backend e o frontend (em dois terminais):
   ```bash
   npm run dev:backend
   npm run dev:frontend
   ```
3. Acesse no navegador: `http://localhost:5173`

## Testes do Backend
```bash
npm test
```

## Fases do Projeto
- [x] **Fase 1:** Base do projeto, banco SQLite, motor de horários livres, calendário de dias futuros e tela pública de agendamento (`/agendar`)
- [ ] **Fase 2:** Painel do barbeiro (`/admin`), login JWT, calendário diário/semanal, notificações ao vivo (SSE) e gestão de barbeiros/serviços/expediente
- [ ] **Fase 3:** Controle de caixa, atendimento avulso e estatísticas (dia, semana, mês e por barbeiro)
- [ ] **Fase 4:** Pagamento Pix integrado e webhooks para automação no WhatsApp (n8n)
