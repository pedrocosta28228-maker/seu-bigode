import { Clock } from 'lucide-react';

export function GradeHorarios({
  horarios,
  horarioSelecionado,
  onSelecionarHorario,
  carregando
}) {
  if (carregando) {
    return (
      <div className="estado-vazio">
        <Clock size={18} />
        <span>Buscando horários livres...</span>
      </div>
    );
  }

  if (horarios.length === 0) {
    return (
      <div className="estado-vazio">
        <Clock size={18} />
        <span>Nenhum horário disponível neste dia para a duração escolhida. Tente outro dia!</span>
      </div>
    );
  }

  const manha = horarios.filter((h) => h.horaInicio < '12:00');
  const tarde = horarios.filter((h) => h.horaInicio >= '12:00');

  const renderGrupo = (titulo, lista) => {
    if (lista.length === 0) return null;
    return (
      <div className="horarios-grupo">
        <span className="horarios-periodo">{titulo}</span>
        <div className="horarios-grid">
          {lista.map((slot) => {
            const ativo = horarioSelecionado === slot.horaInicio;
            return (
              <button
                key={slot.horaInicio}
                type="button"
                className={`horario-btn ${ativo ? 'selecionado' : ''}`}
                onClick={() => onSelecionarHorario(slot.horaInicio)}
              >
                {slot.horaInicio}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="horarios-container">
      {renderGrupo('Manhã', manha)}
      {renderGrupo('Tarde / Noite', tarde)}
    </div>
  );
}
