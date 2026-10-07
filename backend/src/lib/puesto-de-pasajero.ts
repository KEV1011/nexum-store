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

/**
 * Cuánto pasado se acepta como «ahora mismo» al publicar.
 *
 * No es laxitud: el reloj del teléfono es el que manda la hora y suele ir unos
 * minutos desfasado. Cinco minutos cubren eso sin permitir publicar un viaje
 * para una hora que de verdad ya pasó.
 */
export const TOLERANCIA_AHORA_MIN = 5;

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

  if (Number.isNaN(p.salida.getTime())) {
    return 'No entendimos la hora de salida.';
  }
  // «Ahora mismo» tiene que poder publicarse, y para eso hay que aceptar un
  // pasado corto: la app manda `DateTime.now()` y entre el teléfono y el
  // servidor pasan décimas —más si el reloj del teléfono va unos minutos
  // atrasado, que es lo normal—. Sin esta tolerancia, pedir un taxi para YA se
  // rechazaba con «la hora tiene que ser en el futuro», que es incomprensible
  // cuando acabas de tocar «lo antes posible».
  if (p.salida.getTime() < ahora.getTime() - TOLERANCIA_AHORA_MIN * 60_000) {
    return 'Esa hora ya pasó. Elige «lo antes posible» o una hora más adelante.';
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

/**
 * Cuántos minutos después de la hora de salida se puede seguir tomando.
 *
 * POR QUÉ HACE FALTA. Sin esta gracia, un viaje «para ahora» era IMPOSIBLE de
 * usar: el pasajero ponía la hora más cercana que le dejaba el reloj, y al
 * minuto siguiente el viaje desaparecía del tablero y dejaba de poderse tomar.
 * Eso es justo lo que se reportó como «se solicita un servicio y no le sale a
 * ningún conductor».
 *
 * Y es lo correcto aunque la hora sea futura: un taxi que ve el aviso a las
 * 6:00 y lo toma a las 6:04 todavía hace el viaje. La hora de salida es cuándo
 * quiere salir el pasajero, no el instante en que el trabajo deja de existir.
 *
 * Pasados los quince minutos sí se retira: el pasajero ya se fue en otra cosa,
 * y un taxista que acepte entonces llega a una esquina vacía.
 */
export const GRACIA_TOMA_MIN = 15;

/** Por qué ese conductor NO puede tomar esa salida, o `null` si puede. */
export function motivoParaNoTomar(t: TomaDeSalida): string | null {
  const ahora = t.ahora ?? new Date();

  if (t.driverIdActual) return 'Otro conductor ya tomó este viaje.';
  if (t.estado !== 'OPEN') return 'Este viaje ya no está disponible.';
  if (t.salida.getTime() + GRACIA_TOMA_MIN * 60_000 <= ahora.getTime()) {
    return `La hora de salida de este viaje pasó hace más de ${GRACIA_TOMA_MIN} minutos.`;
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
