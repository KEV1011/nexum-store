/**
 * Hora de corte de bodega: hasta cuándo se pide para que salga HOY.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * Hasta ahora, un envío a otra ciudad prometía `etaHours` a secas. Eso está
 * bien a las nueve de la mañana y es mentira a las cinco de la tarde: el bus de
 * las cuatro ya se fue, la caja sale mañana, y el cliente que leyó «llega en
 * 12 horas» la espera esta noche.
 *
 * Con la hora de corte la promesa se convierte en un INSTANTE concreto —
 * «mañana a las 8 de la mañana»— que es lo que de verdad quiere saber quien
 * compra. Y el comercio puede decir «pide antes de las 4 p. m.», que es como lo
 * dice en el mostrador.
 *
 * DÓNDE VIVE EL DATO
 * ------------------
 * En cada destino de `Business.shipsTo`, no en el comercio: el bus a Bogotá no
 * sale a la misma hora que el de Bucaramanga. Es opcional — sin corte el
 * comportamiento es el de antes, que es lo que tienen todos los comercios ya
 * registrados.
 *
 * LA HORA ES LA DE COLOMBIA, no la del servidor. A las 02:00 UTC del martes
 * aquí son las 21:00 del lunes, y con la hora del servidor el corte de las
 * 16:00 se aplicaría con cinco horas de desfase todos los días.
 */

import { HORAS_UTC_COLOMBIA, type Franja } from './horario-tienda';

const MIN_DIA = 24 * 60;
const MS_DIA = MIN_DIA * 60_000;

/**
 * Cuántos días se mira hacia delante buscando uno en que el comercio opere.
 *
 * Es un tope de seguridad, no una regla de negocio: si un horario mal guardado
 * no tuviera ningún día abierto, sin esto el bucle no terminaría nunca.
 */
const MAX_DIAS_ADELANTE = 14;

/** «HH:MM» válida, o null. Acepta «9:00» y lo deja en «09:00». */
export function saneaCorte(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}

/** El mismo instante visto en hora de Colombia. */
function enColombia(d: Date): Date {
  return new Date(d.getTime() + HORAS_UTC_COLOMBIA * 3_600_000);
}

/** Vuelve de hora de Colombia a UTC. */
function aUtc(d: Date): Date {
  return new Date(d.getTime() - HORAS_UTC_COLOMBIA * 3_600_000);
}

/**
 * Si el comercio opera ese día de la semana.
 *
 * Sin horario declarado opera todos los días: es la misma regla que ya usa
 * `tiendaRecibiendo` — cerrar de golpe a todos los comercios registrados sería
 * un apagón, no una mejora.
 */
function operaEl(dia: number, franjas: Franja[]): boolean {
  if (franjas.length === 0) return true;
  return franjas.some((f) => f.dia === dia);
}

/**
 * El instante en que sale el próximo despacho.
 *
 * Sin hora de corte, sale ya: es el comportamiento de siempre.
 *
 * Con corte: si todavía no ha pasado y el comercio opera hoy, sale hoy a esa
 * hora. Si ya pasó —o hoy no opera— se busca el siguiente día de operación.
 *
 * «Antes de las 4 p. m.» significa ANTES: un pedido hecho exactamente a las
 * 16:00 no alcanza el bus de las 16:00. Es la lectura literal de lo que el
 * comercio le promete al cliente, y equivocarse por el otro lado deja una caja
 * en la bodega con una promesa de hoy.
 */
export function proximoDespacho(
  ahora: Date,
  corte: string | null,
  franjas: Franja[] = [],
): Date {
  if (!corte) return new Date(ahora.getTime());

  const corteMin = minutosDe(corte);
  const local = enColombia(ahora);
  const minutosHoy = local.getUTCHours() * 60 + local.getUTCMinutes();

  // Medianoche del día local, para poder sumar días sin pelear con husos.
  const medianoche = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );

  for (let d = 0; d <= MAX_DIAS_ADELANTE; d++) {
    const dia = new Date(medianoche + d * MS_DIA);
    if (!operaEl(dia.getUTCDay(), franjas)) continue;
    // Hoy solo cuenta si el corte aún no ha pasado.
    if (d === 0 && minutosHoy >= corteMin) continue;
    return aUtc(new Date(dia.getTime() + corteMin * 60_000));
  }

  // Ningún día de operación en dos semanas: el horario está mal guardado. Se
  // devuelve el corte de mañana en vez de lanzar — una promesa aproximada es
  // mejor que un checkout que revienta.
  return aUtc(new Date(medianoche + MS_DIA + corteMin * 60_000));
}

/**
 * Cuándo se promete la entrega.
 *
 * Es el próximo despacho más las horas que el comercio declaró para ese
 * destino. No se le suma nada por nuestra cuenta: el que sabe cuánto tarda el
 * bus es quien lo usa todas las semanas.
 */
export function estimaLlegada(
  ahora: Date,
  corte: string | null,
  etaHours: number,
  franjas: Franja[] = [],
): Date {
  const salida = proximoDespacho(ahora, corte, franjas);
  return new Date(salida.getTime() + Math.max(0, etaHours) * 3_600_000);
}

/** «4:00 p. m.» a partir de «16:00», para decírselo a una persona. */
export function corteEnTexto(corte: string): string {
  const total = minutosDe(corte);
  const h24 = Math.floor(total / 60);
  const min = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const sufijo = h24 < 12 ? 'a. m.' : 'p. m.';
  return `${h12}:${String(min).padStart(2, '0')} ${sufijo}`;
}

/**
 * El aviso que ve el cliente antes de comprar.
 *
 * Devuelve null si no hay corte declarado: es preferible no decir nada a
 * inventarse un plazo.
 */
export function avisoDeCorte(
  ahora: Date,
  corte: string | null,
  franjas: Franja[] = [],
): string | null {
  if (!corte) return null;

  const local = enColombia(ahora);
  const minutosHoy = local.getUTCHours() * 60 + local.getUTCMinutes();
  const alcanzaHoy =
    minutosHoy < minutosDe(corte) && operaEl(local.getUTCDay(), franjas);

  return alcanzaHoy
    ? `Pide antes de las ${corteEnTexto(corte)} y sale hoy mismo.`
    : `El despacho de hoy ya salió. Tu pedido sale en el próximo, a las ${corteEnTexto(corte)}.`;
}
