/**
 * El puesto de taxi urbano: una carrera de ciudad que se vende por sillas.
 *
 * QUÉ ES
 * ------
 * Los taxis de Pamplona ya lo hacen: en vez de quedarse quietos en el paradero
 * salen recogiendo persona por persona sobre un trayecto conocido —terminal,
 * universidad, el barrio de arriba— y cada uno paga un puesto. Al pasajero le
 * sale a $2.000 lo que en buseta cuesta $2.200, y al conductor le rinde más
 * que una carrera sola. Esto no inventa esa práctica: le pone una publicación,
 * una reserva y un precio que no se discute a bordo.
 *
 * POR QUÉ ES UNA SALIDA (`PooledTrip`) Y NO UN MODELO NUEVO
 * --------------------------------------------------------
 * Ya existe el motor de salidas con puestos: publicar, vender, contar lo que
 * queda, arrancar y cerrar. Construir un segundo modelo al lado fragmentó
 * antes la trazabilidad de la carga (`CargoTrip` junto a `FreightRequest`) y
 * eso está escrito en la bitácora. Aquí solo se distingue con `kind` y se le
 * cambia lo que de verdad es distinto: los extremos de un trayecto urbano son
 * dos PUNTOS de la misma ciudad, no dos municipios.
 *
 * LAS TRES REGLAS
 * ---------------
 * 1. **La misma ciudad.** Es la guarda que sostiene todo lo demás: el camino
 *    urbano se salta la ruta intermunicipal, el tope de gasto compartido y la
 *    exigencia de empresa habilitada del modelo dual. Sin esta comprobación,
 *    publicar «urbano» de Pamplona a Cúcuta sería la puerta de atrás para
 *    operar una troncal sin habilitación.
 *
 * 2. **Dos puestos como mínimo.** Un «puesto compartido» de una sola silla no
 *    es compartir: es una carrera entera a un precio que pone el conductor,
 *    esquivando la tarifa del decreto. Y máximo cuatro, que son las sillas de
 *    pasajero de un taxi; de ahí para arriba es transporte colectivo, que
 *    tiene su propio permiso y en el motor ya exige empresa habilitada.
 *
 * 3. **El puesto tiene tope, y el tope sale de la carrera sola.** Se comparte
 *    para pagar menos. Si el conductor pudiera cobrar cualquier cosa por silla,
 *    llenar el carro valdría cuatro veces el taxímetro y «compartir» sería un
 *    recargo con otro nombre. El tope deja que el viaje le rinda —hasta una vez
 *    y media la carrera— y garantiza de paso que un puesto SIEMPRE cueste menos
 *    que el carro entero (con dos sillas el tope ya es tres cuartos de la
 *    carrera).
 */

/** Sillas de pasajero de un taxi. Menos de dos no es compartir. */
export const PUESTOS_MIN = 2;
export const PUESTOS_MAX = 4;

/**
 * Cuánto puede rendir el viaje lleno frente a la carrera sola.
 *
 * 1,5 no es un número redondo por casualidad: es lo que hace que valga la pena
 * ir recogiendo (con cuatro puestos el conductor gana un 50 % más que llevando
 * a uno solo) sin que el pasajero pague por su silla más de lo que le costaría
 * compartir el carro a partes iguales más un poco.
 */
export const FACTOR_TOPE = 1.5;

/** Lo que se le propone al conductor en el formulario. Puede bajarlo. */
export const FACTOR_SUGERIDO = 1.25;

/** El efectivo no tiene monedas de $7. */
function aMultiploDe50Abajo(v: number): number {
  return Math.floor(v / 50) * 50;
}

function esPositivo(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Lo máximo que puede costar un puesto, dada la carrera sola y cuántas sillas
 * se venden. Cero si no hay con qué calcularlo — el que llama lo rechaza en vez
 * de dejar pasar una tarifa sin techo.
 */
export function topePorPuesto(tarifaSolo: number, puestos: number): number {
  if (!esPositivo(tarifaSolo) || !Number.isInteger(puestos) || puestos < 1) return 0;
  return Math.max(0, aMultiploDe50Abajo((tarifaSolo * FACTOR_TOPE) / puestos));
}

/** Lo que el formulario propone. Nunca por encima del tope. */
export function sugeridoPorPuesto(tarifaSolo: number, puestos: number): number {
  if (!esPositivo(tarifaSolo) || !Number.isInteger(puestos) || puestos < 1) return 0;
  const sugerido = aMultiploDe50Abajo((tarifaSolo * FACTOR_SUGERIDO) / puestos);
  return Math.min(sugerido, topePorPuesto(tarifaSolo, puestos));
}

export interface PublicacionDePuesto {
  /** Slug del municipio de donde sale. */
  ciudadOrigen: string;
  /** Slug del municipio a donde llega. Tiene que ser el mismo. */
  ciudadDestino: string;
  /** Cómo se llama el punto de salida («Terminal de transportes»). */
  origenTexto: string;
  destinoTexto: string;
  puestos: number;
  tarifaPorPuesto: number;
  /**
   * La carrera sola del mismo trayecto: medida si se pudo, y si no el piso
   * conocido (la carrera mínima del decreto). Nunca un invento.
   */
  tarifaSolo: number;
}

/**
 * Por qué NO se puede publicar esta salida por puestos, o `null` si sí.
 *
 * Devuelve el motivo y no un booleano: el conductor está con el carro
 * encendido y «no se pudo publicar» no le dice qué corregir.
 */
export function motivoParaNoPublicarPuesto(p: PublicacionDePuesto): string | null {
  const origen = (p.ciudadOrigen ?? '').trim().toLowerCase();
  const destino = (p.ciudadDestino ?? '').trim().toLowerCase();

  if (!origen || !destino) return 'Falta la ciudad de la ruta';
  if (origen !== destino) {
    return 'Un viaje por puestos urbano es dentro de la misma ciudad. Para viajar a otro municipio, publica una salida intermunicipal.';
  }

  if (!p.origenTexto?.trim()) return 'Escribe de dónde sale';
  if (!p.destinoTexto?.trim()) return 'Escribe a dónde llega';
  if (p.origenTexto.trim().toLowerCase() === p.destinoTexto.trim().toLowerCase()) {
    return 'El punto de salida y el de llegada no pueden ser el mismo';
  }

  if (!Number.isInteger(p.puestos) || p.puestos < PUESTOS_MIN) {
    return `Un viaje por puestos se comparte: publica al menos ${PUESTOS_MIN} puestos. Para llevar a una sola persona, toma una carrera normal.`;
  }
  if (p.puestos > PUESTOS_MAX) {
    return `Un taxi lleva máximo ${PUESTOS_MAX} pasajeros. Para más puestos hace falta una empresa de transporte habilitada.`;
  }

  if (!esPositivo(p.tarifaPorPuesto)) return 'Pon cuánto cuesta el puesto';

  const tope = topePorPuesto(p.tarifaSolo, p.puestos);
  if (tope <= 0) return 'No pudimos calcular el precio de la carrera para esta ruta';
  if (Math.round(p.tarifaPorPuesto) > tope) {
    return `El puesto no puede pasar de $${tope.toLocaleString('es-CO')} en esta ruta con ${p.puestos} puestos. Una carrera sola cuesta $${Math.round(p.tarifaSolo).toLocaleString('es-CO')}.`;
  }

  return null;
}

/**
 * Cuánto se ahorra el pasajero frente a tomar el taxi solo. Cero si no hay
 * ahorro: no se enseña un ahorro negativo como si fuera un descuento.
 */
export function ahorroDelPasajero(tarifaSolo: number, tarifaPorPuesto: number): number {
  if (!esPositivo(tarifaSolo) || !esPositivo(tarifaPorPuesto)) return 0;
  return Math.max(0, Math.round(tarifaSolo - tarifaPorPuesto));
}
