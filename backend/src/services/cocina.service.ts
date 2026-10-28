// ── El tablero de la cocina ────────────────────────────────────────────────
//
// Mesa y domicilio JUNTOS: a la cocina le da igual el destino para cocinar, y
// separarlos la obligaría a mirar dos pantallas y a decidir ella el orden —
// que es donde se pierden los pedidos un viernes por la noche. El portal del
// dueño sí los lleva aparte, y con razón: para él son dos negocios con dinero
// distinto, y su consulta filtra por `mode: 'DELIVERY'`.
//
// AQUÍ SOLO VIVE LA LISTA. Marcar un plato como hecho ya lo hace
// `markOrderReadyByBusiness` (client.service), que sella `Order.readyAt`,
// avisa al repartidor por WS y manda push al cliente. Escribir la marca
// también desde aquí habría dejado dos caminos con efectos distintos según
// por dónde se tocara el botón: desde el portal avisaría y desde la cocina
// no, y nadie entendería por qué unos pedidos avisan y otros no.

import { prisma } from '../lib/prisma';
import {
  ESTADOS_EN_COCINA,
  ordenarParaCocina,
  platosPendientes,
  type PedidoCocina,
} from '../lib/cocina';

/**
 * Lo que hay que cocinar ahora mismo en este local.
 *
 * El reloj sale de `acceptedAt` —cuándo el negocio ACEPTÓ— y no de
 * `createdAt`: el rato que el pedido pasó en el mostrador esperando a que lo
 * aceptaran no es tiempo de cocina, y ese reloj es justo el que alguien va a
 * usar para decir que la cocina va lenta. En los pedidos anteriores a ese
 * campo queda en null, que es honesto: no se inventa una hora de entrada.
 */
export async function pedidosEnCocina(businessId: string): Promise<{
  pedidos: PedidoCocina[];
  platos: number;
}> {
  const pedidos = await prisma.order.findMany({
    where: { businessId, status: { in: ESTADOS_EN_COCINA } },
    select: {
      id: true, orderRef: true, status: true, mode: true,
      tableLabel: true, acceptedAt: true, readyAt: true, etaMinutes: true,
      takenByName: true,
      lines: {
        select: { productName: true, quantity: true, optionsSummary: true, notes: true },
      },
    },
  });

  const mapeados: PedidoCocina[] = pedidos.map((o) => ({
    id: o.id,
    orderRef: o.orderRef,
    status: o.status,
    mode: o.mode,
    tableLabel: o.tableLabel,
    acceptedAt: o.acceptedAt,
    readyAt: o.readyAt,
    etaMinutes: o.etaMinutes,
    tomadoPor: o.takenByName,
    lineas: o.lines,
  }));

  return {
    pedidos: ordenarParaCocina(mapeados),
    platos: platosPendientes(mapeados),
  };
}

/**
 * Deshace la marca de «listo».
 *
 * `markOrderReadyByBusiness` no deja volver atrás —devuelve null si el pedido
 * ya tiene `readyAt`—, y en una cocina el botón se toca con prisa y con la
 * mano ocupada. Sin vuelta atrás, un plato marcado por error desaparece de lo
 * que falta y nadie lo cocina.
 *
 * NO deshace los avisos que ya salieron, y no debe: al repartidor ya se le
 * dijo que viniera y al cliente que su pedido estaba listo. Desmarcar corrige
 * la LISTA de la cocina, no reescribe lo que ya pasó.
 *
 * El `businessId` en el `where` es la comprobación de pertenencia y la
 * escritura a la vez: el token de un local no puede tocar el pedido de otro, y
 * un id ajeno no escribe ninguna fila en vez de lanzar a medias.
 */
export async function deshacerPlatoListo(
  businessId: string,
  orderId: string,
): Promise<void> {
  const r = await prisma.order.updateMany({
    // Solo sobre un pedido que la cocina esté viendo: «desmarcar» algo ya
    // entregado o cancelado no significa nada.
    where: { id: orderId, businessId, status: { in: ESTADOS_EN_COCINA } },
    data: { readyAt: null },
  });
  if (r.count === 0) {
    throw new Error('Ese pedido ya no está en la cocina.');
  }
}
