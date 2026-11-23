/**
 * Motor de cálculo de horários livres e calendário de disponibilidade.
 * Compatível com SQLite local e PostgreSQL na nuvem via interface assíncrona do db.
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

export async function getAvailableSlotsForBarber({
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
  const expediente = await db.get(
    `SELECT hora_inicio, hora_fim, almoco_inicio, almoco_fim
     FROM horarios_trabalho
     WHERE barbeiro_id = ? AND dia_semana = ?`,
    barbeiroId,
    diaSemana
  );

  if (!expediente) {
    return [];
  }

  const inicioExp = parseTimeToMinutes(expediente.hora_inicio);
  const fimExp = parseTimeToMinutes(expediente.hora_fim);

  const ocupados = [];

  if (expediente.almoco_inicio && expediente.almoco_fim) {
    ocupados.push({
      inicio: parseTimeToMinutes(expediente.almoco_inicio),
      fim: parseTimeToMinutes(expediente.almoco_fim)
    });
  }

  const bloqueios = await db.all(
    `SELECT hora_inicio, hora_fim
     FROM bloqueios
     WHERE barbeiro_id = ? AND data = ?`,
    barbeiroId,
    data
  );

  for (const b of bloqueios) {
    ocupados.push({
      inicio: parseTimeToMinutes(b.hora_inicio),
      fim: parseTimeToMinutes(b.hora_fim)
    });
  }

  const agendamentos = await db.all(
    `SELECT hora_inicio, hora_fim
     FROM agendamentos
     WHERE barbeiro_id = ? AND data = ? AND status != 'cancelado'`,
    barbeiroId,
    data
  );

  for (const ag of agendamentos) {
    ocupados.push({
      inicio: parseTimeToMinutes(ag.hora_inicio),
      fim: parseTimeToMinutes(ag.hora_fim)
    });
  }

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

export async function getAvailableSlots({
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

  const barbeirosAtivos = await db.all('SELECT id FROM barbeiros WHERE ativo = 1 ORDER BY id ASC');
  const mapaSlots = new Map();

  for (const b of barbeirosAtivos) {
    const slots = await getAvailableSlotsForBarber({
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
          barbeirosDisponiveis: [Number(b.id)]
        });
      } else {
        mapaSlots.get(slot.horaInicio).barbeirosDisponiveis.push(Number(b.id));
      }
    }
  }

  return Array.from(mapaSlots.values()).sort((a, b) =>
    a.horaInicio.localeCompare(b.horaInicio)
  );
}

/**
 * Versão otimizada em lote para o calendário (reduz ~84 queries para apenas 4 queries
 * no PostgreSQL/Neon, calculando todos os dias em memória em < 1ms).
 */
export async function getCalendarAvailability({
  db,
  barbeiroId = 'qualquer',
  duracaoMin = 30,
  dias = 14,
  intervaloMin = 30,
  agora = new Date()
}) {
  const totalDias = Math.min(Math.max(Number(dias) || 14, 1), 31);
  const duracao = Number(duracaoMin);
  const hojeStr = formatLocalDate(agora);
  const fimStr = addDaysToDateString(hojeStr, totalDias - 1);

  if (!Number.isFinite(duracao) || duracao <= 0) {
    return [];
  }

  // 1. Barbeiros considerados
  let barbeiroIds;
  if (barbeiroId === 'qualquer') {
    const rows = await db.all('SELECT id FROM barbeiros WHERE ativo = 1 ORDER BY id ASC');
    barbeiroIds = rows.map((r) => Number(r.id));
  } else {
    barbeiroIds = [Number(barbeiroId)];
  }

  if (barbeiroIds.length === 0) {
    return Array.from({ length: totalDias }, (_, i) => {
      const data = addDaysToDateString(hojeStr, i);
      return { data, diaSemana: getDayOfWeek(data), totalHorariosLivres: 0, disponivel: false };
    });
  }

  const placeholders = barbeiroIds.map(() => '?').join(', ');

  // 2, 3 e 4. Busca expedientes, bloqueios e agendamentos de todo o período em 3 queries paralelas
  const [horariosRows, bloqueiosRows, agendamentosRows] = await Promise.all([
    db.all(
      `SELECT barbeiro_id, dia_semana, hora_inicio, hora_fim, almoco_inicio, almoco_fim
       FROM horarios_trabalho
       WHERE barbeiro_id IN (${placeholders})`,
      ...barbeiroIds
    ),
    db.all(
      `SELECT barbeiro_id, data, hora_inicio, hora_fim
       FROM bloqueios
       WHERE barbeiro_id IN (${placeholders}) AND data BETWEEN ? AND ?`,
      ...barbeiroIds,
      hojeStr,
      fimStr
    ),
    db.all(
      `SELECT barbeiro_id, data, hora_inicio, hora_fim
       FROM agendamentos
       WHERE barbeiro_id IN (${placeholders}) AND data BETWEEN ? AND ? AND status != 'cancelado'`,
      ...barbeiroIds,
      hojeStr,
      fimStr
    )
  ]);

  // Indexa em memória para lookup O(1)
  const expMap = new Map();
  for (const h of horariosRows) {
    expMap.set(`${h.barbeiro_id}:${h.dia_semana}`, h);
  }

  const ocupadosMap = new Map();
  const adicionarOcupado = (bId, data, inicioStr, fimStrVal) => {
    const chave = `${bId}:${data}`;
    if (!ocupadosMap.has(chave)) ocupadosMap.set(chave, []);
    ocupadosMap.get(chave).push({
      inicio: parseTimeToMinutes(inicioStr),
      fim: parseTimeToMinutes(fimStrVal)
    });
  };

  for (const b of bloqueiosRows) adicionarOcupado(b.barbeiro_id, b.data, b.hora_inicio, b.hora_fim);
  for (const a of agendamentosRows) adicionarOcupado(a.barbeiro_id, a.data, a.hora_inicio, a.hora_fim);

  const minutoMinimoHoje = agora.getHours() * 60 + agora.getMinutes() + 15;
  const resultado = [];

  for (let i = 0; i < totalDias; i++) {
    const data = addDaysToDateString(hojeStr, i);
    const diaSemana = getDayOfWeek(data);
    const horariosUnicos = new Set();

    for (const bId of barbeiroIds) {
      const exp = expMap.get(`${bId}:${diaSemana}`);
      if (!exp) continue;

      const inicioExp = parseTimeToMinutes(exp.hora_inicio);
      const fimExp = parseTimeToMinutes(exp.hora_fim);
      const ocupados = [...(ocupadosMap.get(`${bId}:${data}`) || [])];

      if (exp.almoco_inicio && exp.almoco_fim) {
        ocupados.push({
          inicio: parseTimeToMinutes(exp.almoco_inicio),
          fim: parseTimeToMinutes(exp.almoco_fim)
        });
      }

      const minimoMin = data === hojeStr ? minutoMinimoHoje : -1;

      for (let slotInicio = inicioExp; slotInicio + duracao <= fimExp; slotInicio += intervaloMin) {
        if (slotInicio < minimoMin) continue;
        const slotFim = slotInicio + duracao;
        const temConflito = ocupados.some((bloco) =>
          intervalsOverlap(slotInicio, slotFim, bloco.inicio, bloco.fim)
        );
        if (!temConflito) {
          horariosUnicos.add(slotInicio);
        }
      }
    }

    resultado.push({
      data,
      diaSemana,
      totalHorariosLivres: horariosUnicos.size,
      disponivel: horariosUnicos.size > 0
    });
  }

  return resultado;
}
