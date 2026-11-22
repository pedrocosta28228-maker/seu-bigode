import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Calendar,
  Clock,
  Copy,
  MessageCircle,
  QrCode,
  RotateCcw,
  Scissors,
  User
} from 'lucide-react';
import { formatCurrency, formatDuration, formatFullDate } from '../utils/format.js';
import { montarLinkWhatsappCliente } from '../utils/whatsapp.js';

export function ComprovanteCard({ agendamento, config, onNovoAgendamento }) {
  const [copiado, setCopiado] = useState(false);

  const linkWhatsapp = montarLinkWhatsappCliente({ agendamento, config });

  async function copiarChavePix() {
    if (!config?.pixChave) return;
    try {
      await navigator.clipboard.writeText(config.pixChave);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // fallback silencioso caso clipboard não esteja disponível
    }
  }

  return (
    <section className="comprovante-card" aria-live="polite">
      <div className="comprovante-topo">
        <CheckCircle2 size={44} className="comprovante-icone" />
        <div className="comprovante-badges">
          <span className="comprovante-numero">ATENDIMENTO Nº {agendamento.id}</span>
          <span className="comprovante-codigo">{agendamento.codigo}</span>
        </div>
        <h2>Horário Agendado!</h2>
        <p>Apresente este comprovante na barbearia {config?.nome || 'Seu Bigode'}.</p>
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
        <span>Total do atendimento</span>
        <strong>{formatCurrency(agendamento.totalCentavos)}</strong>
      </div>

      {config?.pixChave && (
        <div className="pix-box">
          <div className="pix-box-topo">
            <QrCode size={18} />
            <strong>Quer adiantar pelo Pix? (opcional)</strong>
          </div>
          <p className="pix-box-desc">
            Pague agora e envie o comprovante no WhatsApp, ou pague na barbearia após o corte.
          </p>
          <div className="pix-chave-linha">
            <div>
              <span className="pix-tipo">
                {config.pixTipo || 'Chave Pix'} — {config.pixTitular || config.nome}
              </span>
              <code className="pix-chave-valor">{config.pixChave}</code>
            </div>
            <button type="button" className="btn-copiar-pix" onClick={copiarChavePix}>
              {copiado ? <Check size={15} /> : <Copy size={15} />}
              {copiado ? 'Copiado!' : 'Copiar Pix'}
            </button>
          </div>
        </div>
      )}

      <div className="comprovante-acoes">
        <a
          href={linkWhatsapp}
          target="_blank"
          rel="noreferrer"
          className="btn-primario btn-whatsapp"
        >
          <MessageCircle size={18} />
          Enviar comprovante no WhatsApp
        </a>

        <button type="button" className="btn-secundario" onClick={onNovoAgendamento}>
          <RotateCcw size={16} />
          Fazer novo agendamento
        </button>
      </div>
    </section>
  );
}
