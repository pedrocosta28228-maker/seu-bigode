const DIAS_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_SEMANA_LONGO = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];
const MESES_CURTO = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez'
];

export function formatCurrency(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

export function formatDuration(minutos) {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

export function parseDateParts(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

export function formatDayCard(dateStr, diaSemana, index) {
  const { day, month } = parseDateParts(dateStr);
  let rotulo = DIAS_SEMANA_CURTO[diaSemana];
  if (index === 0) rotulo = 'Hoje';
  if (index === 1) rotulo = 'Amanhã';

  return {
    rotulo,
    diaNumero: String(day).padStart(2, '0'),
    mes: MESES_CURTO[month - 1]
  };
}

export function formatFullDate(dateStr) {
  const { year, month, day } = parseDateParts(dateStr);
  const d = new Date(year, month - 1, day);
  return `${DIAS_SEMANA_LONGO[d.getDay()]}, ${String(day).padStart(2, '0')} de ${MESES_CURTO[month - 1]}`;
}

export function maskWhatsapp(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
