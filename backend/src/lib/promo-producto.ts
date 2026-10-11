/**
 * La promoción de UN producto, con fecha de fin.
 *
 * QUÉ FALTABA. `compareAtPrice` ya existía: el dueño baja `price` y escribe el
 * precio anterior, y la vitrina pinta el tachado y el «−30 %». Pero en el
 * portal ese campo se llama «Antes», que no le dice a nadie que eso es una
 * promoción —de ahí el reporte de que «no da la opción de decir que este
 * producto está en promoción»—, y sobre todo **no tiene fecha de fin**: la
 * vigencia (`promoFrom`/`promoUntil`) es de la TIENDA entera.
 *
 * Así que hoy «esta hamburguesa en promoción hasta el viernes» se resuelve
 * bajando el precio a mano y acordándose de subirlo. Nadie se acuerda, y la
 * promoción del fin de semana sigue puesta en marzo. Ya pasó con la de la
 * tienda y por eso aquélla tiene vigencia.
 *
 * SE DERIVA, NO SE GUARDA. El precio vigente se calcula cada vez a partir de
 * lo que hay en la fila; no se escribe un «precio actual» en la base ni se
 * corre un barrido que reescriba precios al vencer. Un precio guardado y unas
 * fechas guardadas acaban discrepando y nadie sabe cuál miente — es la misma
 * razón por la que el saldo de una cuenta de cobro tampoco se guarda.
 *
 * Y LA REGLA QUE DE VERDAD IMPORTA: la MISMA función decide el precio en la
 * vitrina y en la CAJA. Una pantalla que promete lo que el cobro no aplica es
 * la peor queja posible, y es la lección ya pagada con `promoDeTienda`.
 */

export interface PrecioVigente {
  /** Lo que se cobra ahora mismo. */
  precio: number;
  /** El precio tachado, o `null` si no hay promoción viva. */
  antes: number | null;
  /** `true` solo si hay una promoción corriendo en este instante. */
  enPromo: boolean;
}

/**
 * El precio que rige ahora para un producto.
 *
 * `price` es siempre lo que el dueño quiere cobrar HOY y `compareAtPrice` el
 * precio normal tachado — así ha funcionado desde que existe la vitrina y no
 * se cambia, porque invertirlo obligaría a reescribir las filas de todos los
 * catálogos ya cargados.
 *
 * Lo nuevo es `promoUntil`: **vencida, el producto vuelve solo a su precio
 * normal**, que es el tachado. Si no hay precio tachado no hay a dónde volver
 * y se respeta el precio puesto: una fecha suelta no puede dejar un producto
 * sin precio.
 */
export function precioVigente(
  p: { price: number; compareAtPrice?: number | null; promoUntil?: Date | string | null },
  ahora: Date = new Date(),
): PrecioVigente {
  const antes = typeof p.compareAtPrice === 'number' && p.compareAtPrice > p.price
    ? p.compareAtPrice
    : null;

  if (antes === null) return { precio: p.price, antes: null, enPromo: false };

  const hasta = p.promoUntil ? new Date(p.promoUntil) : null;
  // Una fecha ilegible se trata como «sin fecha»: la promoción sigue viva.
  // Al revés —darla por vencida— subiría el precio de golpe por un dato roto,
  // y el cliente que vio el descuento pagaría más en la caja.
  const vencida = hasta !== null && !Number.isNaN(hasta.getTime()) && hasta.getTime() <= ahora.getTime();

  if (vencida) return { precio: antes, antes: null, enPromo: false };
  return { precio: p.price, antes, enPromo: true };
}

/** Cuánto falta, en texto corto, para que se acabe («hoy», «2 días»). */
export function faltaPara(hasta: Date | string | null | undefined, ahora: Date = new Date()): string | null {
  if (!hasta) return null;
  const f = new Date(hasta);
  if (Number.isNaN(f.getTime())) return null;
  const ms = f.getTime() - ahora.getTime();
  if (ms <= 0) return null;
  const dias = Math.floor(ms / 86_400_000);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  return `${dias} días`;
}

/**
 * La fecha de fin que escribe el dueño, saneada.
 *
 * Se RECHAZA una fecha ya pasada: guardarla dejaría una promoción que nace
 * muerta, el dueño vería su producto sin descuento y creería que el portal no
 * guardó. Y se rechaza más de un año, que siempre es un año mal escrito.
 */
export const MAX_DIAS_PROMO = 365;

export function saneaFinDePromo(valor: unknown, ahora: Date = new Date()): Date | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const f = new Date(String(valor));
  if (Number.isNaN(f.getTime())) {
    throw new Error('La fecha de fin de la promoción no se entiende.');
  }
  if (f.getTime() <= ahora.getTime()) {
    throw new Error('La promoción terminaría antes de empezar: elige una fecha futura.');
  }
  const dias = (f.getTime() - ahora.getTime()) / 86_400_000;
  if (dias > MAX_DIAS_PROMO) {
    throw new Error('La promoción no puede durar más de un año.');
  }
  return f;
}
