/**
 * Las cuatro reglas del tablero de la torre de control.
 *
 * Viven aquí, sueltas y sin base de datos, porque son justo donde un tablero
 * miente sin que se note: comparando períodos de distinta longitud, inventando
 * un «+100 %» donde antes no había nada, o promediando un cero como si fuera
 * un dato. Separadas del servicio se pueden probar una a una.
 */

/**
 * Variación porcentual con un decimal, o `null` si no hay base.
 *
 * De cero a algo NO es «+100 %»: es un estreno. Devolver un número ahí es la
 * forma más fácil de que el tablero parezca preciso mientras miente.
 */
export function variacionPct(ahora: number, antes: number): number | null {
  if (!(antes > 0)) return null;
  return Math.round(((ahora - antes) / antes) * 1000) / 10;
}

/**
 * El mismo rango corrido hacia atrás, pegado por detrás.
 *
 * Tiene que tener EXACTAMENTE los mismos días: comparar una semana contra un
 * mes daría una caída del 70 % que no ocurrió.
 */
export function rangoAnterior(
  desdeISO: string,
  hastaISO: string,
): { desde: string; hasta: string; dias: number } {
  const dia = 86_400_000;
  // Se recorta a la parte de fecha ANTES de pegar la hora.
  //
  // Aquí se pegaba `T00:00:00.000Z` a lo que llegara, dando por supuesto que
  // era 'AAAA-MM-DD'. Pero quien llama —`getFleetAnalytics`, con lo que
  // devuelve `getFleetFinance`— manda el ISO completo, así que salía
  // '2026-09-01T00:00:00.000ZT00:00:00.000Z': fecha inválida, NaN, y
  // `toISOString()` lanzando `RangeError`. Resultado: la pestaña Rendimiento
  // del portal devolvía 500 SIEMPRE, para cualquier flota, con datos o sin
  // ellos. Las pruebas no lo vieron porque le pasaban el formato que el autor
  // tenía en la cabeza, no el que manda el llamador.
  const desde = new Date(`${desdeISO.slice(0, 10)}T00:00:00.000Z`);
  const hasta = new Date(`${hastaISO.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    // Falla con un motivo legible en vez de un `RangeError` desde las
    // entrañas de `toISOString`.
    throw new Error(`Rango de fechas inválido: "${desdeISO}" a "${hastaISO}"`);
  }
  const dias = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / dia) + 1);
  const antesHasta = new Date(desde.getTime() - dia);
  const antesDesde = new Date(antesHasta.getTime() - (dias - 1) * dia);
  return {
    desde: antesDesde.toISOString().slice(0, 10),
    hasta: antesHasta.toISOString().slice(0, 10),
    dias,
  };
}

/**
 * Media redondeada, o `null` sin muestras.
 *
 * Un 0 se leería como «se acepta al instante», que es lo contrario de «no
 * tenemos ni un dato».
 */
export function mediaMinutos(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

/** Máximo plausible de un servicio urbano, en minutos. */
const TOPE_URBANO_MIN = 1440;

/**
 * Minutos entre dos sellos, o `null` si no se pueden creer.
 *
 * Un negativo es un reloj mal puesto o un dato corrupto, no un servicio
 * instantáneo; por encima de un día no es un viaje urbano. En los dos casos
 * vale más perder la muestra que ensuciar la media con ella.
 */
export function duracionMin(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  const m = (b.getTime() - a.getTime()) / 60_000;
  return m >= 0 && m <= TOPE_URBANO_MIN ? m : null;
}
