import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  CreditCard,
  Plus,
  Scissors,
  Trash2,
  TrendingUp,
  Users
} from 'lucide-react';
import { adminApi } from '../services/adminApi.js';
import { formatCurrency } from '../utils/format.js';

const LABEL_PAGAMENTO = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão'
};

export function CaixaTab({ barbeiros, servicos, barbeiroLogadoId, onNotificar }) {
  const [filtroBarbeiro, setFiltroBarbeiro] = useState('todos');
  const [periodoLista, setPeriodoLista] = useState('mes');
  const [resumo, setResumo] = useState(null);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const [form, setForm] = useState({
    tipo: 'entrada',
    barbeiroId: String(barbeiroLogadoId),
    formaPagamento: 'pix',
    valorReais: '',
    descricao: ''
  });

  const carregarCaixa = useCallback(async () => {
    setCarregando(true);
    try {
      const [dadosResumo, listaMovs] = await Promise.all([
        adminApi.getCaixaResumo(filtroBarbeiro),
        adminApi.getCaixaMovimentacoes({ periodo: periodoLista, barbeiroId: filtroBarbeiro })
      ]);
      setResumo(dadosResumo);
      setMovimentacoes(listaMovs);
    } catch (err) {
      onNotificar?.(err.message);
    } finally {
      setCarregando(false);
    }
  }, [filtroBarbeiro, periodoLista, onNotificar]);

  useEffect(() => {
    carregarCaixa();
  }, [carregarCaixa]);

  function preencherComServico(servico) {
    setForm((prev) => ({
      ...prev,
      tipo: 'entrada',
      valorReais: (servico.precoCentavos / 100).toFixed(2).replace('.', ','),
      descricao: `Atendimento avulso — ${servico.nome}`
    }));
  }

  async function handleLancar(e) {
    e.preventDefault();
    const valorNum = Number(String(form.valorReais).replace(',', '.'));
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      onNotificar?.('Informe um valor válido maior que zero.');
      return;
    }

    try {
      await adminApi.criarMovimentacao({
        barbeiroId: Number(form.barbeiroId),
        tipo: form.tipo,
        formaPagamento: form.formaPagamento,
        valorCentavos: Math.round(valorNum * 100),
        descricao: form.descricao
      });
      setForm((prev) => ({ ...prev, valorReais: '', descricao: '' }));
      await carregarCaixa();
      onNotificar?.(
        form.tipo === 'entrada'
          ? 'Atendimento avulso registrado no caixa!'
          : 'Saída registrada no caixa!'
      );
    } catch (err) {
      onNotificar?.(err.message);
    }
  }

  async function handleRemover(id) {
    try {
      await adminApi.removerMovimentacao(id);
      await carregarCaixa();
      onNotificar?.('Lançamento removido do caixa.');
    } catch (err) {
      onNotificar?.(err.message);
    }
  }

  const maxSerie = Math.max(
    1,
    ...(resumo?.serie7Dias || []).map((d) => Math.max(d.entradasCentavos, d.saidasCentavos))
  );

  const totalPagamentosMes = Math.max(
    1,
    (resumo?.porFormaPagamento || []).reduce((acc, p) => acc + p.totalCentavos, 0)
  );

  const maxBarbeiro = Math.max(
    1,
    ...(resumo?.porBarbeiro || []).map((b) => b.entradasCentavos)
  );

  return (
    <section className="admin-secao">
      {/* Filtro por barbeiro */}
      <div className="agenda-barra-topo">
        <div className="filtro-barbeiro-wrap">
          <label htmlFor="caixa-barbeiro">Filtrar caixa por:</label>
          <select
            id="caixa-barbeiro"
            className="select-admin"
            value={filtroBarbeiro}
            onChange={(e) => setFiltroBarbeiro(e.target.value)}
          >
            <option value="todos">Barbearia inteira (Todos)</option>
            {barbeiros.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cards Dia / Semana / Mês */}
      {resumo && (
        <div className="caixa-cards-grid">
          <div className="caixa-kpi-card">
            <span className="caixa-kpi-label">Hoje</span>
            <strong className="caixa-kpi-valor">
              {formatCurrency(resumo.hoje.entradasCentavos)}
            </strong>
            <div className="caixa-kpi-detalhes">
              <span>{resumo.hoje.qtdEntradas} atendimentos</span>
              {resumo.hoje.saidasCentavos > 0 && (
                <span className="texto-saida">
                  Saídas: -{formatCurrency(resumo.hoje.saidasCentavos)}
                </span>
              )}
            </div>
          </div>

          <div className="caixa-kpi-card">
            <span className="caixa-kpi-label">Últimos 7 dias (Semana)</span>
            <strong className="caixa-kpi-valor">
              {formatCurrency(resumo.semana.entradasCentavos)}
            </strong>
            <div className="caixa-kpi-detalhes">
              <span>{resumo.semana.qtdEntradas} atendimentos</span>
              <span>Saldo: {formatCurrency(resumo.semana.saldoCentavos)}</span>
            </div>
          </div>

          <div className="caixa-kpi-card destaque">
            <span className="caixa-kpi-label">Mês Atual (Líquido)</span>
            <strong className="caixa-kpi-valor">
              {formatCurrency(resumo.mes.saldoCentavos)}
            </strong>
            <div className="caixa-kpi-detalhes">
              <span>Entradas: {formatCurrency(resumo.mes.entradasCentavos)}</span>
              <span>Ticket médio: {formatCurrency(resumo.mes.ticketMedioCentavos)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Gráfico 7 dias + Analytics */}
      {resumo && (
        <div className="caixa-analytics-grid">
          <div className="secao-card">
            <h2 className="caixa-card-titulo">
              <BarChart3 size={18} /> Faturamento dos últimos 7 dias
            </h2>
            <div className="grafico-barras">
              {resumo.serie7Dias.map((dia) => {
                const alturaPct = Math.round((dia.entradasCentavos / maxSerie) * 100);
                return (
                  <div key={dia.data} className="barra-coluna">
                    <span className="barra-valor">
                      {dia.entradasCentavos > 0
                        ? `R$${Math.round(dia.entradasCentavos / 100)}`
                        : '—'}
                    </span>
                    <div className="barra-trilha">
                      <div
                        className="barra-preenchimento"
                        style={{ height: `${Math.max(alturaPct, dia.entradasCentavos > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                    <span className="barra-label">{dia.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="secao-card">
            <h2 className="caixa-card-titulo">
              <Users size={18} /> Faturamento por Barbeiro (Mês)
            </h2>
            <div className="barras-horizontais">
              {resumo.porBarbeiro.map((b) => {
                const pct = Math.round((b.entradasCentavos / maxBarbeiro) * 100);
                return (
                  <div key={b.id} className="barra-h-item">
                    <div className="barra-h-topo">
                      <strong>{b.nome}</strong>
                      <span>
                        {b.qtdAtendimentos} cortes • <strong>{formatCurrency(b.entradasCentavos)}</strong>
                      </span>
                    </div>
                    <div className="barra-h-trilha">
                      <div
                        className="barra-h-fill"
                        style={{ width: `${Math.max(pct, b.entradasCentavos > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="caixa-subbloco">
              <h3>
                <CreditCard size={15} /> Formas de Pagamento (Mês)
              </h3>
              {resumo.porFormaPagamento.length === 0 ? (
                <p className="texto-suave-sm">Nenhuma entrada registrada neste mês ainda.</p>
              ) : (
                <div className="pagamentos-pills">
                  {resumo.porFormaPagamento.map((p) => {
                    const pct = Math.round((p.totalCentavos / totalPagamentosMes) * 100);
                    return (
                      <div key={p.formaPagamento} className="pag-pill">
                        <span>{LABEL_PAGAMENTO[p.formaPagamento] || p.formaPagamento}</span>
                        <strong>{formatCurrency(p.totalCentavos)}</strong>
                        <small>{pct}% ({p.qtd}x)</small>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {resumo.topServicos.length > 0 && (
              <div className="caixa-subbloco">
                <h3>
                  <Scissors size={15} /> Serviços mais concluídos (Mês)
                </h3>
                <ul className="top-servicos-lista">
                  {resumo.topServicos.map((s) => (
                    <li key={s.nome}>
                      <span>{s.nome}</span>
                      <strong>
                        {s.qtd}x • {formatCurrency(s.totalCentavos)}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Formulário rápido: Atendimento Avulso ou Saída */}
      <form onSubmit={handleLancar} className="secao-card form-gestao">
        <div className="lancamento-topo">
          <h2>
            <TrendingUp size={18} /> Lançamento Rápido no Caixa
          </h2>
          <div className="modo-toggle">
            <button
              type="button"
              className={form.tipo === 'entrada' ? 'ativo' : ''}
              onClick={() => setForm({ ...form, tipo: 'entrada' })}
            >
              + Atendimento Avulso
            </button>
            <button
              type="button"
              className={form.tipo === 'saida' ? 'ativo' : ''}
              onClick={() => setForm({ ...form, tipo: 'saida' })}
            >
              - Saída / Despesa
            </button>
          </div>
        </div>

        {form.tipo === 'entrada' && servicos.length > 0 && (
          <div className="atalhos-servicos">
            <span>Atalho rápido:</span>
            {servicos
              .filter((s) => s.ativo)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="atalho-pill"
                  onClick={() => preencherComServico(s)}
                >
                  {s.nome} ({formatCurrency(s.precoCentavos)})
                </button>
              ))}
          </div>
        )}

        <div className="campos-grid">
          <div className="campo">
            <label htmlFor="cx-barbeiro">Barbeiro</label>
            <select
              id="cx-barbeiro"
              className="select-admin"
              value={form.barbeiroId}
              onChange={(e) => setForm({ ...form, barbeiroId: e.target.value })}
            >
              {barbeiros.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="cx-forma">Forma de pagamento</label>
            <select
              id="cx-forma"
              className="select-admin"
              value={form.formaPagamento}
              onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })}
            >
              <option value="pix">Pix</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cartao">Cartão</option>
            </select>
          </div>

          <div className="campo">
            <label htmlFor="cx-valor">Valor (R$)</label>
            <input
              id="cx-valor"
              type="text"
              inputMode="decimal"
              placeholder="45,00"
              value={form.valorReais}
              onChange={(e) => setForm({ ...form, valorReais: e.target.value })}
              required
            />
          </div>

          <div className="campo">
            <label htmlFor="cx-desc">Descrição</label>
            <input
              id="cx-desc"
              type="text"
              placeholder={
                form.tipo === 'entrada'
                  ? 'Ex.: Cliente avulso — Degradê'
                  : 'Ex.: Compra de lâminas / Pomada'
              }
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              required
            />
          </div>
        </div>

        <button type="submit" className="btn-primario">
          <Plus size={16} />
          {form.tipo === 'entrada' ? 'Registrar Entrada no Caixa' : 'Registrar Saída'}
        </button>
      </form>

      {/* Histórico de movimentações */}
      <div className="secao-card">
        <div className="lancamento-topo">
          <h2>Histórico do Caixa</h2>
          <div className="modo-toggle">
            {[
              { id: 'hoje', label: 'Hoje' },
              { id: 'semana', label: 'Semana' },
              { id: 'mes', label: 'Mês' }
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={periodoLista === p.id ? 'ativo' : ''}
                onClick={() => setPeriodoLista(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {carregando ? (
          <div className="estado-vazio">Carregando movimentações...</div>
        ) : movimentacoes.length === 0 ? (
          <div className="estado-vazio">
            Nenhuma movimentação registrada neste período. Conclua um agendamento na Agenda ou registre um atendimento avulso acima!
          </div>
        ) : (
          <div className="gestao-lista">
            {movimentacoes.map((m) => {
              const ehEntrada = m.tipo === 'entrada';
              return (
                <div key={m.id} className="gestao-item mov-item">
                  <div className="mov-esquerda">
                    {ehEntrada ? (
                      <ArrowUpCircle size={20} className="icone-entrada" />
                    ) : (
                      <ArrowDownCircle size={20} className="icone-saida" />
                    )}
                    <div>
                      <strong>{m.descricao}</strong>
                      <span>
                        {m.barbeiroNome} • {LABEL_PAGAMENTO[m.formaPagamento] || m.formaPagamento} •{' '}
                        {m.dataHora.slice(0, 16).replace('T', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="mov-direita">
                    <strong className={ehEntrada ? 'valor-entrada' : 'valor-saida'}>
                      {ehEntrada ? '+' : '-'} {formatCurrency(m.valorCentavos)}
                    </strong>
                    <button
                      type="button"
                      className="btn-acao btn-cancelar"
                      onClick={() => handleRemover(m.id)}
                      title="Remover lançamento"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
