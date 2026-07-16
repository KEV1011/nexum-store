// ── Chat de viaje (pasajero ↔ conductor) ──────────────────────────────────────
//
// Mensajería PERSISTENTE atada a un Trip (a diferencia del chat de la subasta
// de tarifa, que vive en memoria). Cada mensaje se guarda en `trip_messages` y
// se reparte en vivo a los suscriptores por WS. Autoriza: solo el pasajero o el
// conductor del viaje pueden leer/escribir.

import { prisma } from '../lib/prisma';

export class TripChatError extends Error {}

export type TripChatRole = 'client' | 'driver';

export interface TripChatMessageDTO {
  id: string;
  tripId: string;
  senderRole: TripChatRole;
  senderId: string;
  body: string;
  sentAt: string;
}

type ChatCb = (msg: TripChatMessageDTO) => void;
const _listeners = new Map<string, Set<ChatCb>>();

function _toDTO(m: {
  id: string; tripId: string; senderRole: string; senderId: string; body: string; createdAt: Date;
}): TripChatMessageDTO {
  return {
    id: m.id,
    tripId: m.tripId,
    senderRole: m.senderRole === 'driver' ? 'driver' : 'client',
    senderId: m.senderId,
    body: m.body,
    sentAt: m.createdAt.toISOString(),
  };
}

/**
 * Verifica que quien pide sea participante del viaje (pasajero o conductor) y
 * devuelve su rol. Lanza si no pertenece al viaje.
 */
async function _assertParticipant(tripId: string, requesterId: string): Promise<TripChatRole> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { passengerId: true, driverId: true },
  });
  if (!trip) throw new TripChatError('El viaje no existe.');
  if (trip.passengerId && trip.passengerId === requesterId) return 'client';
  if (trip.driverId && trip.driverId === requesterId) return 'driver';
  throw new TripChatError('No autorizado.');
}

/** Historial del chat del viaje (autorizado). */
export async function getTripChat(tripId: string, requesterId: string): Promise<TripChatMessageDTO[]> {
  await _assertParticipant(tripId, requesterId);
  const rows = await prisma.tripMessage.findMany({
    where: { tripId },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  return rows.map(_toDTO);
}

/**
 * Publica un mensaje en el chat del viaje. `role` viene del socket autenticado;
 * se valida contra el viaje (que el emisor sea realmente ese participante).
 */
export async function postTripChat(
  tripId: string,
  role: TripChatRole,
  senderId: string,
  text: string,
): Promise<TripChatMessageDTO> {
  const actualRole = await _assertParticipant(tripId, senderId);
  if (actualRole !== role) throw new TripChatError('No autorizado.');
  const body = text.trim();
  if (!body) throw new TripChatError('El mensaje está vacío.');

  const row = await prisma.tripMessage.create({
    data: { tripId, senderRole: role, senderId, body: body.slice(0, 1000) },
  });
  const dto = _toDTO(row);
  for (const cb of _listeners.get(tripId) ?? []) cb(dto);
  return dto;
}

/** Suscripción en vivo al chat del viaje (usada por ws.handler). */
export function subscribeTripChat(tripId: string, cb: ChatCb): () => void {
  if (!_listeners.has(tripId)) _listeners.set(tripId, new Set());
  _listeners.get(tripId)!.add(cb);
  return () => {
    const set = _listeners.get(tripId);
    set?.delete(cb);
    if (set && set.size === 0) _listeners.delete(tripId);
  };
}
