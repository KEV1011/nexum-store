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
  imageUrl: string | null;
  sentAt: string;
}

type ChatCb = (msg: TripChatMessageDTO) => void;
const _listeners = new Map<string, Set<ChatCb>>();

function _toDTO(m: {
  id: string; tripId: string; senderRole: string; senderId: string; body: string; imageUrl: string | null; createdAt: Date;
}): TripChatMessageDTO {
  return {
    id: m.id,
    tripId: m.tripId,
    senderRole: m.senderRole === 'driver' ? 'driver' : 'client',
    senderId: m.senderId,
    body: m.body,
    imageUrl: m.imageUrl,
    sentAt: m.createdAt.toISOString(),
  };
}

/**
 * Verifica que quien pide sea participante del servicio (cliente o conductor) y
 * devuelve su rol. Lanza si no pertenece.
 *
 * El chat nació para el viaje urbano y solo miraba la tabla `Trip`. Pero en la
 * app del conductor el botón de chat sale también en MANDADOS y PEDIDOS, donde
 * el identificador que se pasa es el del mandado o el del pedido: la consulta
 * no encontraba nada y todo —abrir el historial, escribir, mandar una foto—
 * moría en un 403. Y es justo donde más falta hace hablar: el repartidor que
 * está en la tienda necesita preguntar si la marca sirve, y el que llega a un
 * portón cerrado necesita avisar.
 *
 * `TripMessage.tripId` es una columna de texto sin clave foránea, así que el
 * mismo hilo sirve para los tres sin tocar el modelo. Se consulta en orden y se
 * para en cuanto uno responde.
 */
async function _assertParticipant(tripId: string, requesterId: string): Promise<TripChatRole> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { passengerId: true, driverId: true },
  });
  if (trip) return _rol(trip.passengerId, trip.driverId, requesterId);

  const errand = await prisma.errand.findUnique({
    where: { id: tripId },
    select: { userId: true, driverId: true },
  });
  if (errand) return _rol(errand.userId, errand.driverId, requesterId);

  const order = await prisma.order.findUnique({
    where: { id: tripId },
    select: { userId: true, driverId: true },
  });
  if (order) return _rol(order.userId, order.driverId, requesterId);

  throw new TripChatError('El servicio no existe.');
}

function _rol(
  clientId: string | null,
  driverId: string | null,
  requesterId: string,
): TripChatRole {
  if (clientId && clientId === requesterId) return 'client';
  if (driverId && driverId === requesterId) return 'driver';
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

/**
 * Publica un mensaje con FOTO en el chat del viaje (compartir ubicación/estado).
 * `imageUrl` ya subida (fileToUrl). Mismo control de participante + fan-out.
 */
export async function postTripChatPhoto(
  tripId: string,
  role: TripChatRole,
  senderId: string,
  imageUrl: string,
): Promise<TripChatMessageDTO> {
  const actualRole = await _assertParticipant(tripId, senderId);
  if (actualRole !== role) throw new TripChatError('No autorizado.');
  if (!imageUrl) throw new TripChatError('No se recibió la imagen.');

  const row = await prisma.tripMessage.create({
    data: { tripId, senderRole: role, senderId, body: '', imageUrl },
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
