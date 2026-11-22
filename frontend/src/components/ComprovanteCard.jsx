import { CheckCircle2, Calendar, Clock, Scissors, User, MessageCircle, RotateCcw } from 'lucide-react';
import { formatCurrency, formatDuration, formatFullDate } from '../utils/format.js';

export function ComprovanteCard({ agendamento, barbeariaWhatsapp, onNovoAgendamento }) {
  const nomesServicos = agendamento.servicos.map((s) => s.nome).join(', ');
  const textoWhatsapp = encodeURIComponent(
    `Olá, Seu Bigode! Acabei de agendar pelo site:\n` +
      `Código: ${agendamento.codigo}\n` +
      `Cliente: ${agendamento.clienteNome}\n` +
      `Barbeiro: ${agendamento.barbeiro.nome}\n` +
      `Data: ${formatFullDate(agendamento.data)} às ${agendamento.horaInicio}\n` +
      `Serviços: ${nomesServicos}\n` +
      `Total: ${formatCurrency(agendamento.totalCentavos)}`
  );

  const linkWhatsapp = `https://wa.me/${barbeariaWhatsapp}?text=${textoWhatsapp}`;

  return (
    <section className="comprovante-card" aria-live="polite">
      <div className="comprovante-topo">
        <CheckCircle2 size={44} className="comprovante-icone" />
        <span className="comprovante-codigo">{agendamento.codigo}</span>
        <h2>Horário Confirmado!</h2>
        <p>Apresente este comprovante ao chegar na barbearia Seu Bigode.</p>
      </div>

      <div className="comprovante-detalhes">
        <div className="detalhe-linha">
          <User size={18} />
          <div>
            <span>Barbeiro</span>
            <strong>{agendamento.barbeiro.nome}</strong>
          </div>
        </div>

        <div className="detalhe-linha">
          <Calendar size={18} />
          <div>
            <span>Data</span>
            <strong>{formatFullDate(agendamento.data)}</strong>
          </div>
        </div>

        <div className="detalhe-linha">
          <Clock size={18} />
          <div>
            <span>Horário</span>
            <strong>
              {agendamento.horaInicio} às {agendamento.horaFim} ({formatDuration(agendamento.duracaoTotalMin)})
            </strong>
          </div>
        </div>

        <div className="detalhe-linha">
          <Scissors size={18} />
          <div>
            <span>Serviços</span>
            <ul className="comprovante-lista-servicos">
              {agendamento.servicos.map((s) => (
                <li key={s.id}>
                  <span>{s.nome}</span>
                  <strong>{formatCurrency(s.precoCentavos)}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="comprovante-total">
        <span>Total a pagar na barbearia</span>
        <strong>{formatCurrency(agendamento.totalCentavos)}</strong>
      </div>

      <div className="comprovante-acoes">
        <a
          href={linkWhatsapp}
          target="_blank"
          rel="noreferrer"
          className="btn-primario btn-whatsapp"
        >
          <MessageCircle size={18} />
          Enviar resumo no WhatsApp
        </a>

        <button type="button" className="btn-secundario" onClick={onNovoAgendamento}>
          <RotateCcw size={16} />
          Fazer novo agendamento
        </button>
      </div>
    </section>
  );
}
