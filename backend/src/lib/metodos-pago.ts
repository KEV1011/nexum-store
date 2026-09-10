// ── Con qué puede pagar el pasajero ──────────────────────────────────────────
//
// El catálogo vive aquí, en un solo sitio, porque el mismo dato lo usan tres
// superficies que no se hablan entre sí: la app del pasajero para ofrecer las
// opciones, el backend para validar lo que llega y sellarlo en el viaje, y la
// app del conductor para decirle cómo va a cobrar. Si cada una tuviera su
// lista, bastaría con añadir un método en una para que el conductor viera un
// hueco en blanco en la oferta.
//
// La distinción que sostiene todo esto es **quién recibe el dinero**:
//
// - `conductor`: la plataforma no toca la plata. El pasajero le paga a él, en
//   efectivo o desde su billetera. Nosotros solo transmitimos por cuál, que no
//   es un detalle: el conductor abre esa app antes de llegar, y puede rechazar
//   la carrera si no tiene esa billetera.
// - `plataforma`: lo cobra la pasarela y el conductor recibe su liquidación.
//
// Confundir las dos cuesta dinero real: decirle al conductor "ya está pagado"
// cuando en realidad le van a transferir es dejar que el pasajero se baje sin
// pagar. Por eso hay una prueba que vigila exactamente eso.

export type QuienCobra = 'conductor' | 'plataforma';

export interface MetodoDePago {
  /** Lo que viaja por la API y se guarda en `Trip.paymentMethod`. */
  valor: string;
  /** Nombre corto para la lista. */
  etiqueta: string;
  /** Una línea para el pasajero, explicando cómo funciona. */
  detalle: string;
  quienCobra: QuienCobra;
  /**
   * Lo que se le dice al conductor en la oferta, o `null` si no hay nada que
   * aclarar (el efectivo es lo que cualquiera da por supuesto).
   */
  avisoAlConductor: string | null;
  /** Si necesita la pasarela configurada para poder ofrecerse. */
  exigePasarela: boolean;
}

const _TRANSFERENCIA = 'Le transfieres al conductor; acuerdan el número por el chat';

export const METODOS_DE_PAGO: readonly MetodoDePago[] = [
  {
    valor: 'efectivo',
    etiqueta: 'Efectivo',
    detalle: 'Le pagas al conductor al llegar',
    quienCobra: 'conductor',
    avisoAlConductor: null,
    exigePasarela: false,
  },
  {
    valor: 'nequi',
    etiqueta: 'Nequi',
    detalle: _TRANSFERENCIA,
    quienCobra: 'conductor',
    avisoAlConductor: 'Te paga por Nequi',
    exigePasarela: false,
  },
  {
    valor: 'daviplata',
    etiqueta: 'Daviplata',
    detalle: _TRANSFERENCIA,
    quienCobra: 'conductor',
    avisoAlConductor: 'Te paga por Daviplata',
    exigePasarela: false,
  },
  {
    valor: 'bancolombia',
    etiqueta: 'Bancolombia',
    detalle: 'Transferencia o QR; acuerdan la cuenta por el chat',
    quienCobra: 'conductor',
    avisoAlConductor: 'Te paga por Bancolombia',
    exigePasarela: false,
  },
  {
    // El valor genérico de siempre. Se conserva porque es lo que mandan las
    // apps ya instaladas y lo que quedó sellado en los viajes anteriores:
    // quitarlo dejaría esos viajes sin método y a esas apps sin poder elegir.
    valor: 'transferencia',
    etiqueta: 'Otra transferencia',
    detalle: _TRANSFERENCIA,
    quienCobra: 'conductor',
    avisoAlConductor: 'Te paga por transferencia',
    exigePasarela: false,
  },
  {
    valor: 'en_linea',
    etiqueta: 'Pago en línea',
    detalle: 'Tarjeta, PSE o Nequi, cobrado por la app',
    quienCobra: 'plataforma',
    avisoAlConductor: 'Ya pagado en la app',
    exigePasarela: true,
  },
];

/**
 * El método admitido, o `null` si no lo reconocemos.
 *
 * Nunca se guarda lo que mande el teléfono tal cual: este campo decide después
 * qué se le enseña al conductor, y un valor inventado ahí le diría cualquier
 * cosa sobre cómo va a cobrar.
 */
export function saneaMetodoPago(v: string | undefined | null): string | null {
  const m = (v ?? '').trim().toLowerCase();
  return METODOS_DE_PAGO.some((x) => x.valor === m) ? m : null;
}

export function metodoPorValor(v: string | undefined | null): MetodoDePago | null {
  const m = saneaMetodoPago(v);
  return m === null ? null : METODOS_DE_PAGO.find((x) => x.valor === m)!;
}

/**
 * Los métodos que se le pueden ofrecer al pasajero ahora mismo.
 *
 * Sin llaves de la pasarela, el pago en línea no cobra nada: ofrecerlo sería
 * un botón que promete cobrar y no cobra, y el conductor acabaría entregando
 * el viaje sin recibir la plata.
 */
export function metodosDisponibles(pasarelaActiva: boolean): MetodoDePago[] {
  return METODOS_DE_PAGO.filter((m) => !m.exigePasarela || pasarelaActiva);
}
