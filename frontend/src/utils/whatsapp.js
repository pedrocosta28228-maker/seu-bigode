import { formatCurrency, formatDuration, formatFullDate } from './format.js';

function normalizarNumeroBR(numero) {
  const digits = String(numero || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

/**
 * Mensagem que o CLIENTE envia para a barbearia ao finalizar o agendamento.
 */
export function montarLinkWhatsappCliente({ agendamento, config }) {
  const nomeBarbearia = (config?.nome || 'Seu Bigode').toUpperCase();
  const linhasServicos = agendamento.servicos
    .map((s) => `• ${s.nome} — ${formatCurrency(s.precoCentavos)}`)
    .join('\n');

  const blocoPix = config?.pixChave
    ? [
        '-------------------------------------',
        '💠 PAGAMENTO VIA PIX (opcional)',
        'Pague agora e envie o comprovante aqui, ou pague na barbearia após o corte.',
        `CHAVE: ${config.pixChave}`,
        `TITULAR: ${config.pixTipo || 'Pix'} - ${config.pixTitular || config.nome}`
      ].join('\n')
    : '';

  const texto = [
    `💈 BARBEARIA ${nomeBarbearia} 💈`,
    `ATENDIMENTO Nº ${agendamento.id} (${agendamento.codigo})`,
    `🗓️ DATA: ${formatFullDate(agendamento.data)}`,
    `⏰ HORÁRIO: ${agendamento.horaInicio} às ${agendamento.horaFim}`,
    `✂️ Barbeiro: ${agendamento.barbeiro?.nome || ''}`,
    `👤 Cliente: ${agendamento.clienteNome}`,
    '-------------------------------------',
    linhasServicos,
    '-------------------------------------',
    `TOTAL: ${formatCurrency(agendamento.totalCentavos)} (${formatDuration(agendamento.duracaoTotalMin)})`,
    blocoPix,
    '',
    '✅ AGENDAMENTO ENVIADO ✅'
  ]
    .filter(Boolean)
    .join('\n');

  const destino = normalizarNumeroBR(config?.whatsapp);
  return `https://wa.me/${destino}?text=${encodeURIComponent(texto)}`;
}

/**
 * Mensagem que o BARBEIRO envia para o cliente confirmando o horário + chave Pix.
 */
export function montarLinkWhatsappConfirmacao({ agendamento, config }) {
  const nomeBarbearia = (config?.nome || 'Seu Bigode').toUpperCase();
  const linhasServicos = (agendamento.servicos || [])
    .map((s) => `• ${s.nome} — ${formatCurrency(s.precoCentavos)}`)
    .join('\n');

  const blocoPix = config?.pixChave
    ? [
        '-------------------------------------',
        '💠 PIX (se preferir adiantar):',
        'Você pode pagar agora usando a chave abaixo e enviar o comprovante aqui, ou pagar na barbearia depois do corte!',
        `CHAVE: ${config.pixChave}`,
        `TITULAR: ${config.pixTipo || 'Pix'} - ${config.pixTitular || config.nome}`
      ].join('\n')
    : '';

  const texto = [
    `💈 BARBEARIA ${nomeBarbearia} 💈`,
    `✅ Olá, ${agendamento.clienteNome}! Seu agendamento está CONFIRMADO!`,
    `ATENDIMENTO Nº ${agendamento.id} (${agendamento.codigo})`,
    '',
    `🗓️ Data: ${formatFullDate(agendamento.data)}`,
    `⏰ Horário: ${agendamento.horaInicio} às ${agendamento.horaFim}`,
    `✂️ Barbeiro: ${agendamento.barbeiroNome}`,
    '-------------------------------------',
    linhasServicos,
    '-------------------------------------',
    `TOTAL: ${formatCurrency(agendamento.totalCentavos)}`,
    blocoPix,
    '',
    'Te esperamos lá! 💈'
  ]
    .filter(Boolean)
    .join('\n');

  const destino = normalizarNumeroBR(agendamento.clienteWhatsapp);
  return `https://wa.me/${destino}?text=${encodeURIComponent(texto)}`;
}
