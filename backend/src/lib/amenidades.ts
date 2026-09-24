/**
 * Qué trae el bus: aire, wifi, enchufe, baño.
 *
 * POR QUÉ ES UN CATÁLOGO CERRADO Y NO TEXTO LIBRE
 * -----------------------------------------------
 * Con texto libre, una empresa escribe «Aire acondicionado», otra «A/C» y una
 * tercera «climatizado», y entonces no se puede filtrar, no se puede comparar
 * y cada tarjeta se ve distinta. Con claves cerradas la app pinta el mismo
 * chip para todas y el pasajero compara dos salidas de un vistazo, que es
 * justo para lo que sirve esto.
 *
 * VAN EN LA SALIDA, NO EN LA EMPRESA
 * ----------------------------------
 * Dentro de la misma empresa un bus tiene aire y la buseta vieja no. Colgarlas
 * de la empresa prometería aire en el vehículo que no lo tiene, y el reclamo
 * sería a bordo, a mitad de carretera.
 *
 * EL BAÑO NO SE DECLARA: SE DERIVA DEL PLANO
 * ------------------------------------------
 * El mapa de sillas ya sabe si el vehículo lleva baño (`seatConfig.bano`), y
 * es el dato que el pasajero ve dibujado. Si además se pudiera marcar a mano,
 * las dos fuentes se contradirían: un chip prometiendo baño sobre un plano que
 * no lo tiene. En un Pamplona–Bogotá de nueve horas eso no es un detalle.
 * `amenidadesDeSalida` lo resuelve en un solo sitio.
 */

/** Las claves que existen. Añadir una es tocar esta tabla y nada más. */
export const AMENIDADES = {
  aire: 'Aire acondicionado',
  wifi: 'Wi-Fi a bordo',
  usb: 'Cargador USB',
  reclinable: 'Silla reclinable',
  tv: 'Pantallas',
  bano: 'Baño a bordo',
  bodega: 'Bodega para equipaje',
  mantas: 'Mantas y almohadas',
} as const;

export type Amenidad = keyof typeof AMENIDADES;

/**
 * El orden en que se pintan, y es deliberado: primero lo que decide una
 * compra en carretera (aire, baño, silla) y después lo que está bien tener.
 * Fijarlo aquí hace que todas las tarjetas se lean igual; ordenarlas como
 * vengan del formulario haría que la misma empresa se viera distinta en dos
 * salidas.
 */
export const ORDEN_AMENIDADES: Amenidad[] = [
  'aire',
  'bano',
  'reclinable',
  'usb',
  'wifi',
  'tv',
  'bodega',
  'mantas',
];

/** La que se deriva del plano y por tanto NO se acepta desde el formulario. */
export const AMENIDAD_DEL_PLANO: Amenidad = 'bano';

export function esAmenidad(v: unknown): v is Amenidad {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(AMENIDADES, v);
}

export function etiquetaAmenidad(a: Amenidad): string {
  return AMENIDADES[a];
}

/**
 * Limpia lo que llega del formulario.
 *
 * Una clave desconocida se RECHAZA nombrándola en vez de descartarse en
 * silencio: quien publica es el portal con casillas, así que una clave que no
 * existe es un error nuestro, y tragárselo lo escondería hasta que una empresa
 * preguntara por qué su wifi no aparece.
 *
 * El baño se ignora aquí aunque venga marcado — lo pone `amenidadesDeSalida`
 * desde el plano.
 */
export function saneaAmenidades(v: unknown): Amenidad[] {
  if (v == null) return [];
  if (!Array.isArray(v)) {
    throw new Error('Las comodidades deben venir como lista.');
  }
  const vistas = new Set<Amenidad>();
  for (const bruto of v) {
    if (!esAmenidad(bruto)) {
      throw new Error(`No conozco la comodidad «${String(bruto)}».`);
    }
    if (bruto === AMENIDAD_DEL_PLANO) continue;
    vistas.add(bruto);
  }
  return ORDEN_AMENIDADES.filter((a) => vistas.has(a));
}

/** Lo guardado en la BD, que pudo escribirlo una versión anterior. */
export function amenidadesGuardadas(v: unknown): Amenidad[] {
  if (!Array.isArray(v)) return [];
  const vistas = new Set<Amenidad>();
  for (const bruto of v) if (esAmenidad(bruto)) vistas.add(bruto);
  return ORDEN_AMENIDADES.filter((a) => vistas.has(a));
}

/**
 * Lo que de verdad trae la salida: lo declarado, más el baño si el plano lo
 * dibuja y menos el baño si no lo dibuja.
 *
 * Las dos direcciones importan. Sin la primera, una empresa que configuró el
 * baño en el plano no lo vería anunciado y creería que hay que marcarlo dos
 * veces. Sin la segunda, se anunciaría un baño que no existe, que es la
 * promesa más cara de incumplir en una ruta larga.
 *
 * Una salida sin plano (la del conductor particular, que se vende por cupos)
 * no tiene de dónde derivarlo: ahí manda lo declarado, y hoy no declara nada.
 */
export function amenidadesDeSalida(
  declaradas: unknown,
  planoConBano: boolean | null,
): Amenidad[] {
  const base = new Set(amenidadesGuardadas(declaradas));
  if (planoConBano === true) base.add(AMENIDAD_DEL_PLANO);
  if (planoConBano === false) base.delete(AMENIDAD_DEL_PLANO);
  return ORDEN_AMENIDADES.filter((a) => base.has(a));
}
