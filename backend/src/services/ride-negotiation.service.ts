import { randomUUID } from 'crypto';
import {
  RideRequestDTO,
  RideBidDTO,
  ChatMessageDTO,
  CreateRideRequestDTO,
  PlaceBidDTO,
  RideNegotiationStatus,
  BidStatus,
  ChatRole,
  TransportServiceType,
} from '../types';
import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Ride negotiation service (inDriver-style)
//
// Flow:
//   1. Client publishes a ride request with an offered fare        (createRideRequest)
//   2. All online drivers in matching mode receive it             (onNewRideRequest)
//   3. Each driver may bid: accept the fare or counter-offer       (placeBid)
//   4. Client sees incoming bids live                              (onRideUpdate)
//   5. Client accepts one bid → driver matched, others rejected    (acceptBid)
//   6. Both parties exchange chat messages bound to the ride       (addChatMessage)
//
// In-memory state: bids, chat, live status maps. Completed rides persist to Trip.
// ─────────────────────────────────────────────────────────────────────────────

export class RideNegotiationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RideNegotiationError';
  }
}

interface RideBid {
  id: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  driverRating: number;
  driverTotalTrips: number;
  vehicleDescription: string;
  fare: number;
  etaMinutes: number;
  status: BidStatus;
  createdAt: Date;
}

interface ChatMessage {
  id: string;
  rideId: string;
  fromRole: ChatRole;
  fromId: string;
  text: string;
  sentAt: Date;
}

interface RideRequest {
  id: string;
  rideRef: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  serviceType: TransportServiceType;
  originAddress: string;
  destinationAddress: string;
  originLat?: number;
  originLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  offeredFare: number;
  distanceKm: number;
  etaMinutes: number;
  notes?: string;
  status: RideNegotiationStatus;
  bids: Map<string, RideBid>;
  matchedDriverId?: string;
  matchedBidId?: string;
  driverLat?: number;
  driverLng?: number;
  chat: ChatMessage[];
  createdAt: Date;
  matchedAt?: Date;
  completedAt?: Date;
}

// ─── Stores ─────────────────────────────────────────────────────────────────

const rideStore = new Map<string, RideRequest>();
const clientActiveRide = new Map<string, string>(); // clientId → rideId
const driverActiveRide = new Map<string, string>(); // driverId → rideId

// ─── Listeners ────────────────────────────────────────────────────────────────

type RideUpdateCb = (ride: RideRequestDTO) => void;
type NewRideCb = (ride: RideRequestDTO) => void;
type ChatCb = (msg: ChatMessageDTO) => void;

// per-ride listeners (client + matched driver watch their ride)
const rideListeners = new Map<string, Set<RideUpdateCb>>();
// global broadcast to drivers when a new ride opens
const newRideListeners = new Set<NewRideCb>();
// per-ride chat listeners
const chatListeners = new Map<string, Set<ChatCb>>();

const ACTIVE_STATUSES: RideNegotiationStatus[] = [
  'open',
  'matched',
  'arriving',
  'arrived',
  'in_progress',
];

const SERVICE_TYPE_TO_PRISMA: Record<TransportServiceType, 'TAXI' | 'MOTO' | 'PARTICULAR' | 'ENVIOS'> = {
  taxi: 'TAXI', moto: 'MOTO', particular: 'PARTICULAR', envios: 'ENVIOS',
};

// ─── DTO mappers ────────────────────────────────────────────────────────────

function bidToDTO(b: RideBid): RideBidDTO {
  return {
    id: b.id,
    driverId: b.driverId,
    driverName: b.driverName,
    driverPhone: b.driverPhone,
    driverRating: b.driverRating,
    driverTotalTrips: b.driverTotalTrips,
    vehicleDescription: b.vehicleDescription,
    fare: b.fare,
    etaMinutes: b.etaMinutes,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
  };
}

/**
 * @param forDriverId  when set, exposes only this driver's own bid in the list
 *                     (drivers must not see competitors' offers).
 */
function rideToDTO(r: RideRequest, forDriverId?: string): RideRequestDTO {
  const bids = [...r.bids.values()]
    .filter((b) => (forDriverId ? b.driverId === forDriverId : true))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(bidToDTO);

  return {
    id: r.id,
    rideRef: r.rideRef,
    clientId: r.clientId,
    clientName: r.clientName,
    clientPhone: r.clientPhone,
    serviceType: r.serviceType,
    originAddress: r.originAddress,
    destinationAddress: r.destinationAddress,
    originLat: r.originLat,
    originLng: r.originLng,
    destinationLat: r.destinationLat,
    destinationLng: r.destinationLng,
    offeredFare: r.offeredFare,
    distanceKm: r.distanceKm,
    etaMinutes: r.etaMinutes,
    notes: r.notes,
    status: r.status,
    bids,
    bidCount: r.bids.size,
    matchedDriverId: r.matchedDriverId,
    matchedBidId: r.matchedBidId,
    driverLat: r.driverLat,
    driverLng: r.driverLng,
    createdAt: r.createdAt.toISOString(),
    matchedAt: r.matchedAt?.toISOString(),
    completedAt: r.completedAt?.toISOString(),
  };
}

function chatToDTO(m: ChatMessage): ChatMessageDTO {
  return {
    id: m.id,
    rideId: m.rideId,
    fromRole: m.fromRole,
    fromId: m.fromId,
    text: m.text,
    sentAt: m.sentAt.toISOString(),
  };
}

function notifyRide(r: RideRequest): void {
  // Client view (all bids) — the per-ride listeners may include the driver,
  // so we emit the client-complete view here; the handler tailors driver views
  // separately when relaying a matched ride.
  const dto = rideToDTO(r);
  for (const cb of rideListeners.get(r.id) ?? []) cb(dto);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function createRideRequest(
  clientId: string,
  clientName: string,
  clientPhone: string,
  dto: CreateRideRequestDTO,
): RideRequestDTO {
  // One active ride per client.
  const existingId = clientActiveRide.get(clientId);
  if (existingId) {
    const existing = rideStore.get(existingId);
    if (existing && ACTIVE_STATUSES.includes(existing.status)) {
      throw new RideNegotiationError('Ya tienes una solicitud activa.');
    }
  }

  if (dto.offeredFare <= 0) {
    throw new RideNegotiationError('La tarifa ofrecida debe ser mayor a cero.');
  }

  const id = `ride-${randomUUID().slice(0, 8)}`;
  const ride: RideRequest = {
    id,
    rideRef: `NX-${Math.floor(1000 + Math.random() * 8000)}`,
    clientId,
    clientName,
    clientPhone,
    serviceType: dto.serviceType,
    originAddress: dto.originAddress,
    destinationAddress: dto.destinationAddress,
    originLat: dto.originLat,
    originLng: dto.originLng,
    destinationLat: dto.destinationLat,
    destinationLng: dto.destinationLng,
    offeredFare: dto.offeredFare,
    distanceKm: dto.distanceKm,
    etaMinutes: dto.etaMinutes,
    notes: dto.notes,
    status: 'open',
    bids: new Map(),
    chat: [],
    createdAt: new Date(),
  };

  rideStore.set(id, ride);
  clientActiveRide.set(clientId, id);

  // Fan out to all online drivers.
  const dto2 = rideToDTO(ride);
  for (const cb of newRideListeners) cb(dto2);

  return dto2;
}

/** A driver accepts the offered fare or submits a counter-offer. */
export function placeBid(
  driverId: string,
  driverName: string,
  driverPhone: string,
  driverRating: number,
  driverTotalTrips: number,
  vehicleDescription: string,
  rideId: string,
  dto: PlaceBidDTO,
): RideBidDTO {
  const ride = rideStore.get(rideId);
  if (!ride) throw new RideNegotiationError('La solicitud no existe.');
  if (ride.status !== 'open') {
    throw new RideNegotiationError('La solicitud ya no acepta ofertas.');
  }
  if (dto.fare <= 0) throw new RideNegotiationError('La tarifa debe ser mayor a cero.');

  // One bid per driver per ride — re-bidding replaces the previous offer.
  const existing = [...ride.bids.values()].find((b) => b.driverId === driverId);
  const bid: RideBid = {
    id: existing?.id ?? `bid-${randomUUID().slice(0, 8)}`,
    driverId,
    driverName,
    driverPhone,
    driverRating,
    driverTotalTrips,
    vehicleDescription,
    fare: dto.fare,
    etaMinutes: dto.etaMinutes,
    status: 'pending',
    createdAt: new Date(),
  };
  ride.bids.set(bid.id, bid);

  notifyRide(ride);
  return bidToDTO(bid);
}

export function withdrawBid(driverId: string, rideId: string): RideRequestDTO | null {
  const ride = rideStore.get(rideId);
  if (!ride) return null;
  const bid = [...ride.bids.values()].find((b) => b.driverId === driverId);
  if (!bid) return null;
  ride.bids.delete(bid.id);
  notifyRide(ride);
  return rideToDTO(ride);
}

/** Client accepts one driver's bid. The matched fare becomes the bid fare. */
export function acceptBid(clientId: string, rideId: string, bidId: string): RideRequestDTO {
  const ride = rideStore.get(rideId);
  if (!ride) throw new RideNegotiationError('La solicitud no existe.');
  if (ride.clientId !== clientId) throw new RideNegotiationError('No autorizado.');
  if (ride.status !== 'open') throw new RideNegotiationError('La solicitud ya fue asignada.');

  const bid = ride.bids.get(bidId);
  if (!bid) throw new RideNegotiationError('La oferta no existe.');

  bid.status = 'accepted';
  for (const other of ride.bids.values()) {
    if (other.id !== bidId) other.status = 'rejected';
  }

  ride.status = 'matched';
  ride.matchedDriverId = bid.driverId;
  ride.matchedBidId = bid.id;
  ride.offeredFare = bid.fare; // agreed fare
  ride.matchedAt = new Date();
  driverActiveRide.set(bid.driverId, ride.id);

  notifyRide(ride);
  return rideToDTO(ride);
}

/** Driver advances the matched ride lifecycle. */
export function updateRideStatus(
  driverId: string,
  rideId: string,
  status: RideNegotiationStatus,
): RideRequestDTO | null {
  const ride = rideStore.get(rideId);
  if (!ride || ride.matchedDriverId !== driverId) return null;
  ride.status = status;
  if (status === 'completed') {
    const now = new Date();
    ride.completedAt = now;
    clientActiveRide.delete(ride.clientId);
    driverActiveRide.delete(driverId);

    // Persist completed ride to Trip table (fire-and-forget).
    void prisma.trip.create({
      data: {
        requestRef: ride.id,
        driverId: ride.matchedDriverId ?? null,
        serviceType: SERVICE_TYPE_TO_PRISMA[ride.serviceType] ?? 'PARTICULAR',
        status: 'COMPLETED',
        originAddress: ride.originAddress,
        originLat: ride.originLat ?? 0,
        originLng: ride.originLng ?? 0,
        destAddress: ride.destinationAddress,
        destLat: ride.destinationLat ?? 0,
        destLng: ride.destinationLng ?? 0,
        estimatedFare: ride.offeredFare,
        finalFare: ride.offeredFare,
        distanceKm: ride.distanceKm,
        etaMinutes: ride.etaMinutes,
        passengerName: ride.clientName,
        completedAt: now,
      },
    }).catch(() => { /* ignore if requestRef already exists */ });
  }
  notifyRide(ride);
  return rideToDTO(ride);
}

export function updateRideDriverLocation(
  driverId: string,
  rideId: string,
  lat: number,
  lng: number,
): string | null {
  const ride = rideStore.get(rideId);
  if (!ride || ride.matchedDriverId !== driverId) return null;
  ride.driverLat = lat;
  ride.driverLng = lng;
  return ride.clientId;
}

export function cancelRide(byClientId: string | null, byDriverId: string | null, rideId: string): RideRequestDTO | null {
  const ride = rideStore.get(rideId);
  if (!ride) return null;
  if (byClientId && ride.clientId !== byClientId) return null;
  if (byDriverId && ride.matchedDriverId !== byDriverId) return null;
  ride.status = 'cancelled';
  clientActiveRide.delete(ride.clientId);
  if (ride.matchedDriverId) driverActiveRide.delete(ride.matchedDriverId);
  notifyRide(ride);
  return rideToDTO(ride);
}

// ─── Chat (Feature A) ─────────────────────────────────────────────────────────

export function addChatMessage(
  rideId: string,
  fromRole: ChatRole,
  fromId: string,
  text: string,
): ChatMessageDTO {
  const ride = rideStore.get(rideId);
  if (!ride) throw new RideNegotiationError('La solicitud no existe.');
  // Authorise: only the client or the matched driver may chat.
  if (fromRole === 'client' && ride.clientId !== fromId) {
    throw new RideNegotiationError('No autorizado.');
  }
  if (fromRole === 'driver' && ride.matchedDriverId !== fromId) {
    throw new RideNegotiationError('No autorizado.');
  }
  const trimmed = text.trim();
  if (!trimmed) throw new RideNegotiationError('El mensaje está vacío.');

  const msg: ChatMessage = {
    id: `msg-${randomUUID().slice(0, 8)}`,
    rideId,
    fromRole,
    fromId,
    text: trimmed.slice(0, 1000),
    sentAt: new Date(),
  };
  ride.chat.push(msg);

  const dto = chatToDTO(msg);
  for (const cb of chatListeners.get(rideId) ?? []) cb(dto);
  return dto;
}

export function getChatHistory(rideId: string): ChatMessageDTO[] {
  return (rideStore.get(rideId)?.chat ?? []).map(chatToDTO);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function getRideById(rideId: string): RideRequestDTO | null {
  const r = rideStore.get(rideId);
  return r ? rideToDTO(r) : null;
}

export function getRideForDriver(rideId: string, driverId: string): RideRequestDTO | null {
  const r = rideStore.get(rideId);
  return r ? rideToDTO(r, driverId) : null;
}

export function getActiveClientRide(clientId: string): RideRequestDTO | null {
  const id = clientActiveRide.get(clientId);
  if (!id) return null;
  const r = rideStore.get(id);
  if (!r || !ACTIVE_STATUSES.includes(r.status)) return null;
  return rideToDTO(r);
}

export function getActiveDriverRide(driverId: string): RideRequestDTO | null {
  const id = driverActiveRide.get(driverId);
  if (!id) return null;
  const r = rideStore.get(id);
  if (!r || !ACTIVE_STATUSES.includes(r.status)) return null;
  return rideToDTO(r, driverId);
}

/** Open rides a newly-connected driver should see immediately. */
export function getOpenRides(serviceType?: TransportServiceType): RideRequestDTO[] {
  return [...rideStore.values()]
    .filter((r) => r.status === 'open')
    .filter((r) => (serviceType ? r.serviceType === serviceType : true))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => rideToDTO(r));
}

// ─── Subscriptions (used by ws.handler) ─────────────────────────────────────────

export function subscribeRide(rideId: string, cb: RideUpdateCb): () => void {
  if (!rideListeners.has(rideId)) rideListeners.set(rideId, new Set());
  rideListeners.get(rideId)!.add(cb);
  return () => rideListeners.get(rideId)?.delete(cb);
}

export function onNewRideRequest(cb: NewRideCb): () => void {
  newRideListeners.add(cb);
  return () => newRideListeners.delete(cb);
}

export function subscribeChat(rideId: string, cb: ChatCb): () => void {
  if (!chatListeners.has(rideId)) chatListeners.set(rideId, new Set());
  chatListeners.get(rideId)!.add(cb);
  return () => chatListeners.get(rideId)?.delete(cb);
}
