/**
 * Nombre del estado del pedido tal como lo espera la app.
 *
 * POR QUÉ ESTO ES UN MÓDULO Y NO UN OBJETO DENTRO DEL MAPPER
 * ----------------------------------------------------------
 * La app compara el estado con `CustomerOrderStatus.values.firstWhere(
 * (s) => s.name == j['status'])`, o sea contra el nombre del enum de Dart, que
 * va en camelCase. El backend guarda MAYUSCULAS_CON_GUION.
 *
 * El mapper tenía la traducción escrita a mano con un `?? o.status.toLowerCase()`
 * de respaldo, y ese respaldo es el problema: cuando se añadió
 * `IN_INTERCITY_TRANSIT` nadie tocó el mapa, la traducción cayó al respaldo y
 * salió `in_intercity_transit`. La app no lo reconoce, se va a su `orElse` y el
 * cliente cuyo paquete iba en el bus veía **«Confirmado»**. No lo cazó nada:
 * ni el compilador (es un `Record<string,string>`) ni el linter.
 *
 * Aquí el mapa está tipado contra el enum de Prisma —`Record<OrderStatus, …>`—
 * así que **añadir un estado sin traducirlo ya no compila**, y una prueba
 * comprueba además que ningún valor se quedó con el nombre crudo.
 */

import { OrderStatus } from '@prisma/client';

/**
 * De lo que guarda la base a lo que entiende la app.
 *
 * Al ser `Record<OrderStatus, string>` el compilador exige una entrada por cada
 * valor del enum: si mañana se añade otro estado, esto no compila hasta
 * traducirlo. Ese es el punto.
 */
export const NOMBRE_ESTADO_PEDIDO: Record<OrderStatus, string> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  DRIVER_TO_PICKUP: 'driverToPickup',
  AT_PICKUP: 'atPickup',
  IN_INTERCITY_TRANSIT: 'inIntercityTransit',
  AT_DESTINATION_HUB: 'atDestinationHub',
  IN_TRANSIT: 'inTransit',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

/** El nombre que viaja en el DTO. */
export function nombreEstadoPedido(estado: OrderStatus | string): string {
  return NOMBRE_ESTADO_PEDIDO[estado as OrderStatus] ?? String(estado).toLowerCase();
}

/**
 * Desde qué estados se puede despachar un pedido a un repartidor.
 *
 * Son DOS y viven aquí, en un solo sitio, porque tres funciones distintas
 * tienen que estar de acuerdo —el ciclo de matching, el aceptar del repartidor
 * y su reintento— y cuando cada una llevaba su propia comparación, añadir la
 * última milla dejó las tres desalineadas: la oferta ni salía, y si salía,
 * aceptarla devolvía null.
 *
 *  · `PREPARING` — pedido urbano normal; el comercio ya lo aceptó.
 *  · `AT_DESTINATION_HUB` — encomienda que llegó a la otra ciudad y espera a
 *    quien la lleve hasta la puerta.
 */
export const ESTADOS_DESPACHABLES: OrderStatus[] = ['PREPARING', 'AT_DESTINATION_HUB'];

/** Si un pedido en ese estado puede ofrecerse a un repartidor. */
export function esDespachable(estado: OrderStatus | string): boolean {
  return ESTADOS_DESPACHABLES.includes(estado as OrderStatus);
}
