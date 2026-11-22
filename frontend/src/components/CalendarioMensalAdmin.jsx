import { ChevronLeft, ChevronRight } from 'lucide-react';

const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function CalendarioMensalAdmin({
  ano,
  mes, // 0..11
  hojeStr,
  diaSelecionado,
  verMesTodo,
  contagemPorDia,
  onSelecionarDia,
  onMudarMes
}) {
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const totalDiasMes = new Date(ano, mes + 1, 0).getDate();

  const celulas = [];
  for (let i = 0; i < primeiroDiaSemana; i++) {
    celulas.push(null);
  }
  for (let dia = 1; dia <= totalDiasMes; dia++) {
    const dataStr = `${ano}-${pad2(mes + 1)}-${pad2(dia)}`;
    celulas.push({
      dia,
      dataStr,
      qtdAtivos: contagemPorDia[dataStr] || 0
    });
  }

  return (
    <div className="cal-mensal-box">
      <div className="cal-mensal-topo">
        <h2>Calendário do mês</h2>
        <div className="cal-mensal-nav">
          <button
            type="button"
            className="cal-nav-btn"
            onClick={() => onMudarMes(-1)}
            aria-label="Mês anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="cal-mes-titulo">
            {MESES[mes]} de {ano}
          </span>
          <button
            type="button"
            className="cal-nav-btn"
            onClick={() => onMudarMes(1)}
            aria-label="Próximo mês"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="cal-semana-header">
        {DIAS_SEMANA.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="cal-dias-grid">
        {celulas.map((celula, idx) => {
          if (!celula) {
            return <div key={`vazio-${idx}`} className="cal-dia-vazio" />;
          }

          const ehHoje = celula.dataStr === hojeStr;
          const selecionado = !verMesTodo && celula.dataStr === diaSelecionado;
          const temAgendamento = celula.qtdAtivos > 0;

          return (
            <button
              key={celula.dataStr}
              type="button"
              onClick={() => onSelecionarDia(celula.dataStr)}
              className={[
                'cal-dia-btn',
                temAgendamento ? 'tem-agendamento' : '',
                ehHoje ? 'eh-hoje' : '',
                selecionado ? 'selecionado' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={selecionado}
            >
              <span className="cal-dia-num">{celula.dia}</span>
              {temAgendamento && (
                <span className="cal-dia-qtd">
                  {celula.qtdAtivos} {celula.qtdAtivos === 1 ? 'corte' : 'cortes'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="cal-legenda">
        <span>
          <i className="legenda-dot verde" /> Com agendamento
        </span>
        <span>
          <i className="legenda-dot hoje" /> Hoje
        </span>
        <span>
          <i className="legenda-dot selecionado" /> Dia selecionado
        </span>
      </div>
    </div>
  );
}
