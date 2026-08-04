// ── Tiempos del flete ─────────────────────────────────────────────────────────
//
// El flete ya guardaba `createdAt`, `acceptedAt` y `completedAt`, pero nadie
// calculaba nada con ellos: no había duración en ninguna pantalla. Y faltaban
// las dos piezas que hacen medible la operación:
//
//  - `startedAt` (salida real). Sin él, la espera en bodega queda escondida
//    dentro del "tiempo de viaje" y el transportador siempre puede decir que
//    el trayecto se demoró. Separarlos convierte una discusión en un dato.
//  - `promisedAt` (fecha comprometida). "Llegó tarde" es una opinión hasta que
//    hay una hora contra la cual medir.
//
// Todo se deriva; no se guarda ningún cálculo. Así un flete viejo sin
// `startedAt` devuelve null en vez de un número inventado.

export interface FreightTimeline {
  createdAt: Date;
  acceptedAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  promisedAt?: Date | null;
}

export interface FreightTimes {
  /** Minutos entre publicar el flete y que una flota lo tome. */
  toAcceptMin: number | null;
  /** Minutos entre aceptar y salir de verdad: la espera en bodega. */
  waitMin: number | null;
  /** Minutos en ruta (salida → entrega). */
  transitMin: number | null;
  /** Minutos puerta a puerta (publicación → entrega). */
  totalMin: number | null;
  /** true/false solo si hay fecha comprometida Y el flete se entregó. */
  onTime: boolean | null;
  /** Minutos de retraso sobre lo comprometido; 0 si llegó a tiempo. */
  lateMin: number | null;
}

export const EMPTY_TIMES: FreightTimes = {
  toAcceptMin: null, waitMin: null, transitMin: null,
  totalMin: null, onTime: null, lateMin: null,
};

/**
 * Diferencia en minutos, o null si falta alguna punta. Devuelve null también
 * cuando el resultado sería negativo: un reloj torcido o un dato migrado a mano
 * no debe producir "‑15 min en ruta", que nadie sabría interpretar.
 */
function diffMin(desde?: Date | null, hasta?: Date | null): number | null {
  if (!desde || !hasta) return null;
  const min = Math.round((hasta.getTime() - desde.getTime()) / 60000);
  return min < 0 ? null : min;
}

export function freightTimes(f: FreightTimeline): FreightTimes {
  const onTime =
    f.promisedAt && f.completedAt ? f.completedAt.getTime() <= f.promisedAt.getTime() : null;

  const lateMin =
    f.promisedAt && f.completedAt
      ? Math.max(0, Math.round((f.completedAt.getTime() - f.promisedAt.getTime()) / 60000))
      : null;

  return {
    toAcceptMin: diffMin(f.createdAt, f.acceptedAt),
    waitMin: diffMin(f.acceptedAt, f.startedAt),
    transitMin: diffMin(f.startedAt, f.completedAt),
    totalMin: diffMin(f.createdAt, f.completedAt),
    onTime,
    lateMin,
  };
}

export interface OnTimeStats {
  /** Fletes entregados que tenían fecha comprometida. */
  measured: number;
  onTime: number;
  late: number;
  /** Porcentaje 0–100; 0 si no hay nada medible (no se inventa un 100 %). */
  pct: number;
  /** Promedio de retraso sobre los que llegaron tarde. */
  avgLateMin: number;
}

/**
 * Cumplimiento del período. Solo cuenta los fletes que TENÍAN promesa: incluir
 * los que nunca la tuvieron inflaría el indicador con entregas que nadie se
 * comprometió a cumplir.
 */
export function onTimeStats(fletes: FreightTimeline[]): OnTimeStats {
  let measured = 0;
  let onTime = 0;
  let lateTotal = 0;
  let late = 0;

  for (const f of fletes) {
    const t = freightTimes(f);
    if (t.onTime === null) continue;
    measured++;
    if (t.onTime) onTime++;
    else {
      late++;
      lateTotal += t.lateMin ?? 0;
    }
  }

  return {
    measured,
    onTime,
    late,
    pct: measured > 0 ? Math.round((onTime / measured) * 100) : 0,
    avgLateMin: late > 0 ? Math.round(lateTotal / late) : 0,
  };
}
