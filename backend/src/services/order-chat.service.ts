import { ChatRole, OrderChatMessageDTO } from '../types';
import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Chat en pedidos de domicilio (cliente ↔ repartidor asignado).
//
// Mismo contrato que el chat de rides (ride-negotiation.service.ts) pero con
// dos diferencias deliberadas:
//   • Los mensajes se persisten en BD (`order_chat_messages`): los pedidos son
//     entidades durables y su historial debe sobrevivir reinicios.
//   • La autorización se valida contra la fila Order: solo el dueño del pedido
//     (userId) y el repartidor asignado (driverId) pueden leer/escribir.
// El fan-out en tiempo real usa listeners en memoria por orderId, igual que
// las suscripciones de pedidos/mandados.
// ─────────────────────────────────────────────────────────────────────────────

export class OrderChatError extends Error {}

type OrderChatCb = (msg: OrderChatMessageDTO) => void;
const orderChatListeners = new Map<string, Set<OrderChatCb>>();

const MAX_TEXT_LENGTH = 1000;

function _toDTO(m: { id: string; orderId: string; fromRole: string; fromId: string; text: string; sentAt: Date }): OrderChatMessageDTO {
  return {
    id: m.id,
    orderId: m.orderId,
    fromRole: m.fromRole as ChatRole,
    fromId: m.fromId,
    text: m.text,
    sentAt: m.sentAt.toISOString(),
  };
}

/** Solo el cliente dueño del pedido o el repartidor asignado participan. */
export async function canAccessOrderChat(
  orderId: string,
  role: ChatRole,
  participantId: string,
): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { userId: true, driverId: true },
  });
  if (!order) return false;
  if (role === 'client') return order.userId === participantId;
  return order.driverId === participantId;
}

export async function addOrderChatMessage(
  orderId: string,
  fromRole: ChatRole,
  fromId: string,
  text: string,
): Promise<OrderChatMessageDTO> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { userId: true, driverId: true },
  });
  if (!order) throw new OrderChatError('El pedido no existe.');
  if (fromRole === 'client' && order.userId !== fromId) {
    throw new OrderChatError('No autorizado.');
  }
  if (fromRole === 'driver' && order.driverId !== fromId) {
    throw new OrderChatError('No autorizado.');
  }
  const trimmed = text.trim();
  if (!trimmed) throw new OrderChatError('El mensaje está vacío.');

  const saved = await prisma.orderChatMessage.create({
    data: {
      orderId,
      fromRole,
      fromId,
      text: trimmed.slice(0, MAX_TEXT_LENGTH),
    },
  });

  const dto = _toDTO(saved);
  for (const cb of orderChatListeners.get(orderId) ?? []) cb(dto);
  return dto;
}

export async function getOrderChatHistory(orderId: string): Promise<OrderChatMessageDTO[]> {
  const messages = await prisma.orderChatMessage.findMany({
    where: { orderId },
    orderBy: { sentAt: 'asc' },
  });
  return messages.map(_toDTO);
}

export function subscribeOrderChat(orderId: string, cb: OrderChatCb): () => void {
  if (!orderChatListeners.has(orderId)) orderChatListeners.set(orderId, new Set());
  orderChatListeners.get(orderId)!.add(cb);
  return () => orderChatListeners.get(orderId)?.delete(cb);
}
