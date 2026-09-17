/**
 * Última milla: quién lleva la caja de la taquilla a la puerta, y quién paga.
 *
 * EL DEFECTO QUE ESTO CORRIGE
 * ---------------------------
 * Al abrir el envío entre ciudades se le empezó a cobrar al cliente el
 * `deliveryFee` del comercio ADEMÁS del flete intermunicipal. Pero en un envío
 * a otra ciudad nadie hace un domicilio urbano: el comercio lleva la caja a la
 * terminal y el cliente la recoge en la taquilla de destino. O sea que se
 * estaba cobrando un servicio que nadie prestaba.
 *
 * Con la última milla eso se vuelve coherente: el `deliveryFee` se cobra
 * SOLO si el cliente pidió que se la lleven hasta la puerta, y entonces paga al
 * repartidor de DESTINO, que es quien de verdad la lleva.
 *
 * Por qué las reglas viven sueltas: son las que deciden cuánto se le cobra a
 * alguien. Un error aquí no se ve en pantalla, se ve en el recibo.
 */

/** Lo mínimo que hay que saber de un pedido para cobrarlo. */
export interface CobroEnvio {
  /** Domicilio urbano que declara el comercio. */
  deliveryFee: number;
  /** Flete a otra ciudad, si lo hay. */
  intercityFee: number | null;
  /** Si cruza de ciudad. */
  intercity: boolean;
  /** Si el cliente pidió entrega a domicilio en la ciudad de destino. */
  lastMile: boolean;
}

/** Lo que se cobra por mover la caja, desglosado. */
export interface DesgloseEnvio {
  /** Lo que se cobra por el domicilio (0 si nadie lo hace). */
  domicilio: number;
  /** Lo que se cobra por el tramo entre ciudades. */
  flete: number;
  /** La suma, que es lo que se le suma al pedido. */
  total: number;
}

/**
 * Cuánto se cobra por mover la caja.
 *
 * - Pedido local: el domicilio de siempre.
 * - A otra ciudad, recoge en taquilla: **solo el flete**. Cobrar además el
 *   domicilio sería cobrar por un servicio que no existe.
 * - A otra ciudad con entrega a domicilio: flete + domicilio, y ese domicilio
 *   es el pago del repartidor de destino.
 */
export function desgloseEnvio(c: CobroEnvio): DesgloseEnvio {
  const domicilioBase = Math.max(0, Math.round(c.deliveryFee || 0));
  const flete = c.intercity ? Math.max(0, Math.round(c.intercityFee ?? 0)) : 0;

  const domicilio = !c.intercity || c.lastMile ? domicilioBase : 0;
  return { domicilio, flete, total: domicilio + flete };
}

/** Lo mínimo para decidir si se puede ofrecer la entrega a domicilio. */
export interface CandidatoUltimaMilla {
  intercity: boolean;
  deliveryLat: number | null | undefined;
  deliveryLng: number | null | undefined;
}

/**
 * Motivo por el que NO se puede llevar a la puerta, o `null` si sí.
 *
 * Sin coordenadas de entrega no hay a dónde despachar: el emparejamiento es
 * PostGIS sobre un radio, y una dirección escrita a mano no le sirve. Pedirlo
 * igual dejaría la caja en la bodega esperando a un repartidor que nunca se
 * busca, con el cliente creyendo que va en camino.
 */
export function motivoParaNoLlevarAPuerta(c: CandidatoUltimaMilla): string | null {
  if (!c.intercity) return 'no-es-intermunicipal';
  if (c.deliveryLat == null || c.deliveryLng == null) return 'sin-coordenadas-de-entrega';
  return null;
}

/** Dónde recoge el repartidor de última milla. */
export interface PuntoDeEntrega {
  lat: number;
  lng: number;
}

/**
 * El punto donde quedó la caja en la ciudad de destino.
 *
 * Es la posición REAL del conductor del bus cuando firmó el acta, no una
 * dirección de terminal que nadie declaró. Si no hay posición se devuelve null
 * y el despacho de última milla no arranca: mandar al repartidor al centroide
 * del municipio sería mandarlo a un punto donde la caja no está.
 */
export function puntoDeEntrega(
  lat: number | null | undefined,
  lng: number | null | undefined,
): PuntoDeEntrega | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // (0,0) es el golfo de Guinea: en este dominio significa «falta el dato».
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}
