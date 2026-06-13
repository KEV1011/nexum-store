import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verifyToken } from '../services/auth.service';
import { getTripService } from '../services/trip.service';
import {
  verifyClientToken,
  subscribeClientOrder,
  getClientOrderSnapshot,
  updateClientTripLocation,
  updateClientTripStatus,
  subscribeClientTrip,
  getClientTripSnapshot,
  getClientTripRaw,
  onNewClientOrderForBusiness,
  notifyClientTripUpdateById,
} from '../services/client.service';
import {
  getClientErrandRaw,
  updateErrandStatus,
  subscribeClientErrand,
  getClientErrandSnapshot,
  driverAcceptErrand,
  driverDeclineErrand,
  registerErrandSendToDriver,
  kickPendingErrandMatching,
} from '../services/errand.service';
import {
  addOrderChatMessage,
  subscribeOrderChat,
  canAccessOrderChat,
  OrderChatError,
} from '../services/order-chat.service';
import {
  subscribeIntercityBooking,
  getIntercityBookingSnapshot,
  registerIntercitySendToDriver,
  driverAcceptIntercity,
  driverRejectIntercity,
} from '../services/intercity.service';
import {
  subscribePooledTrip,
  getPooledTripSnapshot,
} from '../services/intercity-pool.service';
import {
  placeBid,
  withdrawBid,
  acceptBid,
  cancelRide,
  updateRideStatus,
  updateRideDriverLocation,
  addChatMessage,
  getRideById,
  getRideForDriver,
  subscribeRide,
  subscribeChat,
  onNewRideRequest,
  getOpenRides,
  RideNegotiationError,
} from '../services/ride-negotiation.service';
import {
  getDriverProfile,
  isDriverVerified,
  setDriverWorkMode,
} from '../services/driver-profile.service';
import { getBusinessService } from '../services/business.service';
import {
  updateDriverGeo,
  registerSendToDriver,
  registerNotifyTripUpdate,
  onDriverAccept,
  onDriverDeclineOrTimeout,
} from '../services/matching.service';
import {
  WsMessage,
  WorkMode,
  ErrandStatus,
  RideNegotiationStatus,
  ChatRole,
} from '../types';

// ─── State ────────────────────────────────────────────────────────────────────

let driverSocket: WebSocket | null = null;
let driverWorkMode: WorkMode = 'pasajero';
let driverActiveTripId: string | null = null;

const clientSockets = new Map<string, WebSocket>();
const clientSubscriptions = new Map<WebSocket, Array<() => void>>();
const clientTripSubs = new Map<WebSocket, Map<string, () => void>>();
const clientErrandSubs = new Map<WebSocket, Map<string, () => void>>();
const clientIntercitySubs = new Map<WebSocket, Map<string, () => void>>();
// Shared pooled rides — both drivers and clients may subscribe to a trip.
const pooledSubs = new Map<WebSocket, Map<string, () => void>>();

const businessSockets = new Map<string, WebSocket>();
const businessSubscriptions = new Map<WebSocket, Array<() => void>>();

// Per-driver active trip (supports multi-driver matching; driverActiveTripId is the
// legacy singleton fallback kept for backward compatibility).
const driverActiveTripIdMap = new Map<string, string>(); // driverId → tripId
// Per-driver active errand (un mandado a la vez por conductor).
const driverActiveErrandIdMap = new Map<string, string>(); // driverId → errandId

// ─── Ride negotiation (multi-driver pool + bids + chat) ─────────────────────────

interface DriverConn {
  ws: WebSocket;
  driverId: string;
  workMode: WorkMode;
}
// driverId → live connection. Supports many concurrent drivers (Feature C).
const driverConnections = new Map<string, DriverConn>();
const driverIdByWs = new Map<WebSocket, string>();
// Drivers currently opted into the live ride pool, with their unsub fn.
const ridePoolUnsub = new Map<WebSocket, () => void>();
// Ride-specific subscriptions per socket (client + matched driver).
const rideSubs = new Map<WebSocket, Map<string, () => void>>();
const chatSubs = new Map<WebSocket, Map<string, () => void>>();
// Chat de pedidos de domicilio (cliente + repartidor asignado).
const orderChatSubs = new Map<WebSocket, Map<string, () => void>>();
// Identify a client socket by its clientId for direct relays.
const clientIdByWs = new Map<WebSocket, string>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendTo(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function sendDriver(payload: Record<string, unknown>): void {
  if (driverSocket) sendTo(driverSocket, payload);
}

// ─── Driver handlers ──────────────────────────────────────────────────────────

function handleDriverAuth(ws: WebSocket, token: string, workMode: WorkMode): void {
  try {
    const payload = verifyToken(token);
    driverSocket = ws;
    driverWorkMode = workMode;
    driverIdByWs.set(ws, payload.driverId);
    // Register in driverConnections so matching can reach this driver via sendToDriverById.
    driverConnections.set(payload.driverId, { ws, driverId: payload.driverId, workMode });
    void getTripService().setDriverStatus('online', payload.driverId);
    // Persistir el modo de trabajo: el matching de mandados filtra por MANDADO.
    void setDriverWorkMode(payload.driverId, workMode);

    sendTo(ws, { type: 'auth_ok', driverId: payload.driverId, workMode });

    // Trip + errand dispatch are handled by the real geo-matching engines
    // (matching.service.ts / errand.service.ts). Al entrar en modo mandado se
    // reintentan los mandados que quedaron buscando conductor.
    if (workMode === 'mandado') void kickPendingErrandMatching();
  } catch {
    sendTo(ws, { type: 'auth_error', message: 'Invalid or expired token' });
    ws.close();
  }
}

function handleDriverModeChange(ws: WebSocket, mode: WorkMode): void {
  driverWorkMode = mode;
  const driverId = driverIdByWs.get(ws);
  if (driverId) {
    const conn = driverConnections.get(driverId);
    if (conn) conn.workMode = mode;
    void setDriverWorkMode(driverId, mode);
    if (mode === 'mandado') void kickPendingErrandMatching();
  }
  sendTo(ws, { type: 'auth_ok', workMode: mode });
}

async function handleAccept(ws: WebSocket, tripId: string): Promise<void> {
  const driverId = driverIdByWs.get(ws);
  if (!driverId) {
    sendTo(ws, { type: 'error', message: 'Driver not authenticated' });
    return;
  }

  const clientTrip = await getClientTripRaw(tripId);
  if (!clientTrip) {
    sendTo(ws, { type: 'error', message: `Trip ${tripId} not found` });
    return;
  }

  const accepted = await onDriverAccept(tripId, driverId);
  if (!accepted) {
    sendTo(ws, { type: 'error', message: `Trip ${tripId} is no longer available` });
    return;
  }

  // Build trip_accepted response with real driver info.
  let driverName: string | undefined;
  let driverPhone: string | undefined;
  let driverVehicle: string | undefined;
  try {
    const profile = await getDriverProfile(driverId);
    driverName = profile.fullName;
    driverPhone = profile.phone;
    driverVehicle = profile.vehicleDescription;
  } catch { /* no profile yet; proceed without */ }

  const snapshot = await getClientTripSnapshot(tripId);
  if (snapshot) {
    const dto = { ...snapshot, driverName, driverPhone, driverVehicle };
    sendTo(ws, { type: 'trip_accepted', trip: dto });
    driverActiveTripId = tripId;
    if (driverId) driverActiveTripIdMap.set(driverId, tripId);
    // Passenger is notified via the notifyClientTripUpdateById callback registered
    // in setupWebSocket (triggered inside onDriverAccept → _notifyTripUpdate).
  }
}

async function handleReject(ws: WebSocket, tripId: string): Promise<void> {
  const driverId = driverIdByWs.get(ws);

  const clientTrip = await getClientTripRaw(tripId);
  if (!clientTrip) {
    sendTo(ws, { type: 'error', message: `Trip ${tripId} not found` });
    return;
  }

  await onDriverDeclineOrTimeout(tripId, driverId);
  sendTo(ws, { type: 'trip_rejected', tripId });
}

async function handleAcceptErrand(ws: WebSocket, errandId: string): Promise<void> {
  const driverId = driverIdByWs.get(ws);
  if (!driverId) {
    sendTo(ws, { type: 'error', message: 'Driver not authenticated' });
    return;
  }
  const active = driverActiveErrandIdMap.get(driverId);
  if (active && active !== errandId) {
    sendTo(ws, { type: 'error', message: 'Already handling an errand' });
    return;
  }

  const updated = await driverAcceptErrand(driverId, errandId);
  if (!updated) {
    sendTo(ws, { type: 'error', message: `Errand ${errandId} is no longer available` });
    // Limpia el popup de solicitud si seguía visible en la app del conductor.
    sendTo(ws, { type: 'errand_cancelled', errandId, reason: 'El mandado ya no está disponible' });
    return;
  }

  driverActiveErrandIdMap.set(driverId, errandId);
  sendTo(ws, { type: 'errand_accepted', errandId });
  sendTo(ws, { type: 'errand_update', errandId, errand: updated });

  // Aviso directo al cliente (además del push y de los listeners subscribe_errand).
  const raw = await getClientErrandRaw(errandId);
  if (raw) {
    const clientWs = clientSockets.get(raw.clientId);
    if (clientWs) sendTo(clientWs, { type: 'errand_update', errandId, errand: updated });
  }
}

function handleRejectErrand(ws: WebSocket, errandId: string): void {
  const driverId = driverIdByWs.get(ws);
  if (!driverId) {
    sendTo(ws, { type: 'error', message: 'Driver not authenticated' });
    return;
  }
  // El ciclo de matching avanza al siguiente candidato.
  void driverDeclineErrand(driverId, errandId);
  sendTo(ws, { type: 'errand_rejected', errandId });
}

async function handleErrandStatus(
  ws: WebSocket,
  errandId: string,
  status: string,
  actualCost: number | null,
): Promise<void> {
  const driverId = driverIdByWs.get(ws);
  if (!driverId) {
    sendTo(ws, { type: 'error', message: 'Driver not authenticated' });
    return;
  }
  const validStatuses: ErrandStatus[] = ['shopping', 'on_the_way', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status as ErrandStatus)) {
    sendTo(ws, { type: 'error', message: `Invalid errand status: ${status}` });
    return;
  }

  const clientErrand = await getClientErrandRaw(errandId);
  if (!clientErrand) {
    sendTo(ws, { type: 'error', message: `Errand ${errandId} not found` });
    return;
  }
  // Solo el conductor asignado puede avanzar el estado del mandado.
  if (clientErrand.driverId !== driverId) {
    sendTo(ws, { type: 'error', message: 'Not assigned to this errand' });
    return;
  }

  const updated = await updateErrandStatus(
    errandId,
    status as ErrandStatus,
    actualCost ?? undefined,
  );
  if (!updated) {
    sendTo(ws, { type: 'error', message: `Errand ${errandId} not found` });
    return;
  }

  sendTo(ws, { type: 'errand_update', errandId, errand: updated });
  const clientWs = clientSockets.get(clientErrand.clientId);
  if (clientWs) sendTo(clientWs, { type: 'errand_update', errandId, errand: updated });

  const terminal = status === 'delivered' || status === 'cancelled';
  if (terminal) {
    driverActiveErrandIdMap.delete(driverId);
    void getTripService().setDriverStatus('online', driverId);
  }
}

// ─── Client handlers ──────────────────────────────────────────────────────────

function handleClientAuth(ws: WebSocket, token: string): void {
  try {
    const payload = verifyClientToken(token);
    const old = clientSockets.get(payload.clientId);
    if (old && old !== ws && old.readyState === WebSocket.OPEN) old.close();
    clientSockets.set(payload.clientId, ws);
    clientIdByWs.set(ws, payload.clientId);
    sendTo(ws, { type: 'client_auth_ok', clientId: payload.clientId });
    console.log(`[WS] Client ${payload.clientId} authenticated`);
  } catch {
    sendTo(ws, { type: 'client_auth_error', message: 'Invalid or expired client token' });
    ws.close();
  }
}

function handleSubscribeOrder(ws: WebSocket, orderId: string): void {
  const snapshot = getClientOrderSnapshot(orderId);
  if (snapshot) sendTo(ws, { type: 'order_update', orderId, ...snapshot });

  const unsubscribe = subscribeClientOrder(orderId, (_id, summary) => {
    sendTo(ws, { type: 'order_update', orderId, ...summary });
  });
  const existing = clientSubscriptions.get(ws) ?? [];
  clientSubscriptions.set(ws, [...existing, unsubscribe]);
}

function handleSubscribeTrip(ws: WebSocket, tripId: string): void {
  const snapshot = getClientTripSnapshot(tripId);
  if (snapshot) sendTo(ws, { type: 'trip_update', tripId, trip: snapshot });

  const unsubscribe = subscribeClientTrip(tripId, (_id, trip) => {
    sendTo(ws, { type: 'trip_update', tripId, trip });
  });
  const map = clientTripSubs.get(ws) ?? new Map<string, () => void>();
  map.set(tripId, unsubscribe);
  clientTripSubs.set(ws, map);
}

async function handleSubscribeErrand(ws: WebSocket, errandId: string): Promise<void> {
  const snapshot = await getClientErrandSnapshot(errandId);
  if (snapshot) sendTo(ws, { type: 'errand_update', errandId, errand: snapshot });

  const unsubscribe = subscribeClientErrand(errandId, (_id, errand) => {
    sendTo(ws, { type: 'errand_update', errandId, errand });
  });
  const map = clientErrandSubs.get(ws) ?? new Map<string, () => void>();
  map.set(errandId, unsubscribe);
  clientErrandSubs.set(ws, map);
}

async function handleSubscribeIntercity(ws: WebSocket, bookingId: string): Promise<void> {
  const snapshot = await getIntercityBookingSnapshot(bookingId);
  if (snapshot) sendTo(ws, { type: 'intercity_update', bookingId, booking: snapshot });

  const unsubscribe = subscribeIntercityBooking(bookingId, (_id, booking) => {
    sendTo(ws, { type: 'intercity_update', bookingId, booking });
  });
  const map = clientIntercitySubs.get(ws) ?? new Map<string, () => void>();
  map.set(bookingId, unsubscribe);
  clientIntercitySubs.set(ws, map);
}

async function handleSubscribePooled(ws: WebSocket, tripId: string): Promise<void> {
  const snapshot = await getPooledTripSnapshot(tripId);
  if (snapshot) sendTo(ws, { type: 'pooled_update', tripId, trip: snapshot });

  const unsubscribe = subscribePooledTrip(tripId, (_id, trip) => {
    sendTo(ws, { type: 'pooled_update', tripId, trip });
  });
  const map = pooledSubs.get(ws) ?? new Map<string, () => void>();
  map.set(tripId, unsubscribe);
  pooledSubs.set(ws, map);
}

async function handleBusinessAuth(ws: WebSocket, token: string): Promise<void> {
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const old = businessSockets.get(business.id);
    if (old && old !== ws && old.readyState === WebSocket.OPEN) old.close();
    businessSockets.set(business.id, ws);
    sendTo(ws, { type: 'business_auth_ok', businessId: business.id, businessName: business.name });

    const unsubscribe = onNewClientOrderForBusiness(business.id, (order) => {
      sendTo(ws, { type: 'new_order', order });
    });
    const existing = businessSubscriptions.get(ws) ?? [];
    businessSubscriptions.set(ws, [...existing, unsubscribe]);
  } catch {
    sendTo(ws, { type: 'business_auth_error', message: 'Invalid or expired business token' });
    ws.close();
  }
}

// El re-kick de mandados al autenticarse puede no encontrar al conductor (aún
// sin fix de GPS fresco). Reintento al llegar fixes en modo mandado, con
// throttle para no consultar la BD en cada actualización de posición.
let lastErrandKickAt = 0;
const ERRAND_KICK_THROTTLE_MS = 20_000;

function maybeKickErrandMatching(): void {
  const now = Date.now();
  if (now - lastErrandKickAt < ERRAND_KICK_THROTTLE_MS) return;
  lastErrandKickAt = now;
  void kickPendingErrandMatching();
}

async function handleLocationUpdate(ws: WebSocket, lat: number, lng: number, tripId: string | null): Promise<void> {
  // Persist the driver's position into PostGIS first — this powers nearest-driver
  // matching and must happen on every fix, even while the driver is idle/ONLINE
  // (no active trip).
  const driverId = driverIdByWs.get(ws);
  if (driverId) await updateDriverGeo(driverId, lat, lng);

  if (driverId
    && driverConnections.get(driverId)?.workMode === 'mandado'
    && !driverActiveErrandIdMap.has(driverId)) {
    maybeKickErrandMatching();
  }

  // Relay the live position to the passenger of the active trip, if any.
  // Prefer the per-driver map (multi-driver matching), fall back to singleton.
  const perDriverTripId = driverId ? driverActiveTripIdMap.get(driverId) : undefined;
  const effectiveTripId = tripId ?? perDriverTripId ?? driverActiveTripId;
  if (!effectiveTripId) return;

  const clientId = await updateClientTripLocation(effectiveTripId, lat, lng);
  if (!clientId) return;

  const clientWs = clientSockets.get(clientId);
  if (clientWs) sendTo(clientWs, { type: 'driver_location', tripId: effectiveTripId, lat, lng });
}

// ─── Ride negotiation handlers (multi-driver + bids + chat) ─────────────────────

function sendToClient(clientId: string, payload: Record<string, unknown>): void {
  const ws = clientSockets.get(clientId);
  if (ws) sendTo(ws, payload);
}

function sendToDriverById(driverId: string, payload: Record<string, unknown>): void {
  const conn = driverConnections.get(driverId);
  if (conn) sendTo(conn.ws, payload);
}

/** Relay a ride update to the client (full view) and matched driver (own view). */
function relayRideUpdate(rideId: string): void {
  const clientView = getRideById(rideId);
  if (!clientView) return;
  sendToClient(clientView.clientId, { type: 'ride_update', ride: clientView });
  if (clientView.matchedDriverId) {
    const driverView = getRideForDriver(rideId, clientView.matchedDriverId);
    sendToDriverById(clientView.matchedDriverId, { type: 'ride_update', ride: driverView });
  }
}

/** Driver opts into the live ride pool to receive new requests (Feature C). */
async function handleDriverRegister(ws: WebSocket): Promise<void> {
  const driverId = driverIdByWs.get(ws);
  if (!driverId) { sendTo(ws, { type: 'error', message: 'Driver not authenticated' }); return; }

  // Block unverified drivers from receiving rides (Feature D gate).
  if (!await isDriverVerified(driverId)) {
    sendTo(ws, {
      type: 'error',
      message: 'Tu cuenta no está verificada. Sube y aprueba tus documentos para recibir viajes.',
      code: 'driver_unverified',
    });
    return;
  }

  driverConnections.set(driverId, { ws, driverId, workMode: driverWorkMode });

  // Subscribe to new ride requests; fan-out filtered by online presence.
  const unsub = onNewRideRequest((ride) => {
    sendTo(ws, { type: 'ride_request_new', ride: { ...ride, bids: [] } });
  });
  ridePoolUnsub.get(ws)?.();
  ridePoolUnsub.set(ws, unsub);

  // Immediately surface currently-open rides.
  for (const ride of getOpenRides()) {
    sendTo(ws, { type: 'ride_request_new', ride: { ...ride, bids: [] } });
  }
  sendTo(ws, { type: 'driver_register_ok', driverId });
}

async function handleRideBid(ws: WebSocket, rideId: string, fare: number, etaMinutes: number): Promise<void> {
  const driverId = driverIdByWs.get(ws);
  if (!driverId) { sendTo(ws, { type: 'error', message: 'Driver not authenticated' }); return; }
  let profile;
  try {
    profile = await getDriverProfile(driverId);
  } catch {
    sendTo(ws, { type: 'error', message: 'Driver profile not found' });
    return;
  }
  try {
    const bid = placeBid(
      driverId,
      profile.fullName,
      profile.phone,
      profile.rating,
      profile.totalTrips,
      profile.vehicleDescription,
      rideId,
      { fare, etaMinutes },
    );
    sendTo(ws, { type: 'ride_bid_ack', rideId, bid });
    // Push fresh bid list to the client.
    const clientView = getRideById(rideId);
    if (clientView) sendToClient(clientView.clientId, { type: 'ride_update', ride: clientView });
  } catch (err) {
    sendTo(ws, {
      type: 'error',
      message: err instanceof RideNegotiationError ? err.message : 'No se pudo enviar la oferta',
    });
  }
}

function handleRideWithdraw(ws: WebSocket, rideId: string): void {
  const driverId = driverIdByWs.get(ws);
  if (!driverId) return;
  const updated = withdrawBid(driverId, rideId);
  if (updated) sendToClient(updated.clientId, { type: 'ride_update', ride: updated });
}

function handleRideAcceptBid(ws: WebSocket, rideId: string, bidId: string): void {
  const clientId = clientIdByWs.get(ws);
  if (!clientId) { sendTo(ws, { type: 'error', message: 'Client not authenticated' }); return; }
  try {
    const ride = acceptBid(clientId, rideId, bidId);
    relayRideUpdate(rideId);
    // Tell losing drivers their bid was rejected.
    for (const bid of ride.bids) {
      if (bid.status === 'rejected') {
        sendToDriverById(bid.driverId, { type: 'ride_update', ride: { ...ride, bids: [bid] } });
      }
    }
  } catch (err) {
    sendTo(ws, {
      type: 'error',
      message: err instanceof RideNegotiationError ? err.message : 'No se pudo aceptar la oferta',
    });
  }
}

function handleRideStatus(ws: WebSocket, rideId: string, status: RideNegotiationStatus): void {
  const driverId = driverIdByWs.get(ws);
  if (!driverId) return;
  const updated = updateRideStatus(driverId, rideId, status);
  if (updated) relayRideUpdate(rideId);
}

function handleRideCancel(ws: WebSocket, rideId: string): void {
  const clientId = clientIdByWs.get(ws) ?? null;
  const driverId = driverIdByWs.get(ws) ?? null;
  const updated = cancelRide(clientId, driverId, rideId);
  if (updated) relayRideUpdate(rideId);
}

function handleRideLocation(ws: WebSocket, rideId: string, lat: number, lng: number): void {
  const driverId = driverIdByWs.get(ws);
  if (!driverId) return;
  const clientId = updateRideDriverLocation(driverId, rideId, lat, lng);
  if (clientId) sendToClient(clientId, { type: 'ride_location', rideId, lat, lng });
}

function handleSubscribeRide(ws: WebSocket, rideId: string): void {
  // Send current snapshot tailored to role.
  const driverId = driverIdByWs.get(ws);
  const snapshot = driverId ? getRideForDriver(rideId, driverId) : getRideById(rideId);
  if (snapshot) sendTo(ws, { type: 'ride_update', ride: snapshot });

  const unsub = subscribeRide(rideId, () => {
    const view = driverId ? getRideForDriver(rideId, driverId) : getRideById(rideId);
    if (view) sendTo(ws, { type: 'ride_update', ride: view });
  });
  const map = rideSubs.get(ws) ?? new Map<string, () => void>();
  map.get(rideId)?.();
  map.set(rideId, unsub);
  rideSubs.set(ws, map);
}

function handleSubscribeChat(ws: WebSocket, rideId: string): void {
  const unsub = subscribeChat(rideId, (msg) => {
    sendTo(ws, { type: 'chat_message', message: msg });
  });
  const map = chatSubs.get(ws) ?? new Map<string, () => void>();
  map.get(rideId)?.();
  map.set(rideId, unsub);
  chatSubs.set(ws, map);
}

function handleChatSend(ws: WebSocket, rideId: string, text: string): void {
  const clientId = clientIdByWs.get(ws);
  const driverId = driverIdByWs.get(ws);
  const role: ChatRole | null = clientId ? 'client' : driverId ? 'driver' : null;
  const fromId = clientId ?? driverId;
  if (!role || !fromId) { sendTo(ws, { type: 'error', message: 'Not authenticated' }); return; }
  try {
    addChatMessage(rideId, role, fromId, text);
    // Listeners (subscribe_chat) fan the message out to both parties.
  } catch (err) {
    sendTo(ws, {
      type: 'error',
      message: err instanceof RideNegotiationError ? err.message : 'No se pudo enviar el mensaje',
    });
  }
}

// ─── Chat de pedidos de domicilio (cliente ↔ repartidor asignado) ───────────────

async function handleSubscribeOrderChat(ws: WebSocket, orderId: string): Promise<void> {
  const clientId = clientIdByWs.get(ws);
  const driverId = driverIdByWs.get(ws);
  const role: ChatRole | null = clientId ? 'client' : driverId ? 'driver' : null;
  const participantId = clientId ?? driverId;
  if (!role || !participantId) { sendTo(ws, { type: 'error', message: 'Not authenticated' }); return; }
  if (!(await canAccessOrderChat(orderId, role, participantId))) {
    sendTo(ws, { type: 'error', message: 'No autorizado para este chat' });
    return;
  }

  const unsub = subscribeOrderChat(orderId, (msg) => {
    sendTo(ws, { type: 'order_chat_message', message: msg });
  });
  const map = orderChatSubs.get(ws) ?? new Map<string, () => void>();
  map.get(orderId)?.();
  map.set(orderId, unsub);
  orderChatSubs.set(ws, map);
}

async function handleOrderChatSend(ws: WebSocket, orderId: string, text: string): Promise<void> {
  const clientId = clientIdByWs.get(ws);
  const driverId = driverIdByWs.get(ws);
  const role: ChatRole | null = clientId ? 'client' : driverId ? 'driver' : null;
  const fromId = clientId ?? driverId;
  if (!role || !fromId) { sendTo(ws, { type: 'error', message: 'Not authenticated' }); return; }
  try {
    await addOrderChatMessage(orderId, role, fromId, text);
    // Listeners (subscribe_order_chat) fan the message out to both parties.
  } catch (err) {
    sendTo(ws, {
      type: 'error',
      message: err instanceof OrderChatError ? err.message : 'No se pudo enviar el mensaje',
    });
  }
}

// ─── Message dispatcher ───────────────────────────────────────────────────────

function onMessage(ws: WebSocket, raw: string): void {
  let msg: WsMessage;
  try {
    msg = JSON.parse(raw) as WsMessage;
  } catch {
    sendTo(ws, { type: 'error', message: 'Invalid JSON' });
    return;
  }

  switch (msg['type']) {

    // ── Driver auth ──────────────────────────────────────────────────────────
    case 'auth': {
      const token = msg['token'];
      if (typeof token !== 'string' || !token) {
        sendTo(ws, { type: 'auth_error', message: 'token field is required' });
        return;
      }
      const mode = (msg['workMode'] as WorkMode | undefined) ?? 'pasajero';
      handleDriverAuth(ws, token, mode);
      break;
    }

    // ── Driver work mode change ──────────────────────────────────────────────
    case 'driver_mode': {
      if (!driverIdByWs.has(ws)) { sendTo(ws, { type: 'error', message: 'Not authenticated' }); return; }
      const mode = msg['workMode'];
      if (typeof mode !== 'string') { sendTo(ws, { type: 'error', message: 'workMode required' }); return; }
      handleDriverModeChange(ws, mode as WorkMode);
      break;
    }

    // ── Trip accept / reject ─────────────────────────────────────────────────
    case 'accept': {
      if (!driverIdByWs.has(ws)) { sendTo(ws, { type: 'error', message: 'Not authenticated as driver' }); return; }
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') { sendTo(ws, { type: 'error', message: 'tripId required' }); return; }
      void handleAccept(ws, tripId);
      break;
    }
    case 'reject': {
      if (!driverIdByWs.has(ws)) { sendTo(ws, { type: 'error', message: 'Not authenticated as driver' }); return; }
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') { sendTo(ws, { type: 'error', message: 'tripId required' }); return; }
      void handleReject(ws, tripId);
      break;
    }

    // ── Trip status (driver → server → client) ───────────────────────────────
    case 'trip_status': {
      if (ws !== driverSocket) { sendDriver({ type: 'error', message: 'Not authenticated' }); return; }
      const tripId = msg['tripId'];
      const status = msg['status'];
      if (typeof tripId !== 'string' || typeof status !== 'string') {
        sendDriver({ type: 'error', message: 'tripId and status required' }); return;
      }
      void (async () => {
        const updated = await updateClientTripStatus(tripId, status as import('../types').ClientTripStatus);
        if (updated) {
          const raw = await getClientTripRaw(tripId);
          if (raw) {
            const clientWs = clientSockets.get(raw.clientId);
            if (clientWs) sendTo(clientWs, { type: 'trip_update', tripId, trip: updated });
          }
          sendDriver({ type: 'trip_status_ack', tripId, status });
        } else {
          sendDriver({ type: 'error', message: `Trip ${tripId} not found` });
        }
      })();
      break;
    }

    // ── Errand accept / reject ───────────────────────────────────────────────
    case 'accept_errand': {
      if (!driverIdByWs.has(ws)) { sendTo(ws, { type: 'error', message: 'Not authenticated as driver' }); return; }
      const errandId = msg['errandId'];
      if (typeof errandId !== 'string') { sendTo(ws, { type: 'error', message: 'errandId required' }); return; }
      void handleAcceptErrand(ws, errandId);
      break;
    }
    case 'reject_errand': {
      if (!driverIdByWs.has(ws)) { sendTo(ws, { type: 'error', message: 'Not authenticated as driver' }); return; }
      const errandId = msg['errandId'];
      if (typeof errandId !== 'string') { sendTo(ws, { type: 'error', message: 'errandId required' }); return; }
      handleRejectErrand(ws, errandId);
      break;
    }

    // ── Errand status update ─────────────────────────────────────────────────
    case 'errand_status': {
      if (!driverIdByWs.has(ws)) { sendTo(ws, { type: 'error', message: 'Not authenticated as driver' }); return; }
      const errandId = msg['errandId'];
      const status = msg['status'];
      if (typeof errandId !== 'string' || typeof status !== 'string') {
        sendTo(ws, { type: 'error', message: 'errandId and status required' });
        return;
      }
      const actualCost = typeof msg['actualCost'] === 'number' ? msg['actualCost'] : null;
      void handleErrandStatus(ws, errandId, status, actualCost);
      break;
    }

    // ── Client auth ──────────────────────────────────────────────────────────
    case 'client_auth': {
      const token = msg['token'];
      if (typeof token !== 'string' || !token) {
        sendTo(ws, { type: 'client_auth_error', message: 'token field is required' });
        return;
      }
      handleClientAuth(ws, token);
      break;
    }

    // ── Subscriptions ────────────────────────────────────────────────────────
    case 'subscribe_order': {
      const orderId = msg['orderId'];
      if (typeof orderId !== 'string') { sendTo(ws, { type: 'error', message: 'orderId required' }); return; }
      handleSubscribeOrder(ws, orderId);
      break;
    }
    case 'unsubscribe_order':
      break;

    case 'subscribe_trip': {
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') { sendTo(ws, { type: 'error', message: 'tripId required' }); return; }
      handleSubscribeTrip(ws, tripId);
      break;
    }
    case 'unsubscribe_trip': {
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') break;
      const map = clientTripSubs.get(ws);
      if (map) { map.get(tripId)?.(); map.delete(tripId); }
      break;
    }

    case 'subscribe_errand': {
      const errandId = msg['errandId'];
      if (typeof errandId !== 'string') { sendTo(ws, { type: 'error', message: 'errandId required' }); return; }
      void handleSubscribeErrand(ws, errandId);
      break;
    }
    case 'unsubscribe_errand': {
      const errandId = msg['errandId'];
      if (typeof errandId !== 'string') break;
      const map = clientErrandSubs.get(ws);
      if (map) { map.get(errandId)?.(); map.delete(errandId); }
      break;
    }

    case 'subscribe_intercity': {
      const bookingId = msg['bookingId'];
      if (typeof bookingId !== 'string') { sendTo(ws, { type: 'error', message: 'bookingId required' }); return; }
      void handleSubscribeIntercity(ws, bookingId);
      break;
    }
    case 'unsubscribe_intercity': {
      const bookingId = msg['bookingId'];
      if (typeof bookingId !== 'string') break;
      const map = clientIntercitySubs.get(ws);
      if (map) { map.get(bookingId)?.(); map.delete(bookingId); }
      break;
    }

    // ── Intercity: aceptación/rechazo del conductor (matching real) ──────────
    case 'intercity_accept': {
      const driverId = driverIdByWs.get(ws);
      if (!driverId) { sendTo(ws, { type: 'error', message: 'Not authenticated as driver' }); return; }
      const bookingId = msg['bookingId'];
      if (typeof bookingId !== 'string') { sendTo(ws, { type: 'error', message: 'bookingId required' }); return; }
      const counterFare = typeof msg['counterFare'] === 'number' ? msg['counterFare'] : undefined;
      void (async () => {
        const booking = await driverAcceptIntercity(driverId, bookingId, counterFare);
        if (booking) {
          sendTo(ws, { type: 'intercity_accept_ok', bookingId, booking });
        } else {
          sendTo(ws, { type: 'error', message: 'La reserva ya no está disponible' });
        }
      })();
      break;
    }
    case 'intercity_reject': {
      const driverId = driverIdByWs.get(ws);
      if (!driverId) { sendTo(ws, { type: 'error', message: 'Not authenticated as driver' }); return; }
      const bookingId = msg['bookingId'];
      if (typeof bookingId !== 'string') break;
      void driverRejectIntercity(driverId, bookingId);
      break;
    }

    case 'subscribe_pooled': {
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') { sendTo(ws, { type: 'error', message: 'tripId required' }); return; }
      void handleSubscribePooled(ws, tripId);
      break;
    }
    case 'unsubscribe_pooled': {
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') break;
      const map = pooledSubs.get(ws);
      if (map) { map.get(tripId)?.(); map.delete(tripId); }
      break;
    }

    // ── Location ─────────────────────────────────────────────────────────────
    case 'location_update': {
      // Any authenticated driver may report location (multi-driver presence for
      // matching), not just the legacy singleton driverSocket.
      if (!driverIdByWs.has(ws)) { sendTo(ws, { type: 'error', message: 'Not authenticated as driver' }); return; }
      const lat = msg['lat'];
      const lng = msg['lng'];
      const tripId = msg['tripId'];
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        sendTo(ws, { type: 'error', message: 'lat and lng required as numbers' });
        return;
      }
      void handleLocationUpdate(ws, lat, lng, typeof tripId === 'string' ? tripId : null);
      break;
    }

    // ── Business ─────────────────────────────────────────────────────────────
    case 'business_auth': {
      const token = msg['token'];
      if (typeof token !== 'string' || !token) {
        sendTo(ws, { type: 'business_auth_error', message: 'token field is required' });
        return;
      }
      void handleBusinessAuth(ws, token);
      break;
    }

    // ── Ride negotiation: driver pool ────────────────────────────────────────
    case 'driver_register': {
      void handleDriverRegister(ws);
      break;
    }
    case 'ride_bid': {
      const rideId = msg['rideId'];
      const fare = msg['fare'];
      const eta = msg['etaMinutes'];
      if (typeof rideId !== 'string' || typeof fare !== 'number') {
        sendTo(ws, { type: 'error', message: 'rideId and fare required' }); return;
      }
      void handleRideBid(ws, rideId, fare, typeof eta === 'number' ? eta : 0);
      break;
    }
    case 'ride_bid_withdraw': {
      const rideId = msg['rideId'];
      if (typeof rideId !== 'string') break;
      handleRideWithdraw(ws, rideId);
      break;
    }
    case 'ride_accept_bid': {
      const rideId = msg['rideId'];
      const bidId = msg['bidId'];
      if (typeof rideId !== 'string' || typeof bidId !== 'string') {
        sendTo(ws, { type: 'error', message: 'rideId and bidId required' }); return;
      }
      handleRideAcceptBid(ws, rideId, bidId);
      break;
    }
    case 'ride_status': {
      const rideId = msg['rideId'];
      const status = msg['status'];
      if (typeof rideId !== 'string' || typeof status !== 'string') {
        sendTo(ws, { type: 'error', message: 'rideId and status required' }); return;
      }
      handleRideStatus(ws, rideId, status as RideNegotiationStatus);
      break;
    }
    case 'ride_cancel': {
      const rideId = msg['rideId'];
      if (typeof rideId !== 'string') break;
      handleRideCancel(ws, rideId);
      break;
    }
    case 'ride_location': {
      const rideId = msg['rideId'];
      const lat = msg['lat'];
      const lng = msg['lng'];
      if (typeof rideId !== 'string' || typeof lat !== 'number' || typeof lng !== 'number') break;
      handleRideLocation(ws, rideId, lat, lng);
      break;
    }
    case 'subscribe_ride': {
      const rideId = msg['rideId'];
      if (typeof rideId !== 'string') { sendTo(ws, { type: 'error', message: 'rideId required' }); return; }
      handleSubscribeRide(ws, rideId);
      break;
    }
    case 'unsubscribe_ride': {
      const rideId = msg['rideId'];
      if (typeof rideId !== 'string') break;
      const map = rideSubs.get(ws);
      if (map) { map.get(rideId)?.(); map.delete(rideId); }
      break;
    }

    // ── Chat ─────────────────────────────────────────────────────────────────
    case 'subscribe_chat': {
      const rideId = msg['rideId'];
      if (typeof rideId !== 'string') { sendTo(ws, { type: 'error', message: 'rideId required' }); return; }
      handleSubscribeChat(ws, rideId);
      break;
    }
    case 'unsubscribe_chat': {
      const rideId = msg['rideId'];
      if (typeof rideId !== 'string') break;
      const map = chatSubs.get(ws);
      if (map) { map.get(rideId)?.(); map.delete(rideId); }
      break;
    }
    case 'chat_send': {
      const rideId = msg['rideId'];
      const text = msg['text'];
      if (typeof rideId !== 'string' || typeof text !== 'string') {
        sendTo(ws, { type: 'error', message: 'rideId and text required' }); return;
      }
      handleChatSend(ws, rideId, text);
      break;
    }

    // ── Chat de pedidos de domicilio ─────────────────────────────────────────
    case 'subscribe_order_chat': {
      const orderId = msg['orderId'];
      if (typeof orderId !== 'string') { sendTo(ws, { type: 'error', message: 'orderId required' }); return; }
      void handleSubscribeOrderChat(ws, orderId);
      break;
    }
    case 'unsubscribe_order_chat': {
      const orderId = msg['orderId'];
      if (typeof orderId !== 'string') break;
      const map = orderChatSubs.get(ws);
      if (map) { map.get(orderId)?.(); map.delete(orderId); }
      break;
    }
    case 'order_chat_send': {
      const orderId = msg['orderId'];
      const text = msg['text'];
      if (typeof orderId !== 'string' || typeof text !== 'string') {
        sendTo(ws, { type: 'error', message: 'orderId and text required' }); return;
      }
      void handleOrderChatSend(ws, orderId, text);
      break;
    }

    case 'ping':
      sendTo(ws, { type: 'pong' });
      break;

    default:
      sendTo(ws, { type: 'error', message: `Unknown message type: ${String(msg['type'])}` });
  }
}

// ─── Cleanup on close ─────────────────────────────────────────────────────────

function onClose(ws: WebSocket): void {
  // Pooled-ride subscriptions may live on a driver or client socket.
  const pooledMap = pooledSubs.get(ws);
  if (pooledMap) { for (const fn of pooledMap.values()) fn(); pooledSubs.delete(ws); }

  // Ride + chat subscriptions may live on either side.
  const rideMap = rideSubs.get(ws);
  if (rideMap) { for (const fn of rideMap.values()) fn(); rideSubs.delete(ws); }
  const chatMap = chatSubs.get(ws);
  if (chatMap) { for (const fn of chatMap.values()) fn(); chatSubs.delete(ws); }

  // Leave the live ride pool.
  ridePoolUnsub.get(ws)?.();
  ridePoolUnsub.delete(ws);
  const driverId = driverIdByWs.get(ws);
  if (driverId && driverConnections.get(driverId)?.ws === ws) {
    driverConnections.delete(driverId);
    // Presencia real para el matching: un conductor desconectado no debe
    // seguir ONLINE (los mandados/viajes ya no pueden llegarle por WS).
    void getTripService().setDriverStatus('offline', driverId);
  }
  if (driverId) {
    driverActiveTripIdMap.delete(driverId);
    driverActiveErrandIdMap.delete(driverId);
  }
  driverIdByWs.delete(ws);
  clientIdByWs.delete(ws);

  // Chat de pedidos: puede vivir en sockets de cliente o de conductor.
  const orderChatMap = orderChatSubs.get(ws);
  if (orderChatMap) { for (const fn of orderChatMap.values()) fn(); orderChatSubs.delete(ws); }

  if (ws === driverSocket) {
    driverSocket = null;
    driverActiveTripId = null;
    driverWorkMode = 'pasajero';
    console.log('[WS] Driver disconnected');
    return;
  }

  // Cancel all order subs
  const orderUnsubs = clientSubscriptions.get(ws) ?? [];
  for (const fn of orderUnsubs) fn();
  clientSubscriptions.delete(ws);

  // Cancel trip subs
  const tripMap = clientTripSubs.get(ws);
  if (tripMap) { for (const fn of tripMap.values()) fn(); clientTripSubs.delete(ws); }

  // Cancel errand subs
  const errandMap = clientErrandSubs.get(ws);
  if (errandMap) { for (const fn of errandMap.values()) fn(); clientErrandSubs.delete(ws); }

  // Cancel intercity subs
  const intercityMap = clientIntercitySubs.get(ws);
  if (intercityMap) { for (const fn of intercityMap.values()) fn(); clientIntercitySubs.delete(ws); }

  // Remove from clientSockets
  for (const [cid, sock] of clientSockets.entries()) {
    if (sock === ws) { clientSockets.delete(cid); break; }
  }

  // Business cleanup
  const bizUnsubs = businessSubscriptions.get(ws);
  if (bizUnsubs) { for (const fn of bizUnsubs) fn(); businessSubscriptions.delete(ws); }
  for (const [bid, sock] of businessSockets.entries()) {
    if (sock === ws) { businessSockets.delete(bid); break; }
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupWebSocket(wss: WebSocketServer): void {
  // Wire up matching callbacks so the service can reach driver sockets and
  // notify passengers, without importing WebSocket internals directly.
  registerSendToDriver((driverId, msg) => sendToDriverById(driverId, msg));
  registerNotifyTripUpdate(notifyClientTripUpdateById);
  registerIntercitySendToDriver((driverId, msg) => sendToDriverById(driverId, msg));
  registerErrandSendToDriver((driverId, msg) => sendToDriverById(driverId, msg));

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    console.log('[WS] New connection');
    ws.on('message', (data) => onMessage(ws, data.toString()));
    ws.on('close', () => onClose(ws));
    ws.on('error', (err) => { console.error('[WS] Error:', err.message); onClose(ws); });
  });
}
