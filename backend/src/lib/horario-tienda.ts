/**
 * El horario de un negocio, y si está abierto AHORA.
 *
 * Hasta ahora `openingHours` era un texto libre («Lun-Sáb 8am-9pm») que no
 * cerraba nada: la tienda solo se cerraba con un interruptor manual. Eso
 * significa que si el dueño se va a dormir sin apagarlo, a las 3 de la mañana
 * entra un pedido, el cliente paga y espera una comida que nadie va a hacer.
 * El daño no lo paga el dueño: lo paga la plataforma, que es quien parece
 * responsable.
 *
 * Colombia es UTC-5 sin horario de verano, así que el «ahora» del negocio se
 * calcula desplazando la hora del servidor. Mismo criterio que el resto del
 * sistema (`_startOfToday`, las métricas): si aquí se usara otro, la tienda
 * cerraría a una hora y el informe la contaría en otro día.
 */

export const HORAS_UTC_COLOMBIA = -5;

/** Una franja de atención: «los martes de 08:00 a 14:00». */
export interface Franja {
  /** 0 = domingo … 6 = sábado, como `Date.getUTCDay()`. */
  dia: number;
  /** «HH:MM» en 24 h. */
  abre: string;
  /**
   * «HH:MM». Puede ser MENOR que `abre`: un bar que abre a las 18:00 y cierra
   * a las 02:00 cruza la medianoche, y tratarlo como error dejaría fuera a
   * media hostelería.
   */
  cierra: string;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function _minutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function _hhmm(minutos: number): string {
  const h = Math.floor(minutos / 60) % 24;
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Normaliza lo que llega del portal. Devuelve [] si no hay horario declarado.
 *
 * Lanza con el motivo en vez de guardar una franja rota: un horario que no se
 * entiende acabaría cerrando la tienda para siempre sin que el dueño sepa por
 * qué.
 */
export function saneaHorario(v: unknown): Franja[] {
  if (v === null || v === undefined || v === '') return [];
  if (!Array.isArray(v)) throw new Error('El horario debe ser una lista de franjas.');
  if (v.length > 21) throw new Error('Demasiadas franjas (máximo 3 por día).');

  const out: Franja[] = [];
  for (const f of v) {
    if (typeof f !== 'object' || f === null) continue;
    const raw = f as Record<string, unknown>;
    const dia = Number(raw['dia']);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
      throw new Error('Día inválido en el horario.');
    }
    const abre = _minutos(String(raw['abre'] ?? ''));
    const cierra = _minutos(String(raw['cierra'] ?? ''));
    if (abre === null || cierra === null) {
      throw new Error(`Hora inválida el ${DIAS[dia]}: usa el formato HH:MM (por ejemplo 08:00).`);
    }
    if (abre === cierra) {
      // Sin esta guarda, «08:00 a 08:00» sería un intervalo vacío y la tienda
      // aparecería cerrada todo el día con un horario que se ve bien escrito.
      throw new Error(`El ${DIAS[dia]} abre y cierra a la misma hora. Para 24 horas usa 00:00 a 23:59.`);
    }
    out.push({ dia, abre: _hhmm(abre), cierra: _hhmm(cierra) });
  }
  return out.sort((a, b) => a.dia - b.dia || a.abre.localeCompare(b.abre));
}

/** El instante actual, en minutos desde la medianoche colombiana, y su día. */
function _ahoraLocal(ahora: Date): { dia: number; minutos: number } {
  const local = new Date(ahora.getTime() + HORAS_UTC_COLOMBIA * 3_600_000);
  return {
    dia: local.getUTCDay(),
    minutos: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/**
 * ¿La tienda está dentro de alguna de sus franjas ahora mismo?
 *
 * **Sin horario declarado devuelve `true`**, no `false`: los negocios que ya
 * están registrados no tienen ninguno, y cerrarlos a todos de golpe al
 * desplegar sería un apagón. El horario es una mejora que cada dueño activa,
 * no un requisito nuevo que le cae encima.
 */
export function estaDentroDelHorario(franjas: Franja[], ahora = new Date()): boolean {
  if (franjas.length === 0) return true;
  const { dia, minutos } = _ahoraLocal(ahora);
  const ayer = (dia + 6) % 7;

  for (const f of franjas) {
    const abre = _minutos(f.abre);
    const cierra = _minutos(f.cierra);
    if (abre === null || cierra === null) continue;

    if (cierra > abre) {
      // Franja normal, dentro del mismo día.
      if (f.dia === dia && minutos >= abre && minutos < cierra) return true;
    } else {
      // Cruza la medianoche: cuenta el tramo de hoy y la cola de la de AYER.
      if (f.dia === dia && minutos >= abre) return true;
      if (f.dia === ayer && minutos < cierra) return true;
    }
  }
  return false;
}

/**
 * Cuándo vuelve a abrir, en palabras. Null si no se puede saber.
 *
 * Sirve para que el cliente lea «Abre mañana a las 8:00» en vez de un
 * «Cerrado» a secas que no le dice si volver en una hora o en tres días.
 */
export function proximaApertura(franjas: Franja[], ahora = new Date()): string | null {
  if (franjas.length === 0) return null;
  const { dia, minutos } = _ahoraLocal(ahora);

  for (let salto = 0; salto < 7; salto++) {
    const d = (dia + salto) % 7;
    const delDia = franjas
      .filter((f) => f.dia === d)
      .map((f) => ({ f, abre: _minutos(f.abre) ?? 0 }))
      .sort((a, b) => a.abre - b.abre);
    for (const { f, abre } of delDia) {
      if (salto === 0 && abre <= minutos) continue;
      if (salto === 0) return `Abre hoy a las ${f.abre}`;
      if (salto === 1) return `Abre mañana a las ${f.abre}`;
      return `Abre el ${DIAS[d]} a las ${f.abre}`;
    }
  }
  return null;
}

/** El horario en una línea, para enseñarlo. Vacío si no hay ninguno. */
export function horarioEnTexto(franjas: Franja[]): string {
  if (franjas.length === 0) return '';
  const porDia = new Map<number, string[]>();
  for (const f of franjas) {
    const lista = porDia.get(f.dia) ?? [];
    lista.push(`${f.abre}-${f.cierra}`);
    porDia.set(f.dia, lista);
  }
  return [...porDia.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, hs]) => `${DIAS[d]!.slice(0, 3)} ${hs.join(', ')}`)
    .join(' · ');
}

// ─── Pausa temporal ──────────────────────────────────────────────────────────

/** Cuánto puede durar una pausa. Más que esto es «cerrado», no «un momento». */
export const PAUSA_MAXIMA_MIN = 24 * 60;

/**
 * Hasta cuándo se pausa la tienda, a partir de los minutos que pida el dueño.
 *
 * Es distinto de apagar el interruptor: la pausa **se levanta sola**. Un
 * restaurante con la cocina copada quiere parar treinta minutos, y si eso
 * exige acordarse de volver a encenderlo, la mitad de las veces se queda
 * cerrado el resto del día.
 */
export function saneaPausa(minutos: unknown, ahora = new Date()): Date | null {
  if (minutos === null || minutos === undefined || minutos === '' || minutos === 0) return null;
  const n = typeof minutos === 'string' ? Number(minutos.replace(/[^\d]/g, '')) : minutos;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    throw new Error('Los minutos de pausa deben ser un número positivo.');
  }
  if (n > PAUSA_MAXIMA_MIN) {
    throw new Error(
      'Una pausa dura como mucho 24 horas. Para más tiempo, deja de recibir pedidos.',
    );
  }
  return new Date(ahora.getTime() + Math.round(n) * 60_000);
}

/** ¿Sigue en pausa? Una pausa vencida no cierra nada. */
export function enPausa(pausadaHasta: Date | null | undefined, ahora = new Date()): boolean {
  return pausadaHasta instanceof Date && pausadaHasta.getTime() > ahora.getTime();
}

// ─── Vigencia de la promoción ────────────────────────────────────────────────

/**
 * ¿La promoción está vigente ahora?
 *
 * Sin fechas, vigente siempre (es como funcionaba). Con fechas, la promoción
 * se apaga sola — que es justo lo que pide un «solo este fin de semana»: si
 * hubiera que acordarse de quitarla el lunes, seguiría puesta en marzo.
 */
export function promoVigente(
  desde: Date | null | undefined,
  hasta: Date | null | undefined,
  ahora = new Date(),
): boolean {
  if (desde instanceof Date && ahora.getTime() < desde.getTime()) return false;
  if (hasta instanceof Date && ahora.getTime() > hasta.getTime()) return false;
  return true;
}

/** Valida el rango que escribe el dueño. Lanza con el motivo. */
export function saneaVigencia(
  desde: unknown,
  hasta: unknown,
): { desde: Date | null; hasta: Date | null } {
  const parse = (v: unknown): Date | null => {
    if (v === null || v === undefined || v === '') return null;
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) throw new Error('Fecha de la promoción inválida.');
    return d;
  };
  const d = parse(desde);
  const h = parse(hasta);
  if (d && h && h.getTime() <= d.getTime()) {
    throw new Error('La promoción no puede terminar antes de empezar.');
  }
  return { desde: d, hasta: h };
}
