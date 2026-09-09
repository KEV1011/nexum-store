/**
 * La calificación de un negocio, calculada a partir de lo que la gente puso.
 *
 * Hasta ahora `Business.rating` era `@default(5.0)` y NADIE lo escribía: cada
 * local de la app enseñaba un 5,0 que nadie le había dado. Eso no es un
 * detalle cosmético — es la cifra con la que el cliente elige dónde pedir, y
 * si todos tienen la misma no ayuda a nadie; peor aún, cuando empiece a ser
 * real, un local nuevo con dos estrellas malas parecerá que «bajó» desde un
 * cinco que nunca tuvo.
 *
 * Dos reglas, las mismas de siempre en este código:
 *
 * 1. **Sin calificaciones no hay número.** `null`, no un 5,0 de regalo ni un
 *    0 que parece pésimo. La app enseña «Nuevo», que es la verdad.
 * 2. **El promedio se RECALCULA de las filas**, nunca se va sumando encima de
 *    lo que hubiera. Un contador que se incrementa acaba desviándose del dato
 *    real (un pedido borrado, una calificación corregida) y entonces nadie
 *    sabe cuál de los dos miente.
 */

export const ESTRELLAS_MIN = 1;
export const ESTRELLAS_MAX = 5;

/** Valida las estrellas que manda la app. Lanza con el motivo. */
export function saneaEstrellas(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error('La calificación debe ser un número entero de estrellas.');
  }
  if (n < ESTRELLAS_MIN || n > ESTRELLAS_MAX) {
    throw new Error(`La calificación va de ${ESTRELLAS_MIN} a ${ESTRELLAS_MAX} estrellas.`);
  }
  return n;
}

/** El comentario, recortado. Vacío = sin comentario, no una cadena vacía. */
export function saneaComentario(v: unknown, max = 300): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

/**
 * El promedio a partir de las calificaciones reales.
 *
 * Devuelve `null` cuando no hay ninguna: es lo que separa «nadie lo ha
 * calificado» de «lo calificaron mal», y un cero los confundiría.
 *
 * Se redondea a un decimal porque es como se enseña («4,8»); guardar más
 * precisión de la que se muestra solo garantiza que el número guardado y el
 * pintado difieran algún día.
 */
export function promedioReputacion(estrellas: number[]): { rating: number | null; ratingCount: number } {
  const validas = estrellas.filter(
    (n) => Number.isFinite(n) && n >= ESTRELLAS_MIN && n <= ESTRELLAS_MAX,
  );
  if (validas.length === 0) return { rating: null, ratingCount: 0 };
  const suma = validas.reduce((a, b) => a + b, 0);
  return {
    rating: Math.round((suma / validas.length) * 10) / 10,
    ratingCount: validas.length,
  };
}
