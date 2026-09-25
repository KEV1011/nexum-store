/**
 * Cómo cobra la empresa el pasaje.
 *
 * Hoy la reserva termina sin decir ni una palabra sobre el dinero: el pasajero
 * confirma su silla y se queda sin saber si paga al subir, si tiene que
 * transferir antes, o si se paga en la taquilla. En la terminal eso lo
 * resuelve preguntar; en una app, lo resuelve no reservar.
 *
 * LA PLATA NO PASA POR ZIPA, Y ESO MANDA SOBRE TODO LO DEMÁS
 * ----------------------------------------------------------
 * `SeatBooking` no tiene ningún campo de importe cobrado a propósito: el
 * pasajero le paga a la EMPRESA. Así que esto no es una pasarela ni un estado
 * de pago — es lo que la empresa DECLARA, publicado tal cual. No se confirma
 * ningún pago, no se retiene nada y no se promete ninguna devolución, porque
 * nada de eso lo puede ejecutar este sistema.
 *
 * SIN DECLARAR NO SE INVENTA NADA
 * -------------------------------
 * «Efectivo al abordar» es lo habitual, y justamente por eso sería fácil
 * ponerlo por defecto. Pero una empresa que cobra por transferencia y a la que
 * le publicamos «paga al abordar» va a recibir gente sin efectivo en la puerta
 * del bus. Sin declarar, esto devuelve `null` y la app dice que el pago se
 * acuerda con la empresa. Es peor dato y es la verdad — la misma regla que las
 * condiciones del tiquete.
 *
 * CATÁLOGO CERRADO, POR LO MISMO QUE LAS COMODIDADES
 * --------------------------------------------------
 * Con texto libre una empresa escribe «Nequi», otra «nequi» y otra
 * «transferencia bancaria», y ya no se puede ni filtrar ni comparar. Lo que sí
 * es texto libre es el DETALLE, porque un número de cuenta no cabe en ningún
 * catálogo.
 */

/** Los medios con los que de verdad se cobra un pasaje intermunicipal. */
export const MEDIOS_COBRO = ['efectivo', 'transferencia', 'datafono', 'taquilla'] as const;
export type MedioCobro = (typeof MEDIOS_COBRO)[number];

const ETIQUETA: Record<MedioCobro, string> = {
  efectivo: 'Efectivo al abordar',
  transferencia: 'Transferencia (Nequi, Daviplata, banco)',
  datafono: 'Tarjeta con datáfono al abordar',
  taquilla: 'En la taquilla de la empresa',
};

/** Cuántos caracteres admite el detalle (el número de cuenta y poco más). */
export const MAX_DETALLE = 140;

export interface CobroPasaje {
  medios: MedioCobro[];
  /** A dónde se transfiere, o cualquier precisión de la empresa. */
  detalle?: string;
}

export class CobroInvalido extends Error {}

function esMedio(v: string): v is MedioCobro {
  return (MEDIOS_COBRO as readonly string[]).includes(v);
}

/**
 * Valida lo que manda el portal.
 *
 * Devuelve `null` cuando no hay nada declarado: es «la empresa no lo ha
 * publicado», no «no cobra».
 *
 * Lanza cuando el dato está mal, y el caso que más importa es
 * **`transferencia` sin detalle**: publicar «paga por transferencia» sin decir
 * a qué cuenta deja al pasajero con una instrucción que no puede cumplir, y lo
 * descubre cuando ya reservó la silla.
 */
export function saneaCobro(v: unknown): CobroPasaje | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object' || Array.isArray(v)) {
    throw new CobroInvalido('Los medios de cobro no tienen el formato esperado.');
  }

  const raw = v as { medios?: unknown; detalle?: unknown };

  const medios: MedioCobro[] = [];
  if (raw.medios !== undefined && raw.medios !== null) {
    if (!Array.isArray(raw.medios)) {
      throw new CobroInvalido('Los medios de cobro deben venir en una lista.');
    }
    for (const m of raw.medios) {
      if (typeof m !== 'string' || !esMedio(m)) {
        // Quien publica es el portal con casillas: una clave que no existe es
        // un error nuestro, no del usuario, y se dice cuál.
        throw new CobroInvalido(`Medio de cobro desconocido: «${String(m)}».`);
      }
      if (!medios.includes(m)) medios.push(m);
    }
  }

  const detalle = typeof raw.detalle === 'string' ? raw.detalle.trim() : '';
  if (detalle.length > MAX_DETALLE) {
    throw new CobroInvalido(`El detalle del pago no puede pasar de ${MAX_DETALLE} caracteres.`);
  }

  if (medios.length === 0) {
    // Un detalle suelto sin ningún medio no dice cómo se paga.
    return null;
  }

  if (medios.includes('transferencia') && detalle.length === 0) {
    throw new CobroInvalido(
      'Si cobras por transferencia, escribe a qué cuenta (por ejemplo «Nequi 300 123 4567»): ' +
        'sin eso el pasajero no puede pagarte.',
    );
  }

  // El orden del catálogo manda, no el del formulario: así dos empresas con
  // los mismos medios se leen igual.
  const ordenados = MEDIOS_COBRO.filter((m) => medios.includes(m));
  return detalle ? { medios: ordenados, detalle } : { medios: ordenados };
}

/** Lo guardado en la base, tolerante: nunca tumba una consulta. */
export function cobroGuardado(v: unknown): CobroPasaje | null {
  try {
    return saneaCobro(v);
  } catch {
    return null;
  }
}

/**
 * El texto que lee el pasajero, redactado EN EL SERVIDOR.
 *
 * Igual que las condiciones del tiquete: si el portal y la app lo redactaran
 * cada uno por su lado, la empresa creería publicar una cosa y en el teléfono
 * saldría otra.
 */
export function lineasDeCobro(c: CobroPasaje | null): string[] {
  if (!c || c.medios.length === 0) {
    return ['La empresa no ha publicado cómo cobra. Acuérdalo con ella antes de viajar.'];
  }
  const lineas = c.medios.map((m) => ETIQUETA[m]);
  if (c.detalle) lineas.push(c.detalle);
  // Se dice siempre, porque es lo que separa esto de una compra en la app.
  lineas.push('El pago se hace directamente a la empresa. ZIPA no cobra el pasaje.');
  return lineas;
}

/** Una línea corta para la tarjeta de la búsqueda. */
export function resumenDeCobro(c: CobroPasaje | null): string | null {
  if (!c || c.medios.length === 0) return null;
  if (c.medios.length === 1) return ETIQUETA[c.medios[0]!];
  return `${c.medios.length} formas de pago`;
}
