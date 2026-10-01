// ── El tiempo que PROMETE quien va a entregar ────────────────────────────────
//
// Distinto del ETA calculado (`eta_vivo` en las apps, que mide con el GPS):
// esto lo escribe el repartidor con el dedo —«en veinte minutos estoy ahí»—
// porque él es el único que sabe lo que no se puede medir: que el local tiene
// quince personas en fila, que la cocina tarda, que va a pasar por otra cosa.
//
// POR QUÉ HACE FALTA. En una compra a un comercio que todavía no es cliente
// nuestro no hay cocina conectada ni `etaMinutes` declarado por nadie: el
// cliente no tiene NINGUNA forma de saber cuánto falta. Lo único cierto se lo
// puede decir la persona que está en el mostrador.
//
// LAS DOS REGLAS. Es una promesa, así que (1) tiene que ser creíble —un «en 3
// minutos» en una compra que ni ha empezado se lee como que la app inventa— y
// (2) no puede ser un número sin sentido que llegue a la pantalla del cliente.

/** Lo menos que se puede prometer. Por debajo no es una entrega, es un error. */
export const ETA_MINIMO_MIN = 5;

/**
 * Lo más que se puede prometer en un mandado.
 *
 * Tres horas. Más que eso no es «me demoro»: es que la compra no se va a
 * poder hacer, y entonces lo honesto es cancelar y no dejar al cliente
 * esperando toda la tarde con una promesa puesta.
 */
export const ETA_MAXIMO_MIN = 180;

/**
 * Deja el minutaje en algo que se le pueda enseñar al cliente.
 *
 * Devuelve `null` cuando no hay nada que enseñar: un número que no se entiende
 * NO se redondea a algo cercano, porque un ETA inventado es peor que ninguno
 * —el cliente baja a la portería a esperar—.
 */
export function saneaEtaDeclarada(valor: unknown): number | null {
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) return null;
  const entero = Math.round(n);
  if (entero < ETA_MINIMO_MIN || entero > ETA_MAXIMO_MIN) return null;
  return entero;
}

/** Cómo se le dice al cliente, en el push y en la pantalla. */
export function textoEtaDeclarada(minutos: number): string {
  if (minutos < 60) return `en ~${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  // «en ~1 h» y no «en ~60 min»: a partir de una hora la gente cuenta en
  // horas, y 95 minutos se lee peor que «1 h 35».
  return resto === 0 ? `en ~${horas} h` : `en ~${horas} h ${resto} min`;
}
