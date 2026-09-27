// ── El viaje por puestos que publica el PASAJERO ─────────────────────────────
//
// El puesto de taxi urbano nació al derecho: el taxista dice «salgo de la
// Terminal a la Universidad a las 6, cuatro puestos» y los pasajeros se le
// suman. Pero en Pamplona pasa igual de seguido al revés — alguien tiene que
// ir a Cúcuta, o al hospital, y busca con quién compartir el carro. Ahí el
// que arma el viaje es un pasajero, y el taxista aparece después.
//
// El modelo es el MISMO (`PooledTrip` con `kind: URBANO`): lo único distinto
// es que nace sin conductor y alguien lo toma del tablero. Construir un
// segundo modelo al lado ya fragmentó la trazabilidad de la carga una vez y
// está escrito en CLAUDE.md; no se repite.
//
// Las reglas de precio, ciudad y número de puestos NO se duplican aquí: son
// las de `puesto-urbano.ts` y valen igual venga de quien venga, porque
// protegen al pasajero que se sube, no a quien publica. Aquí viven solo las
// que nacen de que el autor sea un pasajero.

/** Cuántos días adelante se puede publicar. Más allá es ruido en el tablero. */
export const DIAS_MAX_ADELANTE = 7;

/**
 * Cuántas salidas abiertas puede tener un mismo pasajero a la vez.
 *
 * Publicar es comprometerse a ir: quien tiene cinco abiertas prometió estar en
 * cinco taxis distintos, y los cuatro que se queden colgados no tienen forma
 * de saberlo hasta que el carro no aparece.
 */
export const ABIERTAS_MAX_POR_PASAJERO = 2;

export interface PublicacionDePasajero {
  /** Puestos que se publican en total (incluye los del que publica). */
  puestos: number;
  /** Cuántos de esos ocupa quien publica. */
  puestosDelCreador: number;
  /** Cuándo sale. */
  salida: Date;
  /** Cuántas salidas abiertas tiene ya ese pasajero. */
  abiertas: number;
  /** Para poder probar el reloj sin esperar. */
  ahora?: Date;
}

/**
 * Por qué NO puede publicarla, o `null` si sí.
 *
 * Devuelve el motivo y no un booleano por lo de siempre: «no se pudo publicar»
 * no le dice a nadie qué corregir.
 */
export function motivoParaNoPublicarComoPasajero(
  p: PublicacionDePasajero,
): string | null {
  const ahora = p.ahora ?? new Date();

  if (!Number.isInteger(p.puestosDelCreador) || p.puestosDelCreador < 1) {
    return 'Di cuántos puestos ocupas tú: quien publica el viaje va en él.';
  }
  // El que publica NO puede quedarse con todos los puestos. Si pudiera, esto
  // dejaría de ser compartir y sería una carrera entera al precio de un
  // puesto — o sea, la forma de esquivar la tarifa del decreto sin que nadie
  // se suba nunca.
  if (p.puestosDelCreador >= p.puestos) {
    return 'Deja al menos un puesto libre para alguien más. Si vas a ir solo, pide una carrera normal.';
  }

  if (Number.isNaN(p.salida.getTime()) || p.salida.getTime() <= ahora.getTime()) {
    return 'La hora de salida tiene que ser en el futuro.';
  }
  const limite = ahora.getTime() + DIAS_MAX_ADELANTE * 24 * 60 * 60 * 1000;
  if (p.salida.getTime() > limite) {
    return `Solo se puede publicar con hasta ${DIAS_MAX_ADELANTE} días de anticipación.`;
  }

  if (p.abiertas >= ABIERTAS_MAX_POR_PASAJERO) {
    return `Ya tienes ${p.abiertas} viaje(s) publicado(s) sin terminar. Cancela uno antes de publicar otro.`;
  }

  return null;
}

export interface TomaDeSalida {
  /** Quién la tiene hoy. `null` = libre. */
  driverIdActual: string | null;
  /** Estado de la salida, tal como lo guarda Prisma. */
  estado: string;
  salida: Date;
  /** Tipo del vehículo activo del conductor, tal como lo guarda Prisma. */
  tipoVehiculo: string | null;
  ahora?: Date;
}

/**
 * Los tipos de vehículo que pueden llevar un viaje por puestos.
 *
 * Una moto no: la salida se publica con entre dos y cuatro puestos, y el que
 * la tome tiene que poder llevarlos. Los de carga tampoco, por razones que no
 * hace falta explicar.
 */
export const TIPOS_QUE_PUEDEN_TOMAR = ['TAXI', 'PARTICULAR'] as const;

/** Por qué ese conductor NO puede tomar esa salida, o `null` si puede. */
export function motivoParaNoTomar(t: TomaDeSalida): string | null {
  const ahora = t.ahora ?? new Date();

  if (t.driverIdActual) return 'Otro conductor ya tomó este viaje.';
  if (t.estado !== 'OPEN') return 'Este viaje ya no está disponible.';
  if (t.salida.getTime() <= ahora.getTime()) {
    return 'La hora de salida de este viaje ya pasó.';
  }
  if (!t.tipoVehiculo) {
    return 'Registra tu vehículo antes de tomar viajes por puestos.';
  }
  if (!(TIPOS_QUE_PUEDEN_TOMAR as readonly string[]).includes(t.tipoVehiculo)) {
    return 'Un viaje por puestos lleva entre dos y cuatro pasajeros: hace falta un carro.';
  }
  return null;
}

/**
 * Cómo se describe la salida cuando todavía no tiene conductor.
 *
 * Existe para que NADIE la escriba dos veces: la app del pasajero, la del
 * conductor y el panel dirían tres cosas distintas del mismo estado, y una de
 * ellas acabaría siendo «Conductor» a secas — que es exactamente lo que hacía
 * el parser viejo con un nombre ausente, y se lee como si ya hubiera uno.
 */
export const SIN_CONDUCTOR_TODAVIA = 'Sin conductor todavía';
