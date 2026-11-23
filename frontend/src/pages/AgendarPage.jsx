import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Scissors,
  Sparkles,
  User,
  Users,
  AlertCircle
} from 'lucide-react';
import { publicApi } from '../services/api.js';
import {
  formatCurrency,
  formatDuration,
  formatFullDate,
  maskWhatsapp
} from '../utils/format.js';
import { CalendarioSemana } from '../components/CalendarioSemana.jsx';
import { GradeHorarios } from '../components/GradeHorarios.jsx';
import { ComprovanteCard } from '../components/ComprovanteCard.jsx';

const CATEGORIAS = [
  { id: 'todos', label: 'Todos' },
  { id: 'cabelo', label: 'Cabelo' },
  { id: 'barba', label: 'Barba' },
  { id: 'combo', label: 'Combos' },
  { id: 'extra', label: 'Extras' }
];

export function AgendarPage({ onAbrirAdmin }) {
  const [config, setConfig] = useState({ nome: 'Seu Bigode', desde: 2019, whatsapp: '5511999999999' });
  const [barbeiros, setBarbeiros] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState('todos');

  const [servicosSelecionados, setServicosSelecionados] = useState([]);
  const [barbeiroId, setBarbeiroId] = useState('qualquer');

  const [diasCalendario, setDiasCalendario] = useState([]);
  const [carregandoCalendario, setCarregandoCalendario] = useState(false);
  const [dataSelecionada, setDataSelecionada] = useState('');

  const [horarios, setHorarios] = useState([]);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [horarioSelecionado, setHorarioSelecionado] = useState('');

  const [clienteNome, setClienteNome] = useState('');
  const [clienteWhatsapp, setClienteWhatsapp] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [agendamentoConfirmado, setAgendamentoConfirmado] = useState(null);
  const [camposInvalidos, setCamposInvalidos] = useState({ nome: false, whatsapp: false });

  function sincronizarValidadeCampo(campo, inputEl) {
    const invalido = inputEl.matches(':user-invalid');
    setCamposInvalidos((prev) => (prev[campo] === invalido ? prev : { ...prev, [campo]: invalido }));
  }

  // Carrega dados iniciais da barbearia
  useEffect(() => {
    let ativo = true;
    async function carregarInicial() {
      try {
        const [cfg, listaBarbeiros, listaServicos] = await Promise.all([
          publicApi.getConfig(),
          publicApi.getBarbeiros(),
          publicApi.getServicos()
        ]);
        if (!ativo) return;
        setConfig(cfg);
        setBarbeiros(listaBarbeiros);
        setServicos(listaServicos);
      } catch (err) {
        if (ativo) setErro(err.message);
      }
    }
    carregarInicial();
    return () => {
      ativo = false;
    };
  }, []);

  const resumo = useMemo(() => {
    const escolhidos = servicos.filter((s) => servicosSelecionados.includes(s.id));
    return {
      itens: escolhidos,
      duracaoMin: escolhidos.reduce((acc, s) => acc + s.duracaoMin, 0),
      totalCentavos: escolhidos.reduce((acc, s) => acc + s.precoCentavos, 0)
    };
  }, [servicos, servicosSelecionados]);

  const duracaoConsulta = resumo.duracaoMin || 30;

  // Atualiza calendário de próximos 14 dias sempre que muda barbeiro ou duração total
  useEffect(() => {
    let ativo = true;
    async function carregarCalendario() {
      setCarregandoCalendario(true);
      try {
        const listaDias = await publicApi.getCalendario({
          barbeiroId,
          duracaoMin: duracaoConsulta,
          dias: 14
        });
        if (!ativo) return;
        setDiasCalendario(listaDias);

        // Mantém a data atual se ainda estiver disponível; senão seleciona o primeiro dia livre
        setDataSelecionada((atual) => {
          const aindaLivre = listaDias.find((d) => d.data === atual && d.disponivel);
          if (aindaLivre) return atual;
          const primeiroLivre = listaDias.find((d) => d.disponivel);
          return primeiroLivre ? primeiroLivre.data : '';
        });
      } catch (err) {
        if (ativo) setErro(err.message);
      } finally {
        if (ativo) setCarregandoCalendario(false);
      }
    }
    carregarCalendario();
    return () => {
      ativo = false;
    };
  }, [barbeiroId, duracaoConsulta]);

  // Atualiza grade de horários da data selecionada
  useEffect(() => {
    if (!dataSelecionada) {
      setHorarios([]);
      setHorarioSelecionado('');
      return;
    }

    let ativo = true;
    async function carregarHorarios() {
      setCarregandoHorarios(true);
      try {
        const lista = await publicApi.getHorarios({
          barbeiroId,
          data: dataSelecionada,
          duracaoMin: duracaoConsulta
        });
        if (!ativo) return;
        setHorarios(lista);
        setHorarioSelecionado((atual) =>
          lista.some((h) => h.horaInicio === atual) ? atual : ''
        );
      } catch (err) {
        if (ativo) setErro(err.message);
      } finally {
        if (ativo) setCarregandoHorarios(false);
      }
    }
    carregarHorarios();
    return () => {
      ativo = false;
    };
  }, [barbeiroId, dataSelecionada, duracaoConsulta]);

  const servicosFiltrados = useMemo(() => {
    if (categoriaAtiva === 'todos') return servicos;
    return servicos.filter((s) => s.categoria === categoriaAtiva);
  }, [servicos, categoriaAtiva]);

  function alternarServico(id) {
    setErro('');
    setServicosSelecionados((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  async function handleConfirmar(event) {
    event.preventDefault();
    setErro('');

    if (servicosSelecionados.length === 0) {
      setErro('Escolha pelo menos um serviço antes de confirmar.');
      return;
    }
    if (!dataSelecionada || !horarioSelecionado) {
      setErro('Selecione um dia e um horário disponível no calendário.');
      return;
    }

    setEnviando(true);
    try {
      const criado = await publicApi.criarAgendamento({
        barbeiroId,
        servicoIds: servicosSelecionados,
        data: dataSelecionada,
        horaInicio: horarioSelecionado,
        clienteNome,
        clienteWhatsapp,
        observacoes
      });
      setAgendamentoConfirmado(criado);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  function handleNovoAgendamento() {
    setAgendamentoConfirmado(null);
    setServicosSelecionados([]);
    setHorarioSelecionado('');
    setObservacoes('');
    setErro('');
  }

  const podeConfirmar =
    servicosSelecionados.length > 0 &&
    Boolean(dataSelecionada) &&
    Boolean(horarioSelecionado) &&
    clienteNome.trim().length >= 2 &&
    clienteWhatsapp.replace(/\D/g, '').length >= 10 &&
    !enviando;

  return (
    <div className="app-shell">
      <header className="hero-header">
        <div className="hero-conteudo">
          <img
            src="/logo-seu-bigode.jpg"
            alt="Logo Barbearia Seu Bigode"
            className="hero-logo"
          />
          <div>
            <span className="hero-selinho">DESDE {config.desde}</span>
            <h1 className="hero-titulo">{config.nome}</h1>
            <p className="hero-subtitulo">Agende seu horário online.</p>
          </div>
          {onAbrirAdmin && (
            <button type="button" className="btn-area-barbeiro" onClick={onAbrirAdmin}>
              Área do Barbeiro
            </button>
          )}
        </div>
      </header>

      <main className="conteudo-principal">
        {agendamentoConfirmado ? (
          <ComprovanteCard
            agendamento={agendamentoConfirmado}
            config={config}
            onNovoAgendamento={handleNovoAgendamento}
          />
        ) : (
          <form onSubmit={handleConfirmar} className="fluxo-agendamento" noValidate>
            {erro && (
              <div className="alerta-erro" role="alert">
                <AlertCircle size={18} />
                <span>{erro}</span>
              </div>
            )}

            {/* PASSO 1: SERVIÇOS */}
            <section className="secao-card">
              <div className="secao-cabecalho">
                <span className="passo-badge">1</span>
                <div>
                  <h2>Serviços</h2>
                </div>
              </div>

              <div className="categorias-tabs" role="tablist">
                {CATEGORIAS.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={categoriaAtiva === cat.id}
                    className={`categoria-pill ${categoriaAtiva === cat.id ? 'ativa' : ''}`}
                    onClick={() => setCategoriaAtiva(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="servicos-grid">
                {servicosFiltrados.map((servico) => {
                  const selecionado = servicosSelecionados.includes(servico.id);
                  return (
                    <button
                      key={servico.id}
                      type="button"
                      className={`servico-card ${selecionado ? 'selecionado' : ''}`}
                      onClick={() => alternarServico(servico.id)}
                    >
                      <div className="servico-topo">
                        <div className="servico-info">
                          <strong>{servico.nome}</strong>
                        </div>
                        <span className="servico-check" aria-hidden="true">
                          {selecionado ? <Check size={16} /> : <Scissors size={15} />}
                        </span>
                      </div>

                      <div className="servico-rodape">
                        <span className="servico-duracao">
                          <Clock size={14} />
                          {formatDuration(servico.duracaoMin)}
                        </span>
                        <strong className="servico-preco">
                          {formatCurrency(servico.precoCentavos)}
                        </strong>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* PASSO 2: BARBEIRO */}
            <section className="secao-card">
              <div className="secao-cabecalho">
                <span className="passo-badge">2</span>
                <div>
                  <h2>Barbeiro</h2>
                </div>
              </div>

              <div className="barbeiros-grid">
                <button
                  type="button"
                  className={`barbeiro-card ${barbeiroId === 'qualquer' ? 'selecionado' : ''}`}
                  onClick={() => setBarbeiroId('qualquer')}
                >
                  <div className="barbeiro-avatar">
                    <Sparkles size={20} />
                  </div>
                  <div className="barbeiro-texto">
                    <strong>Qualquer disponível</strong>
                    <span>Primeiro horário livre</span>
                  </div>
                </button>

                {barbeiros.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`barbeiro-card ${barbeiroId === b.id ? 'selecionado' : ''}`}
                    onClick={() => setBarbeiroId(b.id)}
                  >
                    <div className="barbeiro-avatar">
                      {b.papel === 'dono' ? <User size={20} /> : <Users size={20} />}
                    </div>
                    <div className="barbeiro-texto">
                      <strong>{b.nome}</strong>
                      <span>{b.especialidade}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* PASSO 3: CALENDÁRIO DE DIAS FUTUROS + HORÁRIOS */}
            <section className="secao-card">
              <div className="secao-cabecalho">
                <span className="passo-badge">3</span>
                <div>
                  <h2>Dia e horário</h2>
                  {resumo.duracaoMin > 0 && (
                    <p>Duração total: {formatDuration(resumo.duracaoMin)}</p>
                  )}
                </div>
              </div>

              <CalendarioSemana
                dias={diasCalendario}
                dataSelecionada={dataSelecionada}
                onSelecionarData={setDataSelecionada}
                carregando={carregandoCalendario}
              />

              {dataSelecionada && (
                <div className="horarios-secao">
                  <h3 className="horarios-data-titulo">
                    Horários para {formatFullDate(dataSelecionada)}
                  </h3>
                  <GradeHorarios
                    horarios={horarios}
                    horarioSelecionado={horarioSelecionado}
                    onSelecionarHorario={setHorarioSelecionado}
                    carregando={carregandoHorarios}
                  />
                </div>
              )}
            </section>

            {/* PASSO 4: DADOS DO CLIENTE */}
            <section className="secao-card">
              <div className="secao-cabecalho">
                <span className="passo-badge">4</span>
                <div>
                  <h2>Seus dados</h2>
                </div>
              </div>

              <div className="campos-grid">
                <div className="campo">
                  <label htmlFor="cliente-nome">Nome</label>
                  <input
                    id="cliente-nome"
                    type="text"
                    placeholder="Seu nome"
                    value={clienteNome}
                    onChange={(e) => {
                      setClienteNome(e.target.value);
                      if (camposInvalidos.nome) sincronizarValidadeCampo('nome', e.target);
                    }}
                    onBlur={(e) => sincronizarValidadeCampo('nome', e.target)}
                    onInvalid={(e) => sincronizarValidadeCampo('nome', e.target)}
                    autoComplete="name"
                    minLength={2}
                    required
                    aria-invalid={camposInvalidos.nome ? 'true' : 'false'}
                    aria-describedby={camposInvalidos.nome ? 'cliente-nome-erro' : undefined}
                  />
                  <span id="cliente-nome-erro" className="campo-erro">
                    <span role="img" aria-label="Erro">!</span> Informe pelo menos 2 letras do seu nome.
                  </span>
                </div>

                <div className="campo">
                  <label htmlFor="cliente-whatsapp">WhatsApp</label>
                  <input
                    id="cliente-whatsapp"
                    type="tel"
                    inputMode="tel"
                    placeholder="(84) 99999-9999"
                    value={clienteWhatsapp}
                    onChange={(e) => {
                      setClienteWhatsapp(maskWhatsapp(e.target.value));
                      if (camposInvalidos.whatsapp) sincronizarValidadeCampo('whatsapp', e.target);
                    }}
                    onBlur={(e) => sincronizarValidadeCampo('whatsapp', e.target)}
                    onInvalid={(e) => sincronizarValidadeCampo('whatsapp', e.target)}
                    autoComplete="tel"
                    pattern="\(\d{2}\) \d{4,5}-\d{4}"
                    required
                    aria-invalid={camposInvalidos.whatsapp ? 'true' : 'false'}
                    aria-describedby={camposInvalidos.whatsapp ? 'cliente-whatsapp-erro' : undefined}
                  />
                  <span id="cliente-whatsapp-erro" className="campo-erro">
                    <span role="img" aria-label="Erro">!</span> Digite um WhatsApp válido com DDD.
                  </span>
                </div>
              </div>

              <div className="campo campo-full">
                <label htmlFor="cliente-obs">Observação (opcional)</label>
                <input
                  id="cliente-obs"
                  type="text"
                  placeholder="Ex.: Degradê navalhado na zero..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
            </section>

            {/* BARRA FIXA DE RESUMO */}
            <div className="barra-resumo">
              <div className="barra-resumo-conteudo">
                <div className="resumo-valores">
                  <span className="resumo-meta">
                    {resumo.itens.length === 0
                      ? 'Nenhum serviço selecionado'
                      : `${resumo.itens.length} ${resumo.itens.length === 1 ? 'serviço' : 'serviços'} • ${formatDuration(resumo.duracaoMin)}`}
                    {horarioSelecionado && dataSelecionada ? ` • ${horarioSelecionado}` : ''}
                  </span>
                  <strong className="resumo-total">{formatCurrency(resumo.totalCentavos)}</strong>
                </div>

                <button
                  type="submit"
                  className="btn-primario"
                  disabled={!podeConfirmar}
                >
                  {enviando ? 'Confirmando...' : 'Confirmar Agendamento'}
                </button>
              </div>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
