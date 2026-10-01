// La bitácora del pedido: una fila por cada cambio de estado, con su hora.
//
// POR QUÉ UNA PUERTA ÚNICA. El estado del pedido se mueve desde trece sitios
// —el cliente, el negocio, el repartidor, la empresa de transporte y dos
// barridos automáticos— y cada uno con su guarda. Repartir el `create` por
// los trece es garantizar que al catorceavo se le olvide, que es exactamente
// lo que pasó con la condición de despacho («una CUARTA copia en
// `_offerOrderToCandidate`, que descartaba el candidato en silencio»).
//
// Aquí hay UNA función. Lo que impide que alguien escriba el `create` por su
// cuenta es `pedido-eventos.test.ts`, que barre `src/` y falla si
// `prisma.orderEvent` aparece fuera de este archivo.
//
// ES BEST-EFFORT, Y ESO ES DELIBERADO. Registrar que el pedido pasó a «en
// camino» no puede impedir que el pedido pase a «en camino»: si la escritura
// de la bitácora falla, se pierde una hora del historial, que es molesto;
// si tumbara la transición, el cliente se quedaría con la caja parada. Por
// eso no se lanza nunca y el fallo va al log.

import { prisma } from '../lib/prisma';
import type { EstadoPedidoBD, EventoPedido } from '../lib/linea-tiempo-pedido';

/** Quién movió el pedido. Texto libre en BD; estos son los que se usan. */
export type ActorPedido =
  | 'cliente' | 'negocio' | 'conductor' | 'empresa' | 'sistema';

/**
 * Deja constancia de que el pedido llegó a [status].
 *
 * Se llama DESPUÉS de que la escritura del estado haya cuajado de verdad
 * (con `updateMany`, comprobando que `count > 0`): registrar antes dejaría
 * en el historial pasos que la guarda rechazó.
 */
export async function registrarEventoPedido(
  orderId: string,
  status: EstadoPedidoBD,
  opts: { actor?: ActorPedido; note?: string } = {},
): Promise<void> {
  try {
    await prisma.orderEvent.create({
      data: {
        orderId,
        status,
        ...(opts.actor ? { actor: opts.actor } : {}),
        ...(opts.note ? { note: opts.note } : {}),
      },
    });
  } catch (err) {
    console.error(
      `[PedidoEventos] no se pudo registrar ${status} de ${orderId}: `
      + `${err instanceof Error ? err.message : err}`,
    );
  }
}

/** La bitácora del pedido, de lo más viejo a lo más nuevo. */
export async function historialDePedido(orderId: string): Promise<EventoPedido[]> {
  const filas = await prisma.orderEvent.findMany({
    where: { orderId },
    orderBy: { at: 'asc' },
    select: { status: true, at: true, actor: true, note: true },
  });
  return filas.map((f) => ({
    status: f.status as EstadoPedidoBD,
    at: f.at,
    actor: f.actor,
    note: f.note,
  }));
}

/**
 * Las bitácoras de varios pedidos a la vez, para los listados.
 *
 * Una consulta por pedido convertiría «mis pedidos» en veinte viajes a la
 * base; el listado es justo donde eso se nota.
 */
export async function historialesDePedidos(
  orderIds: string[],
): Promise<Map<string, EventoPedido[]>> {
  const salida = new Map<string, EventoPedido[]>();
  if (orderIds.length === 0) return salida;

  const filas = await prisma.orderEvent.findMany({
    where: { orderId: { in: orderIds } },
    orderBy: { at: 'asc' },
    select: { orderId: true, status: true, at: true, actor: true, note: true },
  });
  for (const f of filas) {
    const lista = salida.get(f.orderId) ?? [];
    lista.push({
      status: f.status as EstadoPedidoBD,
      at: f.at,
      actor: f.actor,
      note: f.note,
    });
    salida.set(f.orderId, lista);
  }
  return salida;
}
