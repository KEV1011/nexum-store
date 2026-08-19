/**
 * Estados en los que un servicio ya está cerrado y no admite más transiciones.
 *
 * Existe porque las tres liquidaciones —viaje urbano, pedido y mandado— llaman
 * a `recordCompletedTrip`, que hace `increment` sobre el acumulado del día del
 * conductor. No es idempotente ni puede serlo: dos "entregado" del mismo
 * servicio le pagan el doble, y nadie lo nota hasta que cuadran caja. Un
 * segundo mensaje es de lo más fácil que hay — un doble toque, una reconexión
 * del WebSocket que reenvía, un reintento tras un `ack` perdido.
 *
 * Y al revés: sin esta lista, un "entregado" que llega tarde revive un servicio
 * que el cliente ya había cancelado, y encima lo paga.
 *
 * La comprobación NO se hace leyendo y luego escribiendo: eso deja una ventana
 * entre las dos consultas por la que pasan las dos peticiones. Se hace con
 * `updateMany` y estos estados en el `where`, para que sea la base de datos la
 * que decida quién gana; `count === 0` significa "otro llegó antes, o ya estaba
 * cerrado".
 */

/** Viaje urbano y envío (`Trip`). */
export const TRIP_TERMINALES = ['COMPLETED', 'CANCELLED'] as const;

/** Pedido a un negocio (`Order`). */
export const ORDER_TERMINALES = ['DELIVERED', 'CANCELLED'] as const;

/** Mandado (`Errand`). */
export const ERRAND_TERMINALES = ['DELIVERED', 'CANCELLED'] as const;

export type ServicioCerrable = 'trip' | 'order' | 'errand';

const POR_TIPO: Record<ServicioCerrable, readonly string[]> = {
  trip: TRIP_TERMINALES,
  order: ORDER_TERMINALES,
  errand: ERRAND_TERMINALES,
};

/**
 * ¿Este estado ya es final para ese tipo de servicio?
 *
 * Compara en mayúsculas porque los estados viajan como enum de Prisma
 * ('DELIVERED') pero las apps mandan la acción en minúscula ('delivered'), y
 * confundir los dos formatos dejaría la guarda pasando siempre.
 */
export function esEstadoTerminal(
  tipo: ServicioCerrable,
  estado: string | null | undefined,
): boolean {
  if (!estado) return false;
  return POR_TIPO[tipo].includes(estado.toUpperCase());
}

/** Los estados desde los que SÍ se puede avanzar, para el `where` de Prisma. */
export function guardaNoTerminal(tipo: ServicioCerrable): {
  notIn: readonly string[];
} {
  return { notIn: POR_TIPO[tipo] };
}
