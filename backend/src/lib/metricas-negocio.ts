/**
 * Las tres cifras con las que se juzga un piloto.
 *
 * El panel ya enseña operación —cuántos viajes hoy, cuánto dinero, cuántos
 * conductores— y eso sirve para vigilar el día. Pero no responde a las tres
 * preguntas de las que depende que el negocio exista:
 *
 *   1. ¿Está creciendo?            → viajes por día
 *   2. ¿Hay conductores suficientes? → tasa de emparejamiento
 *   3. ¿La gente vuelve?            → retención semanal
 *
 * Viven aquí, sueltas y sin base de datos, porque son justo donde una métrica
 * miente sin que se note: un porcentaje sobre tres personas, un cero que
 * parece un dato, un día sin viajes que desaparece del gráfico en vez de
 * dibujarse en el suelo.
 */

/**
 * Porcentaje con un decimal, o `null` si no hay sobre qué calcularlo.
 *
 * Sin denominador NO hay porcentaje. Devolver 0 diría «ningún viaje encontró
 * conductor», que es una acusación grave, cuando lo cierto es que no hubo
 * viajes que emparejar.
 */
export function porcentaje(parte: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.round((parte / total) * 1000) / 10;
}

/** Un día del gráfico. */
export interface DiaSerie {
  /** `YYYY-MM-DD`. */
  dia: string;
  valor: number;
}

/**
 * Serie diaria continua entre dos fechas, con los días vacíos EN CERO.
 *
 * Agrupar por día en SQL solo devuelve los días que tuvieron algo. Pintar eso
 * tal cual encoge el eje y hace que una semana con dos días muertos parezca
 * una semana entera de actividad: el gráfico sube cuando la realidad se paró.
 *
 * [conteos] es lo que devuelve la base: día → cuántos.
 */
export function serieDeDias(
  desdeISO: string,
  hastaISO: string,
  conteos: Map<string, number>,
): DiaSerie[] {
  const dia = 86_400_000;
  const desde = Date.parse(`${desdeISO}T00:00:00.000Z`);
  const hasta = Date.parse(`${hastaISO}T00:00:00.000Z`);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta < desde) return [];

  const out: DiaSerie[] = [];
  // Tope de cordura: un rango absurdo no debe generar cien mil puntos.
  const maxDias = 400;
  for (let t = desde, n = 0; t <= hasta && n < maxDias; t += dia, n++) {
    const clave = new Date(t).toISOString().slice(0, 10);
    out.push({ dia: clave, valor: conteos.get(clave) ?? 0 });
  }
  return out;
}

/**
 * Salud del despacho: de todo lo que se pidió, cuánto encontró conductor.
 *
 * Es la cifra que dice si hace falta reclutar. Va acompañada de sus dos
 * componentes en crudo a propósito: un 80 % sobre 5 viajes y un 80 % sobre 500
 * son cosas distintas, y quien lo lee tiene derecho a distinguirlas.
 *
 * [sinConductor] son los que el propio sistema cerró admitiendo que no había
 * nadie. Se cuenta aparte de los que simplemente no encontraron conductor
 * porque el pasajero se cansó y canceló: eso también es un fallo, pero uno del
 * que no se puede culpar sin más a la falta de oferta.
 */
export interface Emparejamiento {
  solicitados: number;
  conConductor: number;
  /** Cerrados por el sistema con NO_DRIVERS_AVAILABLE. */
  sinConductor: number;
  /** % de solicitudes que consiguieron conductor, o null si no hubo ninguna. */
  tasa: number | null;
}

export function emparejamiento(
  solicitados: number,
  conConductor: number,
  sinConductor: number,
): Emparejamiento {
  return {
    solicitados,
    conConductor,
    sinConductor,
    tasa: porcentaje(conConductor, solicitados),
  };
}

/**
 * ¿Vuelve la gente?
 *
 * De los pasajeros que pidieron algo la semana pasada, cuántos volvieron a
 * pedir esta. Es la única de las tres que dice si hay negocio: los viajes por
 * día se pueden comprar con promociones y el emparejamiento se arregla
 * reclutando, pero que alguien vuelva sin que le regalen nada no se finge.
 *
 * `base` va SIEMPRE junto al porcentaje porque en un piloto es diminuta, y un
 * «50 % de retención» sobre dos personas no es una métrica, es una anécdota.
 */
export interface Retencion {
  /** Pasajeros que pidieron en el período anterior. */
  base: number;
  /** Cuántos de ésos volvieron a pedir en el período actual. */
  volvieron: number;
  pct: number | null;
  /**
   * ¿Hay suficientes para que el número signifique algo? Por debajo de este
   * umbral el panel enseña la fracción en crudo y se calla el porcentaje.
   */
  fiable: boolean;
}

/** Por debajo de esto, un porcentaje de retención engaña más de lo que informa. */
export const MINIMO_PARA_FIARSE = 10;

export function retencion(base: number, volvieron: number): Retencion {
  return {
    base,
    volvieron,
    pct: porcentaje(volvieron, base),
    fiable: base >= MINIMO_PARA_FIARSE,
  };
}
