/**
 * Cambio de estado de un PEDIDO o un MANDADO hecho por su repartidor, con
 * respuesta.
 *
 * POR QUÉ EXISTE. Hasta ahora estos dos cambios solo viajaban por WebSocket, y
 * el socket no acusa recibo: el emisor de la app descarta en silencio lo que se
 * manda con la conexión caída. Para «llegué al local» es un incordio; para
 * «entregado» es plata — ahí se liquida el domicilio, se le paga al repartidor
 * y se le devuelve al despacho. Cuando ese mensaje se perdía, la app enseñaba
 * su resumen igual, el servidor no liquidaba nada, el cliente seguía viendo
 * «en camino» y el repartidor quedaba «en viaje», o sea fuera del despacho. Es
 * el mismo defecto que el viaje urbano ya corrigió con
 * `POST /driver/trips/:id/status`; estos dos servicios se habían quedado atrás.
 *
 * NO es un segundo camino de escritura: llama a las MISMAS funciones que el
 * socket (`updateOrderStatusByDriver`, `updateErrandStatus`), con su PIN de
 * custodia, su guarda atómica y su liquidación. Lo único propio es lo que un
 * socket no puede dar y una petición sí:
 *
 *  · decir de quién es el servicio (404 / 403) en vez de callar;
 *  · decir que el cliente lo CANCELÓ (409), que es lo que el repartidor
 *    necesita saber antes de seguir hasta una puerta donde nadie lo espera;
 *  · ser IDEMPOTENTE: quien reintenta porque se le cayó la respuesta recibe
 *    «sí, ya está» con el estado real, y no un error ni una segunda
 *    liquidación (eso último lo impide la guarda del `updateMany`, no esto).
 */
import { prisma } from '../lib/prisma';
import { liberarConductorSiNoTieneMas } from '../lib/liberar-conductor';
import type { ClientErrandDTO, ClientOrderSummaryDTO, ErrandStatus } from '../types';
import { updateOrderStatusByDriver, type DriverOrderStatus } from './client.service';
import { getClientErrandSnapshot, updateErrandStatus } from './errand.service';

/** Estados que el repartidor puede fijar en un pedido. */
export type { DriverOrderStatus };
export const ESTADOS_DE_PEDIDO: readonly DriverOrderStatus[] = [
  'at_pickup', 'in_transit', 'delivered',
];

/**
 * Estados que el mandadero puede fijar en un mandado. Sin `cancelled` a
 * propósito: la app no tiene ese botón, y abrirlo por HTTP sería darle a quien
 * aceptó una forma de soltar el mandado sin que nadie vuelva a buscarle
 * repartidor al cliente.
 */
export const ESTADOS_DE_MANDADO = ['shopping', 'on_the_way', 'delivered'] as const;
export type EstadoDeMandado = (typeof ESTADOS_DE_MANDADO)[number];

/** El servicio no existe, no es de quien lo mueve, o ya no admite el cambio. */
export class EstadoServicioError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'EstadoServicioError';
  }
}

/**
 * Pedido: `at_pickup` → `in_transit` → `delivered`.
 *
 * Lanza `EstadoServicioError` (404/409) o `CustodyPinError` (el PIN no cuadra).
 */
export async function driverUpdateOrderStatus(
  driverId: string,
  orderId: string,
  status: DriverOrderStatus,
  pin?: string,
): Promise<ClientOrderSummaryDTO> {
  // Se mira ANTES de pedir el PIN: si el cliente ya canceló, decirle al
  // repartidor «el PIN no coincide» lo dejaría pidiéndole otro código a
  // alguien que ya no está esperando nada.
  const previo = await prisma.order.findUnique({
    where: { id: orderId },
    select: { driverId: true, status: true },
  });
  if (!previo || previo.driverId !== driverId) {
    throw new EstadoServicioError('Ese pedido no existe o no está asignado a ti', 404);
  }
  if (previo.status === 'CANCELLED') {
    throw new EstadoServicioError('Este pedido fue cancelado. No hace falta entregarlo.', 409);
  }

  const order = await updateOrderStatusByDriver(orderId, driverId, status, pin);
  if (!order) {
    throw new EstadoServicioError('Ese pedido no existe o no está asignado a ti', 404);
  }
  // Se canceló entre la lectura de arriba y la escritura: la guarda atómica no
  // lo movió y devuelve el estado real.
  if (order.status === 'cancelled') {
    throw new EstadoServicioError('Este pedido fue cancelado. No hace falta entregarlo.', 409);
  }
  return order;
}

/**
 * Mandado: `shopping` → `on_the_way` → `delivered`.
 *
 * Lanza `EstadoServicioError` (404/403/409) o `CustodyPinError`.
 */
export async function driverUpdateErrandStatus(
  driverId: string,
  errandId: string,
  status: EstadoDeMandado,
  actualCost?: number,
  pin?: string,
): Promise<ClientErrandDTO> {
  const previo = await prisma.errand.findUnique({
    where: { id: errandId },
    select: { driverId: true, status: true },
  });
  if (!previo) throw new EstadoServicioError('Ese mandado no existe', 404);
  // Más estricto que el socket, que deja pasar un mandado sin mandadero: por
  // aquí solo lo mueve quien lo tiene asignado.
  if (previo.driverId !== driverId) {
    throw new EstadoServicioError('Ese mandado no está asignado a ti', 403);
  }
  if (previo.status === 'CANCELLED') {
    throw new EstadoServicioError('Este mandado fue cancelado. No hace falta entregarlo.', 409);
  }

  const dto = await updateErrandStatus(errandId, status as ErrandStatus, actualCost, pin);
  if (!dto) {
    // No lo movió: ya estaba entregado (es el reintento de una respuesta que
    // se perdió — `updateErrandStatus` corta ahí antes de pedir el PIN), otro
    // toque llegó antes, o el cliente canceló justo ahora. Se responde con el
    // estado real en vez de con un error que no dice nada.
    const real = await _mandadoTalComoEsta(errandId);
    if (real.status === 'cancelled') {
      throw new EstadoServicioError('Este mandado fue cancelado. No hace falta entregarlo.', 409);
    }
    return real;
  }

  // El socket lo ponía en línea sin mirar si llevaba otro servicio; por aquí
  // se usa la regla común, que respeta el encadenado.
  if (status === 'delivered') await liberarConductorSiNoTieneMas(driverId);
  return dto;
}

async function _mandadoTalComoEsta(errandId: string): Promise<ClientErrandDTO> {
  const dto = await getClientErrandSnapshot(errandId);
  if (!dto) throw new EstadoServicioError('Ese mandado no existe', 404);
  return dto;
}
