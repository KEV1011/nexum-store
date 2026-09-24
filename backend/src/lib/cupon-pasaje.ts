/**
 * Un cupón en un pasaje de bus, y la pregunta que lo decide: **quién lo paga**.
 *
 * EN UN VIAJE URBANO YA ESTÁ RESUELTO: lo paga la plataforma, sale de nuestra
 * comisión y puede dejarla en negativo (ver `lib/descuento-viaje.ts`). Eso
 * funciona porque en un viaje urbano NOSOTROS estamos en medio del dinero:
 * liquidamos la carrera, cobramos comisión y por ahí se absorbe el descuento.
 *
 * EN UNA SALIDA DE BUS NO ESTAMOS EN MEDIO. El pasajero le paga al conductor o
 * en la taquilla; `SeatBooking` ni siquiera tenía un campo de importe. Si aquí
 * se aplicara un cupón «de la plataforma», el que cobraría menos sería la
 * empresa —sin haberlo decidido y sin que nadie le reponga la diferencia—, que
 * es exactamente lo que el cupón urbano existe para NO hacer. Por eso ese caso
 * se rechaza, y se rechaza diciendo por qué.
 *
 * LO QUE SÍ SE PUEDE HOY: que la promoción sea de la EMPRESA. Ella emite el
 * código, ella decide cobrar menos para llenar sus salidas flojas, y el
 * descuento sale de su propio precio. Es el mismo modelo que ya usan los
 * negocios con `promoMinAmount`/`promoDiscount`, y no necesita que el dinero
 * pase por la plataforma.
 *
 * El día que haya pago en línea, el cupón de plataforma se abre quitando una
 * condición de aquí y nada más.
 */

export interface CuponDeSalida {
  code: string;
  /** Empresa que lo emitió. `null` = cupón de la plataforma. */
  operatorId: string | null;
  /** Si el código está declarado para pasajes de bus. */
  aplicaAPasajes: boolean;
}

export interface SalidaParaCupon {
  /** Empresa de la salida. `null` = conductor particular. */
  operatorId: string | null;
}

/**
 * El motivo por el que el cupón no se puede aplicar, o `null` si sí.
 *
 * Motivo y no booleano: quien acaba de escribir un código quiere saber si se
 * equivocó de código, de viaje o de empresa, y las tres se arreglan distinto.
 */
export function motivoParaNoAplicarCupon(
  cupon: CuponDeSalida,
  salida: SalidaParaCupon,
): string | null {
  if (!cupon.aplicaAPasajes) {
    return 'Este código no aplica para pasajes intermunicipales.';
  }

  // El caso del dinero. No es una limitación técnica que se pueda saltar con
  // una bandera: es que no hay de dónde sacar el descuento.
  if (cupon.operatorId == null) {
    return 'Por ahora los códigos de ZIPA no aplican en pasajes de bus: el ' +
      'pasaje se le paga directamente a la empresa. Usa un código de la ' +
      'propia empresa si lo tiene.';
  }

  if (salida.operatorId == null) {
    return 'Este código es de una empresa y esta salida es de un conductor particular.';
  }

  if (cupon.operatorId !== salida.operatorId) {
    return 'Este código es de otra empresa de transporte.';
  }

  return null;
}

/**
 * Lo que de verdad paga el pasajero por su(s) puesto(s).
 *
 * Todo en pesos enteros y el descuento nunca pasa del total: un cupón mayor
 * que el pasaje dejaría al pasajero cobrando por viajar, y el conductor
 * discutiéndolo en la puerta del bus.
 */
export function totalDelPasaje(
  tarifaPorPuesto: number,
  puestos: number,
  descuento = 0,
): { total: number; descuento: number; paga: number } {
  const total = Math.max(0, Math.round(tarifaPorPuesto * Math.max(1, Math.round(puestos))));
  const d = Math.min(Math.max(0, Math.round(descuento)), total);
  return { total, descuento: d, paga: total - d };
}
