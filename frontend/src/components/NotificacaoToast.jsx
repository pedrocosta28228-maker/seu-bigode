import { useEffect, useRef } from 'react';
import { BellRing, X } from 'lucide-react';
import { formatCurrency } from '../utils/format.js';

function ToastItem({ item, onFechar }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (el && typeof el.showPopover === 'function') {
      try {
        el.showPopover();
      } catch {
        // fallback caso já esteja aberto
      }
    }
  }, []);

  return (
    <div
      ref={ref}
      id={`toast-${item.uid}`}
      popover="manual"
      className="toast-item"
    >
      <div className="toast-icone">
        <BellRing size={18} />
      </div>
      <div className="toast-corpo">
        <strong>Novo agendamento ({item.codigo})</strong>
        <p>
          {item.clienteNome} • {item.data} às {item.horaInicio} ({item.barbeiro?.nome})
        </p>
        <span className="toast-valor">{formatCurrency(item.totalCentavos)}</span>
      </div>
      <button
        type="button"
        className="toast-fechar"
        aria-label="Fechar notificação"
        onClick={() => onFechar(item.uid)}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function NotificacaoToast({ toasts, anuncioTexto, onFechar }) {
  return (
    <>
      {/* Fallback de anúncio para navegadores sem ariaNotify() */}
      <div aria-live="polite" className="visually-hidden">
        {anuncioTexto}
      </div>

      <div
        role="region"
        aria-label="Notificações de novos agendamentos"
        className="toast-regiao"
      >
        {toasts.map((item) => (
          <ToastItem key={item.uid} item={item} onFechar={onFechar} />
        ))}
      </div>
    </>
  );
}
