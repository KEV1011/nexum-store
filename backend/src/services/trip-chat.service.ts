// ── Chat de viaje (pasajero ↔ conductor) ──────────────────────────────────────
//
// Mensajería PERSISTENTE atada a un Trip (a diferencia del chat de la subasta
// de tarifa, que vive en memoria). Cada mensaje se guarda en `trip_messages` y
// se reparte en vivo a los suscriptores por WS. Autoriza: solo el pasajero o el
// conductor del viaje pueden leer/escribir.

import { prisma } from '../lib/prisma';
import {
  cuerpoDeAvisoChat,
  RitmoDeAvisos,
  tituloDeAvisoChat,
  type RolDeChat,
  type ServicioDeChat,
} from '../lib/aviso-chat';
import { sendPushToClient, sendPushToDriver } from './push.service';

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
  /**
   * Quién lo escribió, SOLO en el chat de un viaje por puestos. Ahí hablan
   * varios pasajeros a la vez con el conductor, y «un pasajero» a secas no
   * dice quién va a llegar tarde. En los chats de uno a uno se omite.
   */
  senderName?: string;
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

  // El viaje por PUESTOS: un chat de GRUPO. Habla el conductor que lo tomó y
  // cualquier pasajero con una reserva vigente — es donde se dice «voy en la
  // esquina» o «me demoro dos minutos», y en un taxi compartido eso le importa
  // a todos los que esperan, no solo al conductor.
  const salida = await _participantesDeSalida(tripId);
  if (salida) {
    if (salida.driverId && salida.driverId === requesterId) return 'driver';
    if (salida.nombres.has(requesterId) && requesterId !== salida.driverId) return 'client';
    throw new TripChatError('No autorizado.');
  }

  throw new TripChatError('El servicio no existe.');
}

/**
 * Quién participa en el chat de una salida por puestos, con su nombre.
 * `null` si el id no es de una salida. Las reservas canceladas no cuentan:
 * quien se bajó del viaje deja de leer lo que se dicen los que siguen.
 */
async function _participantesDeSalida(
  tripId: string,
): Promise<{ driverId: string | null; nombres: Map<string, string> } | null> {
  const salida = await prisma.pooledTrip.findUnique({
    where: { id: tripId },
    select: {
      driverId: true,
      driverName: true,
      bookings: {
        where: { status: 'CONFIRMED' },
        select: { userId: true, passengerName: true },
      },
    },
  });
  if (!salida) return null;
  const nombres = new Map<string, string>();
  for (const b of salida.bookings) nombres.set(b.userId, b.passengerName);
  if (salida.driverId) nombres.set(salida.driverId, salida.driverName ?? 'Conductor');
  return { driverId: salida.driverId, nombres };
}

/** Pone el nombre en los mensajes de un chat de grupo; los demás, intactos. */
async function _conNombres(
  tripId: string,
  dtos: TripChatMessageDTO[],
): Promise<TripChatMessageDTO[]> {
  const salida = await _participantesDeSalida(tripId);
  if (!salida) return dtos;
  return dtos.map((m) => {
    const nombre = salida.nombres.get(m.senderId);
    return nombre ? { ...m, senderName: nombre } : m;
  });
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
  return _conNombres(tripId, rows.map(_toDTO));
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
  const [dto] = await _conNombres(tripId, [_toDTO(row)]);
  for (const cb of _listeners.get(tripId) ?? []) cb(dto);
  void _avisarDestinatarios(tripId, senderId, dto);
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
  const [dto] = await _conNombres(tripId, [_toDTO(row)]);
  for (const cb of _listeners.get(tripId) ?? []) cb(dto);
  void _avisarDestinatarios(tripId, senderId, dto);
  return dto;
}

// ── Aviso a quien no tiene el chat abierto ───────────────────────────────────
//
// El reparto de arriba solo llega a quien está DENTRO de la pantalla del chat.
// A los demás participantes se les entrega el mensaje por su socket (así su
// contador de no leídos sube aunque estén en el seguimiento) y una notificación
// al teléfono, con pausa entre avisos. `ws.handler` registra la entrega para no
// importar sockets desde aquí (patrón del repo, evita el ciclo).

export interface DestinoDeChat {
  rol: RolDeChat;
  id: string;
}

/** Devuelve true si el destinatario YA está viendo ese chat (no hace falta avisar). */
type EntregaDeChat = (destino: DestinoDeChat, tripId: string, msg: TripChatMessageDTO) => boolean;
let _entregar: EntregaDeChat | null = null;

export function registerAvisoDeChat(fn: EntregaDeChat): void {
  _entregar = fn;
}

const _ritmo = new RitmoDeAvisos();

/** Participantes del chat, qué servicio es y cómo se llama quien escribe. */
async function _participantes(
  tripId: string,
): Promise<{ servicio: ServicioDeChat; personas: DestinoDeChat[] } | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { passengerId: true, driverId: true, serviceType: true },
  });
  if (trip) {
    return {
      servicio: trip.serviceType === 'ENVIOS' ? 'envio' : 'trip',
      personas: _par(trip.passengerId, trip.driverId),
    };
  }
  const errand = await prisma.errand.findUnique({
    where: { id: tripId },
    select: { userId: true, driverId: true },
  });
  if (errand) return { servicio: 'errand', personas: _par(errand.userId, errand.driverId) };
  const order = await prisma.order.findUnique({
    where: { id: tripId },
    select: { userId: true, driverId: true },
  });
  if (order) return { servicio: 'order', personas: _par(order.userId, order.driverId) };
  const salida = await _participantesDeSalida(tripId);
  if (salida) {
    const personas: DestinoDeChat[] = [];
    for (const id of salida.nombres.keys()) {
      personas.push({ rol: id === salida.driverId ? 'driver' : 'client', id });
    }
    return { servicio: 'pooled', personas };
  }
  return null;
}

function _par(clientId: string | null, driverId: string | null): DestinoDeChat[] {
  const out: DestinoDeChat[] = [];
  if (clientId) out.push({ rol: 'client', id: clientId });
  if (driverId) out.push({ rol: 'driver', id: driverId });
  return out;
}

/**
 * Best-effort: un fallo aquí no puede tumbar el envío del mensaje, que ya
 * quedó guardado y repartido.
 */
async function _avisarDestinatarios(
  tripId: string,
  senderId: string,
  dto: TripChatMessageDTO,
): Promise<void> {
  try {
    const info = await _participantes(tripId);
    if (!info) return;
    const titulo = tituloDeAvisoChat(info.servicio, dto.senderRole, dto.senderName);
    const cuerpo = cuerpoDeAvisoChat(dto.body, !!dto.imageUrl);
    for (const destino of info.personas) {
      if (destino.id === senderId) continue;
      const viendo = _entregar ? _entregar(destino, tripId, dto) : false;
      if (viendo) continue;
      if (!_ritmo.tocaAvisar(destino.id, tripId)) continue;
      const data: Record<string, string> = {
        type: 'chat_message',
        servicio: info.servicio,
        tripId,
      };
      if (info.servicio === 'order') data.orderId = tripId;
      const payload = { title: titulo, body: cuerpo, data };
      await (destino.rol === 'driver'
        ? sendPushToDriver(destino.id, payload)
        : sendPushToClient(destino.id, payload));
    }
  } catch (err) {
    console.warn('[Chat] No se pudo avisar del mensaje nuevo:', err);
  }
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
