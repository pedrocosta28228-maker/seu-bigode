import { Calendar } from 'lucide-react';
import { formatDayCard } from '../utils/format.js';

export function CalendarioSemana({ dias, dataSelecionada, onSelecionarData, carregando }) {
  if (carregando && dias.length === 0) {
    return (
      <div className="estado-vazio">
        <Calendar size={20} />
        <span>Carregando agenda dos próximos dias...</span>
      </div>
    );
  }

  return (
    <div className="calendario-faixa" role="listbox" aria-label="Escolha o dia">
      {dias.map((dia, index) => {
        const { rotulo, diaNumero, mes } = formatDayCard(dia.data, dia.diaSemana, index);
        const selecionado = dia.data === dataSelecionada;
        const indisponivel = !dia.disponivel;

        return (
          <button
            key={dia.data}
            type="button"
            role="option"
            aria-selected={selecionado}
            disabled={indisponivel}
            onClick={() => onSelecionarData(dia.data)}
            className={`dia-card ${selecionado ? 'selecionado' : ''} ${
              indisponivel ? 'indisponivel' : ''
            }`}
          >
            <span className="dia-rotulo">{rotulo}</span>
            <strong className="dia-numero">{diaNumero}</strong>
            <span className="dia-mes">{mes}</span>
            <span className="dia-badge">
              {indisponivel
                ? 'Fechado'
                : `${dia.totalHorariosLivres} ${dia.totalHorariosLivres === 1 ? 'livre' : 'livres'}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
