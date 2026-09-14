// ── Un cupón aplicado a un viaje ─────────────────────────────────────────────
//
// La pregunta que decide todo esto es **quién paga el descuento**, y tiene una
// sola respuesta defendible: lo paga la plataforma. Es nuestro gasto de
// mercadeo. Si el descuento saliera del bolsillo del conductor, estaríamos
// regalando plata ajena para atraer pasajeros nuestros, y encima en silencio:
// él vería una carrera de $15.000 donde su tabla dice $20.000 y no sabría por
// qué.
//
// De ahí las tres reglas, y la segunda es la importante:
//
//  1. El pasajero paga la tarifa MENOS el descuento.
//  2. La liquidación del conductor NO CAMBIA. Ni un peso. Su bruto, su
//     comisión y su neto son exactamente los de un viaje sin cupón.
//  3. Lo absorbe nuestra comisión, y puede quedar en NEGATIVO: eso no es un
//     error de cálculo, es lo que significa una promoción. Un descuento de
//     $5.000 sobre una comisión de $3.000 nos cuesta $2.000 reales.
//
// El resto es aritmética con dos cuidados: el descuento nunca puede superar la
// tarifa (el pasajero no puede acabar cobrando) y todo va en pesos enteros,
// porque el efectivo no tiene monedas de a peso partido.
//
// AVISO QUE NO SE PUEDE TAPAR: en un viaje en EFECTIVO el conductor recibe en
// la mano lo que paga el pasajero, o sea menos de lo que dice su liquidación.
// La diferencia se la debemos, y solo se salda cuando corran los pagos. Por eso
// el conductor ve el descuento en la oferta —antes de aceptar— en vez de
// enterarse al final del día cuadrando su caja.

export interface DesgloseConCupon {
  /** La tarifa del servicio, sin tocar. Es de lo que cobra el conductor. */
  tarifa: number;
  /** Lo que se le descuenta al pasajero. Nunca mayor que la tarifa. */
  descuento: number;
  /** Lo que el pasajero paga de verdad. */
  pagaPasajero: number;
  /** Lo que se lleva el conductor. Idéntico con cupón y sin él. */
  netoConductor: number;
  /** Lo que nos queda a nosotros. Negativo = la promoción nos cuesta. */
  margenPlataforma: number;
}

/**
 * Reparte un viaje con cupón entre pasajero, conductor y plataforma.
 *
 * [comision] y [netoConductor] son los que ya calculó la liquidación normal:
 * este cálculo NO los recalcula, solo dice quién pone el descuento.
 */
export function aplicarCupon(
  tarifa: number,
  comision: number,
  netoConductor: number,
  descuentoPedido: number,
): DesgloseConCupon {
  const base = Math.max(0, Math.round(tarifa));
  // Un descuento mayor que la carrera dejaría al pasajero cobrando por viajar.
  const descuento = Math.min(Math.max(0, Math.round(descuentoPedido)), base);

  return {
    tarifa: base,
    descuento,
    pagaPasajero: base - descuento,
    // Intocable. Esta línea es la razón de ser del archivo.
    netoConductor: Math.round(netoConductor),
    margenPlataforma: Math.round(comision) - descuento,
  };
}

/**
 * El descuento que queda sellado en el viaje, o `null` si no hubo cupón.
 *
 * Se guarda el MONTO, no el porcentaje ni el código a secas: cambiar mañana la
 * promoción no puede reescribir lo que se cobró hoy. Es la misma regla que ya
 * siguen la promoción de la tienda y la comisión de la flota.
 */
export function descuentoSellable(descuento: number | null | undefined): number | null {
  if (descuento == null) return null;
  const n = Math.round(descuento);
  return n > 0 ? n : null;
}

/** Lo que el pasajero debe pagar por un viaje ya liquidado. */
export function totalPasajero(
  finalFare: number | null | undefined,
  promoDiscount: number | null | undefined,
): number | null {
  if (finalFare == null) return null;
  const bruto = Math.max(0, Math.round(finalFare));
  const desc = Math.min(Math.max(0, Math.round(promoDiscount ?? 0)), bruto);
  return bruto - desc;
}
