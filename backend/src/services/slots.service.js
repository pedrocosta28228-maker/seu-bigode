/**
 * Motor de cálculo de horários livres e calendário de disponibilidade.
 * Mantido em funções puras e diretas para ser 100% previsível e testável.
 */

export function parseTimeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatMinutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isValidDateString(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

/**
 * Converte "YYYY-MM-DD" para dia da semana (0=Dom ... 6=Sab) sem risco de fuso horário.
 */
export function getDayOfWeek(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function formatLocalDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToDateString(dateStr, daysToAdd) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day + daysToAdd);
  return formatLocalDate(d);
}

function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

/**
 * Calcula os horários disponíveis para UM barbeiro específico em uma data.
 */
export function getAvailableSlotsForBarber({
  db,
  barbeiroId,
  data,
  duracaoMin,
  intervaloMin = 30,
  agora = new Date()
}) {
  if (!isValidDateString(data) || !Number.isFinite(duracaoMin) || duracaoMin <= 0) {
    return [];
  }

  const hojeStr = formatLocalDate(agora);
  if (data < hojeStr) {
    return [];
  }

  const diaSemana = getDayOfWeek(data);
  const expediente = db
    .prepare(
      `SELECT hora_inicio, hora_fim, almoco_inicio, almoco_fim
       FROM horarios_trabalho
       WHERE barbeiro_id = ? AND dia_semana = ?`
    )
    .get(barbeiroId, diaSemana);

  if (!expediente) {
    return [];
  }

  const inicioExp = parseTimeToMinutes(expediente.hora_inicio);
  const fimExp = parseTimeToMinutes(expediente.hora_fim);

  // Intervalos indisponíveis: almoço + bloqueios manuais + agendamentos ativos
  const ocupados = [];

  if (expediente.almoco_inicio && expediente.almoco_fim) {
    ocupados.push({
      inicio: parseTimeToMinutes(expediente.almoco_inicio),
      fim: parseTimeToMinutes(expediente.almoco_fim)
    });
  }

  const bloqueios = db
    .prepare(
      `SELECT hora_inicio, hora_fim
       FROM bloqueios
       WHERE barbeiro_id = ? AND data = ?`
    )
    .all(barbeiroId, data);

  for (const b of bloqueios) {
    ocupados.push({
      inicio: parseTimeToMinutes(b.hora_inicio),
      fim: parseTimeToMinutes(b.hora_fim)
    });
  }

  const agendamentos = db
    .prepare(
      `SELECT hora_inicio, hora_fim
       FROM agendamentos
       WHERE barbeiro_id = ? AND data = ? AND status != 'cancelado'`
    )
    .all(barbeiroId, data);

  for (const ag of agendamentos) {
    ocupados.push({
      inicio: parseTimeToMinutes(ag.hora_inicio),
      fim: parseTimeToMinutes(ag.hora_fim)
    });
  }

  // Margem de 15 minutos se for hoje (evita agendar um horário que já está passando)
  const minutoMinimoHoje =
    data === hojeStr ? agora.getHours() * 60 + agora.getMinutes() + 15 : -1;

  const horariosLivres = [];
  for (let slotInicio = inicioExp; slotInicio + duracaoMin <= fimExp; slotInicio += intervaloMin) {
    const slotFim = slotInicio + duracaoMin;

    if (slotInicio < minutoMinimoHoje) {
      continue;
    }

    const temConflito = ocupados.some((bloco) =>
      intervalsOverlap(slotInicio, slotFim, bloco.inicio, bloco.fim)
    );

    if (!temConflito) {
      horariosLivres.push({
        horaInicio: formatMinutesToTime(slotInicio),
        horaFim: formatMinutesToTime(slotFim),
        barbeirosDisponiveis: [Number(barbeiroId)]
      });
    }
  }

  return horariosLivres;
}

/**
 * Calcula horários disponíveis para um barbeiro específico OU para "qualquer" barbeiro ativo.
 */
export function getAvailableSlots({
  db,
  barbeiroId,
  data,
  duracaoMin,
  intervaloMin = 30,
  agora = new Date()
}) {
  if (barbeiroId !== 'qualquer') {
    return getAvailableSlotsForBarber({
      db,
      barbeiroId: Number(barbeiroId),
      data,
      duracaoMin,
      intervaloMin,
      agora
    });
  }

  const barbeirosAtivos = db
    .prepare('SELECT id FROM barbeiros WHERE ativo = 1 ORDER BY id ASC')
    .all();

  const mapaSlots = new Map();

  for (const b of barbeirosAtivos) {
    const slots = getAvailableSlotsForBarber({
      db,
      barbeiroId: b.id,
      data,
      duracaoMin,
      intervaloMin,
      agora
    });

    for (const slot of slots) {
      if (!mapaSlots.has(slot.horaInicio)) {
        mapaSlots.set(slot.horaInicio, {
          horaInicio: slot.horaInicio,
          horaFim: slot.horaFim,
          barbeirosDisponiveis: [b.id]
        });
      } else {
        mapaSlots.get(slot.horaInicio).barbeirosDisponiveis.push(b.id);
      }
    }
  }

  return Array.from(mapaSlots.values()).sort((a, b) =>
    a.horaInicio.localeCompare(b.horaInicio)
  );
}

/**
 * Retorna um resumo dos próximos N dias (hoje, amanhã, semana...) para o calendário do cliente.
 */
export function getCalendarAvailability({
  db,
  barbeiroId = 'qualquer',
  duracaoMin = 30,
  dias = 14,
  agora = new Date()
}) {
  const totalDias = Math.min(Math.max(Number(dias) || 14, 1), 31);
  const hojeStr = formatLocalDate(agora);
  const resultado = [];

  for (let i = 0; i < totalDias; i++) {
    const data = addDaysToDateString(hojeStr, i);
    const diaSemana = getDayOfWeek(data);
    const slots = getAvailableSlots({
      db,
      barbeiroId,
      data,
      duracaoMin,
      agora
    });

    resultado.push({
      data,
      diaSemana,
      totalHorariosLivres: slots.length,
      disponivel: slots.length > 0
    });
  }

  return resultado;
}
