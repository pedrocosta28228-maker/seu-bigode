import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Calendar,
  CalendarOff,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  LogOut,
  MessageCircle,
  Pencil,
  Plus,
  Save,
  Scissors,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
  XCircle
} from 'lucide-react';
import { adminApi } from '../services/adminApi.js';
import { formatCurrency, formatDuration, formatFullDate } from '../utils/format.js';
import { montarLinkWhatsappConfirmacao } from '../utils/whatsapp.js';
import { NotificacaoToast } from '../components/NotificacaoToast.jsx';
import { CalendarioMensalAdmin } from '../components/CalendarioMensalAdmin.jsx';
import { CaixaTab } from '../components/CaixaTab.jsx';

const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function gerarProximosDias(dataBaseStr, total = 10) {
  const [y, m, d] = dataBaseStr.split('-').map(Number);
  const lista = [];
  for (let i = 0; i < total; i++) {
    const dt = new Date(y, m - 1, d + i);
    const dataStr = formatarDataLocal(dt);
    lista.push({
      dataStr,
      diaSemana: DIAS_CURTO[dt.getDay()],
      diaNum: String(dt.getDate()).padStart(2, '0'),
      mesNum: String(dt.getMonth() + 1).padStart(2, '0'),
      rotulo: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : DIAS_CURTO[dt.getDay()]
    });
  }
  return lista;
}

function formatarDataLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getLimitesMes(ano, mes) {
  const inicio = formatarDataLocal(new Date(ano, mes, 1));
  const fim = formatarDataLocal(new Date(ano, mes + 1, 0));
  return { inicio, fim };
}

function tocarBipNotificacao() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // navegador pode bloquear som sem interação prévia
  }
}

const STATUS_LABEL = {
  agendado: { texto: 'Agendado', classe: 'status-agendado' },
  confirmado: { texto: 'Confirmado', classe: 'status-confirmado' },
  concluido: { texto: 'Concluído', classe: 'status-concluido' },
  cancelado: { texto: 'Cancelado', classe: 'status-cancelado' },
  no_show: { texto: 'Não veio', classe: 'status-no-show' }
};

export function AdminPage({ barbeiroLogado, onAtualizarBarbeiroLogado, onLogout, onIrCliente }) {
  const hojeObj = useMemo(() => new Date(), []);
  const hojeStr = useMemo(() => formatarDataLocal(hojeObj), [hojeObj]);

  const [aba, setAba] = useState('agenda');
  const [sseConectado, setSseConectado] = useState(false);
  const [somAtivo, setSomAtivo] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [anuncioTexto, setAnuncioTexto] = useState('');

  // Estado do Calendário Mensal + Agenda
  const [anoMes, setAnoMes] = useState(() => ({
    ano: hojeObj.getFullYear(),
    mes: hojeObj.getMonth()
  }));
  const [diaSelecionado, setDiaSelecionado] = useState(hojeStr);
  const [verMesTodo, setVerMesTodo] = useState(false);
  const [mostrarCalendarioMes, setMostrarCalendarioMes] = useState(false);
  const [filtroBarbeiro, setFiltroBarbeiro] = useState('todos');
  const [agendamentosMes, setAgendamentosMes] = useState([]);
  const [carregandoAgenda, setCarregandoAgenda] = useState(false);

  // Estado das abas de gestão
  const [servicos, setServicos] = useState([]);
  const [barbeiros, setBarbeiros] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [configBarbearia, setConfigBarbearia] = useState({
    nome: 'Seu Bigode',
    whatsapp: '5511999999999',
    pixChave: '',
    pixTipo: 'Celular',
    pixTitular: 'Barbearia Seu Bigode'
  });
  const [mensagem, setMensagem] = useState('');
  const [concluindoId, setConcluindoId] = useState(null);

  // Edição inline de barbeiro
  const [editandoBarbeiroId, setEditandoBarbeiroId] = useState(null);
  const [formEditBarbeiro, setFormEditBarbeiro] = useState({
    nome: '',
    especialidade: '',
    telefone: ''
  });

  // Formulários rápidos
  const [novoServico, setNovoServico] = useState({
    nome: '',
    descricao: '',
    categoria: 'cabelo',
    duracaoMin: 30,
    precoReais: '40'
  });

  const [novoBarbeiro, setNovoBarbeiro] = useState({
    nome: '',
    especialidade: '',
    telefone: '',
    email: '',
    senha: ''
  });

  const [novoBloqueio, setNovoBloqueio] = useState({
    barbeiroId: String(barbeiroLogado.id),
    data: hojeStr,
    horaInicio: '07:00',
    horaFim: '19:00',
    motivo: 'Folga'
  });

  const carregarAgendaMes = useCallback(async () => {
    setCarregandoAgenda(true);
    try {
      const { inicio, fim } = getLimitesMes(anoMes.ano, anoMes.mes);
      const dados = await adminApi.getAgendamentos({
        dataInicio: inicio,
        dataFim: fim,
        barbeiroId: filtroBarbeiro
      });
      setAgendamentosMes(dados.agendamentos || []);
    } catch (err) {
      setMensagem(err.message);
    } finally {
      setCarregandoAgenda(false);
    }
  }, [anoMes.ano, anoMes.mes, filtroBarbeiro]);

  const carregarGestao = useCallback(async () => {
    try {
      const [listaServicos, listaBarbeiros, listaBloqueios, cfg] = await Promise.all([
        adminApi.getServicos(),
        adminApi.getBarbeiros(),
        adminApi.getBloqueios(),
        adminApi.getConfig()
      ]);
      setServicos(listaServicos);
      setBarbeiros(listaBarbeiros);
      setBloqueios(listaBloqueios);
      setConfigBarbearia(cfg);
    } catch (err) {
      setMensagem(err.message);
    }
  }, []);

  useEffect(() => {
    carregarAgendaMes();
  }, [carregarAgendaMes]);

  useEffect(() => {
    carregarGestao();
  }, [carregarGestao]);

  // Conexão SSE em tempo real
  useEffect(() => {
    const desconectar = adminApi.conectarEventos({
      onConexao: setSseConectado,
      onNovoAgendamento: (ag) => {
        const uid = `${ag.id}-${Date.now()}`;
        setToasts((prev) => [{ ...ag, uid }, ...prev].slice(0, 4));
        const texto = `Novo agendamento ${ag.codigo}: ${ag.clienteNome} às ${ag.horaInicio} com ${ag.barbeiro?.nome}.`;
        if (typeof document.ariaNotify === 'function') {
          document.ariaNotify(texto);
        } else {
          setAnuncioTexto(texto);
        }
        if (somAtivo) {
          tocarBipNotificacao();
        }
        carregarAgendaMes();
      },
      onStatusAtualizado: () => {
        carregarAgendaMes();
      }
    });
    return desconectar;
  }, [carregarAgendaMes, somAtivo]);

  // Conta atendimentos ativos por dia para pintar o calendário de verde
  const contagemPorDia = useMemo(() => {
    const mapa = {};
    for (const ag of agendamentosMes) {
      if (ag.status === 'cancelado' || ag.status === 'no_show') continue;
      mapa[ag.data] = (mapa[ag.data] || 0) + 1;
    }
    return mapa;
  }, [agendamentosMes]);

  // Lista exibida no painel lateral (dia clicado OU mês todo)
  const agendamentosExibidos = useMemo(() => {
    if (verMesTodo) return agendamentosMes;
    return agendamentosMes.filter((ag) => ag.data === diaSelecionado);
  }, [agendamentosMes, verMesTodo, diaSelecionado]);

  // KPIs dinâmicos conforme o período exibido (dia selecionado ou mês todo) e filtro de barbeiro
  const resumoExibido = useMemo(() => {
    const ativos = agendamentosExibidos.filter(
      (a) => a.status !== 'cancelado' && a.status !== 'no_show'
    );
    return {
      ativos: ativos.length,
      confirmados: agendamentosExibidos.filter((a) => a.status === 'confirmado').length,
      concluidos: agendamentosExibidos.filter((a) => a.status === 'concluido').length,
      faturamentoPrevistoCentavos: ativos.reduce((acc, a) => acc + a.totalCentavos, 0)
    };
  }, [agendamentosExibidos]);

  function handleMudarMes(delta) {
    setAnoMes((prev) => {
      const novaData = new Date(prev.ano, prev.mes + delta, 1);
      const novoAno = novaData.getFullYear();
      const novoMes = novaData.getMonth();
      setDiaSelecionado(formatarDataLocal(novaData));
      setVerMesTodo(false);
      return { ano: novoAno, mes: novoMes };
    });
  }

  function handleSelecionarDia(dataStr) {
    setDiaSelecionado(dataStr);
    setVerMesTodo(false);
  }

  function fecharToast(uid) {
    setToasts((prev) => prev.filter((t) => t.uid !== uid));
  }

  async function handleStatus(id, status, formaPagamento) {
    try {
      const res = await adminApi.atualizarStatus(id, status, formaPagamento);
      setConcluindoId(null);
      await carregarAgendaMes();
      if (res.lancadoNoCaixa) {
        setMensagem('Atendimento concluído e valor lançado automaticamente no Caixa!');
      }
    } catch (err) {
      setMensagem(err.message);
    }
  }

  async function handleCriarServico(e) {
    e.preventDefault();
    setMensagem('');
    try {
      const precoNum = Number(String(novoServico.precoReais).replace(',', '.'));
      await adminApi.criarServico({
        nome: novoServico.nome,
        descricao: novoServico.descricao,
        categoria: novoServico.categoria,
        duracaoMin: Number(novoServico.duracaoMin),
        precoCentavos: Math.round(precoNum * 100)
      });
      setNovoServico({ nome: '', descricao: '', categoria: 'cabelo', duracaoMin: 30, precoReais: '40' });
      await carregarGestao();
      setMensagem('Serviço adicionado com sucesso!');
    } catch (err) {
      setMensagem(err.message);
    }
  }

  async function handleToggleServico(servico) {
    try {
      await adminApi.atualizarServico(servico.id, { ativo: !servico.ativo });
      await carregarGestao();
    } catch (err) {
      setMensagem(err.message);
    }
  }

  async function handleCriarBarbeiro(e) {
    e.preventDefault();
    setMensagem('');
    try {
      await adminApi.criarBarbeiro(novoBarbeiro);
      setNovoBarbeiro({ nome: '', especialidade: '', telefone: '', email: '', senha: '' });
      await carregarGestao();
      setMensagem('Novo barbeiro cadastrado e pronto para receber agendamentos!');
    } catch (err) {
      setMensagem(err.message);
    }
  }

  function iniciarEdicaoBarbeiro(b) {
    setEditandoBarbeiroId(b.id);
    setFormEditBarbeiro({
      nome: b.nome || '',
      especialidade: b.especialidade || '',
      telefone: b.telefone || ''
    });
  }

  async function handleSalvarEdicaoBarbeiro(e, id) {
    e.preventDefault();
    setMensagem('');
    try {
      const atualizado = await adminApi.atualizarBarbeiro(id, formEditBarbeiro);
      setEditandoBarbeiroId(null);
      await carregarGestao();
      await carregarAgendaMes();
      if (id === barbeiroLogado.id && onAtualizarBarbeiroLogado) {
        onAtualizarBarbeiroLogado({ ...barbeiroLogado, nome: atualizado.nome });
      }
      setMensagem('Dados do barbeiro atualizados com sucesso!');
    } catch (err) {
      setMensagem(err.message);
    }
  }

  async function handleSalvarConfig(e) {
    e.preventDefault();
    setMensagem('');
    try {
      const salvo = await adminApi.salvarConfig(configBarbearia);
      setConfigBarbearia(salvo);
      setMensagem('Chave Pix e WhatsApp da barbearia atualizados!');
    } catch (err) {
      setMensagem(err.message);
    }
  }

  async function handleToggleBarbeiro(barbeiro) {
    try {
      await adminApi.atualizarBarbeiro(barbeiro.id, { ativo: !barbeiro.ativo });
      await carregarGestao();
    } catch (err) {
      setMensagem(err.message);
    }
  }

  async function handleCriarBloqueio(e) {
    e.preventDefault();
    setMensagem('');
    try {
      await adminApi.criarBloqueio({
        ...novoBloqueio,
        barbeiroId: Number(novoBloqueio.barbeiroId)
      });
      await carregarGestao();
      setMensagem('Horário bloqueado na agenda!');
    } catch (err) {
      setMensagem(err.message);
    }
  }

  async function handleRemoverBloqueio(id) {
    try {
      await adminApi.removerBloqueio(id);
      await carregarGestao();
    } catch (err) {
      setMensagem(err.message);
    }
  }

  return (
    <div className="admin-shell">
      <NotificacaoToast
        toasts={toasts}
        anuncioTexto={anuncioTexto}
        onFechar={fecharToast}
      />

      <header className="admin-header">
        <div className="admin-header-conteudo">
          <div className="admin-brand">
            <img src="/logo-seu-bigode.jpg" alt="Seu Bigode" className="admin-logo" />
            <div>
              <strong>Seu Bigode • Painel</strong>
              <span>
                {barbeiroLogado.nome}
                <em className={`sse-pill ${sseConectado ? 'online' : ''}`}>
                  {sseConectado ? '● Ao vivo' : '○ Reconectando'}
                </em>
              </span>
            </div>
          </div>

          <div className="admin-header-acoes">
            <button
              type="button"
              className="btn-icone-header"
              onClick={() => setSomAtivo((s) => !s)}
              title={somAtivo ? 'Silenciar alerta sonoro' : 'Ativar alerta sonoro'}
            >
              {somAtivo ? <Bell size={18} /> : <BellOff size={18} />}
            </button>

            <button
              type="button"
              className="btn-icone-header"
              onClick={onIrCliente}
              title="Ver tela do cliente"
            >
              <ExternalLink size={18} />
              <span className="hide-mobile">Tela do Cliente</span>
            </button>

            <button
              type="button"
              className="btn-icone-header"
              onClick={onLogout}
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <nav className="admin-tabs" aria-label="Seções do painel">
          <button
            type="button"
            className={`admin-tab ${aba === 'agenda' ? 'ativa' : ''}`}
            onClick={() => setAba('agenda')}
          >
            <Calendar size={16} /> Agenda
          </button>
          <button
            type="button"
            className={`admin-tab ${aba === 'caixa' ? 'ativa' : ''}`}
            onClick={() => setAba('caixa')}
          >
            <Wallet size={16} /> Caixa & Estatísticas
          </button>
          <button
            type="button"
            className={`admin-tab ${aba === 'servicos' ? 'ativa' : ''}`}
            onClick={() => setAba('servicos')}
          >
            <Scissors size={16} /> Serviços
          </button>
          <button
            type="button"
            className={`admin-tab ${aba === 'equipe' ? 'ativa' : ''}`}
            onClick={() => setAba('equipe')}
          >
            <Users size={16} /> Equipe
          </button>
          <button
            type="button"
            className={`admin-tab ${aba === 'bloqueios' ? 'ativa' : ''}`}
            onClick={() => setAba('bloqueios')}
          >
            <CalendarOff size={16} /> Folgas
          </button>
        </nav>
      </header>

      <main className="admin-conteudo">
        {mensagem && (
          <div className="alerta-sucesso" role="status">
            <span>{mensagem}</span>
            <button type="button" onClick={() => setMensagem('')}>
              OK
            </button>
          </div>
        )}

        {/* ==================== ABA AGENDA ==================== */}
        {aba === 'agenda' && (
          <section className="admin-secao">
            {/* Barra de filtro por barbeiro + botão compacto de abrir/fechar Calendário do Mês */}
            <div className="agenda-barra-topo">
              <div className="filtro-barbeiro-wrap">
                <label htmlFor="filtro-barbeiro">Barbeiro:</label>
                <select
                  id="filtro-barbeiro"
                  value={filtroBarbeiro}
                  onChange={(e) => setFiltroBarbeiro(e.target.value)}
                  className="select-admin"
                >
                  <option value="todos">Todos os barbeiros</option>
                  {barbeiros.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="agenda-acoes-topo">
                <button
                  type="button"
                  className={`btn-ver-mes ${mostrarCalendarioMes ? 'ativo' : ''}`}
                  onClick={() => setMostrarCalendarioMes((v) => !v)}
                >
                  <Calendar size={14} />{' '}
                  {mostrarCalendarioMes ? 'Ocultar calendário do mês' : 'Calendário do mês'}
                </button>
                <button
                  type="button"
                  className={`btn-ver-mes ${verMesTodo ? 'ativo' : ''}`}
                  onClick={() => setVerMesTodo((v) => !v)}
                >
                  {verMesTodo ? 'Ver só o dia' : 'Ver mês todo'}
                </button>
              </div>
            </div>

            {/* Faixa horizontal compacta (ideal no celular — não ocupa a tela toda!) */}
            <div className="faixa-dias-admin" role="listbox" aria-label="Navegação rápida de dias">
              {gerarProximosDias(hojeStr, 14).map((d) => {
                const qtd = contagemPorDia[d.dataStr] || 0;
                const ativo = !verMesTodo && diaSelecionado === d.dataStr;
                return (
                  <button
                    key={d.dataStr}
                    type="button"
                    role="option"
                    aria-selected={ativo}
                    onClick={() => {
                      const [y, m] = d.dataStr.split('-').map(Number);
                      if (y !== anoMes.ano || m - 1 !== anoMes.mes) {
                        setAnoMes({ ano: y, mes: m - 1 });
                      }
                      handleSelecionarDia(d.dataStr);
                    }}
                    className={`faixa-dia-pill ${qtd > 0 ? 'com-corte' : ''} ${ativo ? 'ativo' : ''}`}
                  >
                    <span className="faixa-dia-rotulo">{d.rotulo}</span>
                    <strong>{d.diaNum}/{d.mesNum}</strong>
                    <span className="faixa-dia-qtd">
                      {qtd > 0 ? `${qtd} ${qtd === 1 ? 'corte' : 'cortes'}` : 'Livre'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Calendário Mensal Expansível (abre sob demanda, sem empurrar os atendimentos no celular) */}
            {mostrarCalendarioMes && (
              <CalendarioMensalAdmin
                ano={anoMes.ano}
                mes={anoMes.mes}
                hojeStr={hojeStr}
                diaSelecionado={diaSelecionado}
                verMesTodo={verMesTodo}
                contagemPorDia={contagemPorDia}
                onSelecionarDia={(d) => {
                  handleSelecionarDia(d);
                  setMostrarCalendarioMes(false);
                }}
                onMudarMes={handleMudarMes}
              />
            )}

            {/* KPIs do período selecionado */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <span>{verMesTodo ? 'Ativos no mês' : 'Ativos no dia'}</span>
                <strong>{resumoExibido.ativos}</strong>
              </div>
              <div className="kpi-card">
                <span>Confirmados</span>
                <strong>{resumoExibido.confirmados}</strong>
              </div>
              <div className="kpi-card">
                <span>Concluídos</span>
                <strong>{resumoExibido.concluidos}</strong>
              </div>
              <div className="kpi-card destaque">
                <span>{verMesTodo ? 'Previsto no mês' : 'Previsto no dia'}</span>
                <strong>{formatCurrency(resumoExibido.faturamentoPrevistoCentavos)}</strong>
              </div>
            </div>

            {/* Lista de Atendimentos em destaque total */}
            <div className="cal-detalhes-box">
              <div className="cal-detalhes-topo">
                <div>
                  <span className="cal-detalhes-sub">
                    {verMesTodo ? 'Todos os atendimentos do mês' : 'Atendimentos do dia'}
                  </span>
                  <h3>
                    {verMesTodo
                      ? `${agendamentosExibidos.length} agendamentos no mês`
                      : formatFullDate(diaSelecionado)}
                  </h3>
                </div>
              </div>

              {carregandoAgenda ? (
                <div className="estado-vazio">
                  <Clock size={18} /> Carregando agendamentos...
                </div>
              ) : agendamentosExibidos.length === 0 ? (
                <div className="estado-vazio">
                  <Calendar size={18} /> Nenhum atendimento agendado{' '}
                  {verMesTodo ? 'neste mês' : 'neste dia'}.
                </div>
              ) : (
                <div className="agendamentos-lista">
                  {agendamentosExibidos.map((ag) => {
                    const badge = STATUS_LABEL[ag.status] || STATUS_LABEL.agendado;
                    const linkConfirmarWhats = montarLinkWhatsappConfirmacao({
                      agendamento: ag,
                      config: configBarbearia
                    });

                    return (
                      <article key={ag.id} className={`agendamento-card ${ag.status}`}>
                        <div className="agendamento-hora-col">
                          <strong>{ag.horaInicio}</strong>
                          <span>até {ag.horaFim}</span>
                          {verMesTodo && (
                            <small className="ag-data-tag">
                              {ag.data.split('-').reverse().join('/')}
                            </small>
                          )}
                        </div>

                        <div className="agendamento-info-col">
                          <div className="agendamento-topo-linha">
                            <h4>
                              {ag.clienteNome}{' '}
                              <small className="ag-numero-seq">Nº {ag.id}</small>
                            </h4>
                            <span className={`status-badge ${badge.classe}`}>{badge.texto}</span>
                          </div>

                          <p className="agendamento-meta">
                            <strong>{ag.barbeiroNome}</strong> • {ag.codigo} •{' '}
                            {formatDuration(ag.duracaoTotalMin)} •{' '}
                            <strong>{formatCurrency(ag.totalCentavos)}</strong>
                          </p>

                          <div className="agendamento-tags">
                            {ag.servicos.map((s) => (
                              <span key={s.id} className="servico-tag">
                                {s.nome}
                              </span>
                            ))}
                          </div>

                          {ag.observacoes && (
                            <p className="agendamento-obs">Obs.: {ag.observacoes}</p>
                          )}

                          <div className="agendamento-acoes">
                            <a
                              href={linkConfirmarWhats}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-acao btn-whats"
                              title="Enviar confirmação com chave Pix no WhatsApp do cliente"
                            >
                              <MessageCircle size={14} /> Confirmar + Pix no WhatsApp
                            </a>

                            {ag.status === 'agendado' && (
                              <button
                                type="button"
                                className="btn-acao btn-confirmar"
                                onClick={() => handleStatus(ag.id, 'confirmado')}
                              >
                                <Check size={14} /> Confirmar
                              </button>
                            )}

                            {(ag.status === 'agendado' || ag.status === 'confirmado') &&
                              (concluindoId === ag.id ? (
                                <div className="concluir-pag-inline">
                                  <span>Pago via:</span>
                                  <button
                                    type="button"
                                    className="btn-acao btn-concluir"
                                    onClick={() => handleStatus(ag.id, 'concluido', 'pix')}
                                  >
                                    Pix
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-acao btn-concluir"
                                    onClick={() => handleStatus(ag.id, 'concluido', 'dinheiro')}
                                  >
                                    Dinheiro
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-acao btn-concluir"
                                    onClick={() => handleStatus(ag.id, 'concluido', 'cartao')}
                                  >
                                    Cartão
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-acao"
                                    onClick={() => setConcluindoId(null)}
                                  >
                                    ×
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-acao btn-concluir"
                                  onClick={() => setConcluindoId(ag.id)}
                                >
                                  <CheckCircle2 size={14} /> Concluir & Receber
                                </button>
                              ))}

                            {ag.status !== 'cancelado' && ag.status !== 'concluido' && (
                              <button
                                type="button"
                                className="btn-acao btn-cancelar"
                                onClick={() => handleStatus(ag.id, 'cancelado')}
                              >
                                <XCircle size={14} /> Cancelar
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ==================== ABA CAIXA & ESTATÍSTICAS ==================== */}
        {aba === 'caixa' && (
          <CaixaTab
            barbeiros={barbeiros}
            servicos={servicos}
            barbeiroLogadoId={barbeiroLogado.id}
            onNotificar={setMensagem}
          />
        )}

        {/* ==================== ABA SERVIÇOS ==================== */}
        {aba === 'servicos' && (
          <section className="admin-secao">
            <form onSubmit={handleCriarServico} className="secao-card form-gestao">
              <h2>
                <Plus size={18} /> Novo Serviço
              </h2>
              <div className="campos-grid">
                <div className="campo">
                  <label htmlFor="s-nome">Nome do serviço</label>
                  <input
                    id="s-nome"
                    type="text"
                    placeholder="Ex.: Pigmentação"
                    value={novoServico.nome}
                    onChange={(e) => setNovoServico({ ...novoServico, nome: e.target.value })}
                    required
                  />
                </div>

                <div className="campo">
                  <label htmlFor="s-cat">Categoria</label>
                  <select
                    id="s-cat"
                    className="select-admin"
                    value={novoServico.categoria}
                    onChange={(e) => setNovoServico({ ...novoServico, categoria: e.target.value })}
                  >
                    <option value="cabelo">Cabelo</option>
                    <option value="barba">Barba</option>
                    <option value="combo">Combo</option>
                    <option value="extra">Extra</option>
                  </select>
                </div>

                <div className="campo">
                  <label htmlFor="s-dur">Duração (minutos)</label>
                  <input
                    id="s-dur"
                    type="number"
                    min="5"
                    step="5"
                    value={novoServico.duracaoMin}
                    onChange={(e) => setNovoServico({ ...novoServico, duracaoMin: e.target.value })}
                    required
                  />
                </div>

                <div className="campo">
                  <label htmlFor="s-preco">Preço (R$)</label>
                  <input
                    id="s-preco"
                    type="text"
                    placeholder="45,00"
                    value={novoServico.precoReais}
                    onChange={(e) => setNovoServico({ ...novoServico, precoReais: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="campo campo-full">
                <label htmlFor="s-desc">Descrição curta (opcional)</label>
                <input
                  id="s-desc"
                  type="text"
                  placeholder="Detalhes do serviço..."
                  value={novoServico.descricao}
                  onChange={(e) => setNovoServico({ ...novoServico, descricao: e.target.value })}
                />
              </div>

              <button type="submit" className="btn-primario">
                <Plus size={16} /> Adicionar ao Catálogo
              </button>
            </form>

            <div className="gestao-lista">
              {servicos.map((s) => (
                <div key={s.id} className={`gestao-item ${!s.ativo ? 'inativo' : ''}`}>
                  <div>
                    <strong>{s.nome}</strong>
                    <span>
                      {s.categoria} • {formatDuration(s.duracaoMin)} •{' '}
                      {formatCurrency(s.precoCentavos)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => handleToggleServico(s)}
                  >
                    {s.ativo ? 'Desativar' : 'Reativar'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ==================== ABA EQUIPE ==================== */}
        {aba === 'equipe' && (
          <section className="admin-secao">
            {/* Configurações de Pix & WhatsApp da barbearia */}
            <form onSubmit={handleSalvarConfig} className="secao-card form-gestao">
              <h2>
                <Save size={18} /> Chave Pix & WhatsApp da Barbearia
              </h2>
              <div className="campos-grid">
                <div className="campo">
                  <label htmlFor="cfg-pix">Chave Pix (aparece no comprovante e WhatsApp)</label>
                  <input
                    id="cfg-pix"
                    type="text"
                    placeholder="Ex.: (84) 99999-9999 ou CPF/Email"
                    value={configBarbearia.pixChave}
                    onChange={(e) =>
                      setConfigBarbearia({ ...configBarbearia, pixChave: e.target.value })
                    }
                  />
                </div>
                <div className="campo">
                  <label htmlFor="cfg-tipo">Tipo da Chave</label>
                  <select
                    id="cfg-tipo"
                    className="select-admin"
                    value={configBarbearia.pixTipo}
                    onChange={(e) =>
                      setConfigBarbearia({ ...configBarbearia, pixTipo: e.target.value })
                    }
                  >
                    <option value="Celular">Celular</option>
                    <option value="CPF">CPF</option>
                    <option value="CNPJ">CNPJ</option>
                    <option value="Email">Email</option>
                    <option value="Chave Aleatória">Chave Aleatória</option>
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor="cfg-titular">Nome do Titular do Pix</label>
                  <input
                    id="cfg-titular"
                    type="text"
                    placeholder="Ex.: João Silva"
                    value={configBarbearia.pixTitular}
                    onChange={(e) =>
                      setConfigBarbearia({ ...configBarbearia, pixTitular: e.target.value })
                    }
                  />
                </div>
                <div className="campo">
                  <label htmlFor="cfg-whats">WhatsApp da Barbearia (com DDI 55)</label>
                  <input
                    id="cfg-whats"
                    type="tel"
                    placeholder="5584999999999"
                    value={configBarbearia.whatsapp}
                    onChange={(e) =>
                      setConfigBarbearia({ ...configBarbearia, whatsapp: e.target.value })
                    }
                  />
                </div>
              </div>
              <button type="submit" className="btn-primario">
                <Save size={16} /> Salvar Pix & WhatsApp
              </button>
            </form>

            <form onSubmit={handleCriarBarbeiro} className="secao-card form-gestao">
              <h2>
                <UserPlus size={18} /> Cadastrar Novo Barbeiro
              </h2>
              <div className="campos-grid">
                <div className="campo">
                  <label htmlFor="b-nome">Nome</label>
                  <input
                    id="b-nome"
                    type="text"
                    placeholder="Ex.: Lucas Silva"
                    value={novoBarbeiro.nome}
                    onChange={(e) => setNovoBarbeiro({ ...novoBarbeiro, nome: e.target.value })}
                    required
                  />
                </div>
                <div className="campo">
                  <label htmlFor="b-esp">Especialidade</label>
                  <input
                    id="b-esp"
                    type="text"
                    placeholder="Ex.: Degradê e Barba"
                    value={novoBarbeiro.especialidade}
                    onChange={(e) =>
                      setNovoBarbeiro({ ...novoBarbeiro, especialidade: e.target.value })
                    }
                  />
                </div>
                <div className="campo">
                  <label htmlFor="b-email">Email de acesso</label>
                  <input
                    id="b-email"
                    type="email"
                    placeholder="barbeiro@seubigode.com"
                    value={novoBarbeiro.email}
                    onChange={(e) => setNovoBarbeiro({ ...novoBarbeiro, email: e.target.value })}
                    required
                  />
                </div>
                <div className="campo">
                  <label htmlFor="b-senha">Senha inicial</label>
                  <input
                    id="b-senha"
                    type="password"
                    placeholder="Mínimo 4 caracteres"
                    value={novoBarbeiro.senha}
                    onChange={(e) => setNovoBarbeiro({ ...novoBarbeiro, senha: e.target.value })}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn-primario">
                <UserPlus size={16} /> Adicionar Barbeiro
              </button>
            </form>

            <div className="gestao-lista">
              {barbeiros.map((b) => {
                const emEdicao = editandoBarbeiroId === b.id;

                if (emEdicao) {
                  return (
                    <form
                      key={b.id}
                      onSubmit={(e) => handleSalvarEdicaoBarbeiro(e, b.id)}
                      className="secao-card form-editar-barbeiro"
                    >
                      <div className="campos-grid">
                        <div className="campo">
                          <label htmlFor={`edit-nome-${b.id}`}>Nome do barbeiro</label>
                          <input
                            id={`edit-nome-${b.id}`}
                            type="text"
                            value={formEditBarbeiro.nome}
                            onChange={(e) =>
                              setFormEditBarbeiro({ ...formEditBarbeiro, nome: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div className="campo">
                          <label htmlFor={`edit-esp-${b.id}`}>Especialidade</label>
                          <input
                            id={`edit-esp-${b.id}`}
                            type="text"
                            value={formEditBarbeiro.especialidade}
                            onChange={(e) =>
                              setFormEditBarbeiro({
                                ...formEditBarbeiro,
                                especialidade: e.target.value
                              })
                            }
                          />
                        </div>
                        <div className="campo">
                          <label htmlFor={`edit-tel-${b.id}`}>WhatsApp / Telefone</label>
                          <input
                            id={`edit-tel-${b.id}`}
                            type="tel"
                            placeholder="5511999999999"
                            value={formEditBarbeiro.telefone}
                            onChange={(e) =>
                              setFormEditBarbeiro({ ...formEditBarbeiro, telefone: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="editar-acoes">
                        <button type="submit" className="btn-primario">
                          <Save size={15} /> Salvar alterações
                        </button>
                        <button
                          type="button"
                          className="btn-secundario"
                          onClick={() => setEditandoBarbeiroId(null)}
                        >
                          <X size={15} /> Cancelar
                        </button>
                      </div>
                    </form>
                  );
                }

                return (
                  <div key={b.id} className={`gestao-item ${!b.ativo ? 'inativo' : ''}`}>
                    <div>
                      <strong>
                        {b.nome} {b.papel === 'dono' ? '(Dono)' : ''}
                      </strong>
                      <span>
                        {b.especialidade} • {b.email}
                      </span>
                    </div>
                    <div className="gestao-item-acoes">
                      <button
                        type="button"
                        className="btn-secundario"
                        onClick={() => iniciarEdicaoBarbeiro(b)}
                      >
                        <Pencil size={14} /> Editar
                      </button>
                      {b.papel !== 'dono' && (
                        <button
                          type="button"
                          className="btn-secundario"
                          onClick={() => handleToggleBarbeiro(b)}
                        >
                          {b.ativo ? 'Desativar' : 'Reativar'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ==================== ABA FOLGAS / BLOQUEIOS ==================== */}
        {aba === 'bloqueios' && (
          <section className="admin-secao">
            <form onSubmit={handleCriarBloqueio} className="secao-card form-gestao">
              <h2>
                <CalendarOff size={18} /> Bloquear Horário ou Folga
              </h2>
              <div className="campos-grid">
                <div className="campo">
                  <label htmlFor="bl-barb">Barbeiro</label>
                  <select
                    id="bl-barb"
                    className="select-admin"
                    value={novoBloqueio.barbeiroId}
                    onChange={(e) =>
                      setNovoBloqueio({ ...novoBloqueio, barbeiroId: e.target.value })
                    }
                  >
                    {barbeiros.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor="bl-data">Data</label>
                  <input
                    id="bl-data"
                    type="date"
                    value={novoBloqueio.data}
                    onChange={(e) => setNovoBloqueio({ ...novoBloqueio, data: e.target.value })}
                    required
                  />
                </div>
                <div className="campo">
                  <label htmlFor="bl-ini">Das</label>
                  <input
                    id="bl-ini"
                    type="time"
                    value={novoBloqueio.horaInicio}
                    onChange={(e) =>
                      setNovoBloqueio({ ...novoBloqueio, horaInicio: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="campo">
                  <label htmlFor="bl-fim">Até</label>
                  <input
                    id="bl-fim"
                    type="time"
                    value={novoBloqueio.horaFim}
                    onChange={(e) => setNovoBloqueio({ ...novoBloqueio, horaFim: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="campo campo-full">
                <label htmlFor="bl-motivo">Motivo</label>
                <input
                  id="bl-motivo"
                  type="text"
                  placeholder="Ex.: Consulta médica, Folga, Feriado"
                  value={novoBloqueio.motivo}
                  onChange={(e) => setNovoBloqueio({ ...novoBloqueio, motivo: e.target.value })}
                />
              </div>
              <button type="submit" className="btn-primario">
                <CalendarOff size={16} /> Bloquear na Agenda
              </button>
            </form>

            <div className="gestao-lista">
              {bloqueios.length === 0 ? (
                <div className="estado-vazio">Nenhum bloqueio futuro cadastrado.</div>
              ) : (
                bloqueios.map((bl) => (
                  <div key={bl.id} className="gestao-item">
                    <div>
                      <strong>
                        {bl.barbeiroNome} • {bl.data.split('-').reverse().join('/')}
                      </strong>
                      <span>
                        {bl.horaInicio} às {bl.horaFim} — {bl.motivo}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-acao btn-cancelar"
                      onClick={() => handleRemoverBloqueio(bl.id)}
                    >
                      <Trash2 size={14} /> Remover
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
