/**
 * Las reglas de la parte del tablero que mira la OPERACIÓN, no la caja.
 *
 * El panel de rendimiento que ya existe cuenta solo lo que salió bien: suma
 * servicios completados y los reparte por conductor, vehículo y día. Una flota
 * cuyos viajes se caen a la mitad ve un tablero impecable, porque un viaje
 * cancelado no aparece en ninguna suma.
 *
 * Aquí viven las dos cosas que sí lo delatan —cuánto se cae y a qué hora se
 * trabaja de verdad— separadas del servicio porque son justo donde un tablero
 * miente sin que se note: un porcentaje sin denominador, un «pico» deducido de
 * tres servicios, o una hora en UTC que corre el turno cinco horas.
 */

import { HORAS_UTC_COLOMBIA } from './horario-tienda';

/**
 * Bajo esta cantidad de servicios no se señala hora pico.
 *
 * Con cinco servicios repartidos en veinticuatro horas, la hora «más alta» la
 * decide el azar. Poner ahí una flecha que diga «tu pico es a las 3 p. m.»
 * llevaría a un dueño a mover el turno de su gente por ruido.
 */
export const MUESTRA_MINIMA_PICO = 20;

/** La hora del día (0–23) en que ocurrió ese instante, en Colombia. */
export function horaColombiaDe(d: Date): number {
  return new Date(d.getTime() + HORAS_UTC_COLOMBIA * 3_600_000).getUTCHours();
}

/** El día 'AAAA-MM-DD' al que pertenece ese instante, en Colombia. */
export function diaColombiaDe(d: Date): string {
  return new Date(d.getTime() + HORAS_UTC_COLOMBIA * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Qué porcentaje de los servicios terminados se cayó, con un decimal.
 *
 * `null` sin denominador: una flota que no cerró ni un servicio no tiene un
 * «0 % de cancelación», no tiene dato. Escribir el cero ahí felicitaría a
 * quien no trabajó.
 */
export function tasaCancelacion(completados: number, cancelados: number): number | null {
  const total = completados + cancelados;
  if (total <= 0) return null;
  return Math.round((cancelados / total) * 1000) / 10;
}

export interface BucketHora {
  hora: number;
  servicios: number;
}

/**
 * Las veinticuatro horas del día, incluidas las vacías.
 *
 * Los ceros van explícitos por lo mismo que los días vacíos de la serie: una
 * gráfica que se salta las horas muertas comprime el reloj y hace parecer
 * continuo lo que fue a tirones. Y la madrugada en blanco ES la información
 * cuando alguien se pregunta si vale la pena un turno de noche.
 */
export function bucketsPorHora(horas: number[]): BucketHora[] {
  const cuenta = new Array<number>(24).fill(0);
  for (const h of horas) {
    if (Number.isInteger(h) && h >= 0 && h <= 23) cuenta[h]! += 1;
  }
  return cuenta.map((servicios, hora) => ({ hora, servicios }));
}

/**
 * La hora con más servicios, o `null` si no se puede afirmar.
 *
 * Dos motivos para callar, y los dos importan:
 *
 * - **Muestra corta**: ver `MUESTRA_MINIMA_PICO`.
 * - **Empate**: si dos horas van igualadas no hay «una» hora pico; elegir la
 *   primera sería inventar un ganador por el orden del reloj. Es la misma
 *   regla con la que el selector de categorías no marca «la más barata»
 *   cuando dos cuestan lo mismo.
 */
export function horaPico(buckets: BucketHora[]): number | null {
  const muestra = buckets.reduce((s, b) => s + b.servicios, 0);
  if (muestra < MUESTRA_MINIMA_PICO) return null;
  const max = Math.max(...buckets.map((b) => b.servicios));
  if (max <= 0) return null;
  const empatadas = buckets.filter((b) => b.servicios === max);
  return empatadas.length === 1 ? empatadas[0]!.hora : null;
}

/**
 * Servicios por día trabajado, con un decimal.
 *
 * Es lo que distingue al conductor que hizo cuarenta servicios en dos días del
 * que los hizo en veinte. El ranking por facturación los pone uno al lado del
 * otro como si rindieran igual.
 */
export function serviciosPorDiaActivo(servicios: number, diasActivos: number): number | null {
  if (diasActivos <= 0) return null;
  return Math.round((servicios / diasActivos) * 10) / 10;
}

/** «06:00». */
export function etiquetaHora(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

/** Los motivos de cancelación que escribe el propio sistema. */
const MOTIVOS: Record<string, string> = {
  CANCELLED_BY_PASSENGER: 'El pasajero canceló',
  NO_DRIVERS_AVAILABLE: 'Nadie tomó el viaje',
};

/**
 * El motivo en cristiano, o el código tal cual si no lo conocemos.
 *
 * El admin puede cancelar con un texto libre, así que esto no puede ser un
 * mapa cerrado: lo desconocido se muestra como vino en vez de convertirse en
 * «Otro», que escondería justo el caso que alguien querría leer.
 */
export function motivoLegible(codigo: string | null): string {
  if (!codigo) return 'Sin motivo registrado';
  return MOTIVOS[codigo] ?? codigo;
}
