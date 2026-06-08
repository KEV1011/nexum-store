import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verifyToken } from '../services/auth.service';
import {
  startDispatch,
  stopDispatch,
  acknowledgeTripResponse,
  acknowledgeErrandResponse,
  resumeDispatch,
  setDriverWorkMode,
} from '../services/dispatch.service';
import { getTripService } from '../services/trip.service';
import {
  verifyClientToken,
  subscribeClientOrder,
  getClientOrderSnapshot,
  acceptClientTrip,
  updateClientTripLocation,
  updateClientTripStatus,
  subscribeClientTrip,
  getClientTripSnapshot,
  getClientTripRaw,
  onNewClientOrderForBusiness,
} from '../services/client.service';
import {
  getClientErrandRaw,
  acceptClientErrand,
  updateErrandStatus,
  subscribeClientErrand,
  getClientErrandSnapshot,
} from '../services/errand.service';
import {
  subscribeIntercityBooking,
  getIntercityBookingSnapshot,
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
} from '../services/driver-profile.service';
import { getBusinessService } from '../services/business.service';
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
let driverActiveErrandId: string | null = null;

const clientSockets = new Map<string, WebSocket>();
const clientSubscriptions = new Map<WebSocket, Array<() => void>>();
const clientTripSubs = new Map<WebSocket, Map<string, () => void>>();
const clientErrandSubs = new Map<WebSocket, Map<string, () => void>>();
const clientIntercitySubs = new Map<WebSocket, Map<string, () => void>>();
// Shared pooled rides — both drivers and clients may subscribe to a trip.
const pooledSubs = new Map<WebSocket, Map<string, () => void>>();

const businessSockets = new Map<string, WebSocket>();
const businessSubscriptions = new Map<WebSocket, Array<() => void>>();

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
    getTripService().setDriverStatus('online');

    sendTo(ws, { type: 'auth_ok', driverId: payload.driverId, workMode });

    startDispatch(
      (trip) => sendDriver({ type: 'trip_request', trip }),
      (id) => {
        if (driverWorkMode === 'mandado') {
          sendDriver({ type: 'errand_cancelled', errandId: id, reason: 'No response within 15 seconds' });
        } else {
          sendDriver({ type: 'trip_cancelled', tripId: id, reason: 'No response within 15 seconds' });
        }
        resumeDispatch();
      },
      workMode,
      (errand) => sendDriver({ type: 'errand_request', errand }),
    );
  } catch {
    sendTo(ws, { type: 'auth_error', message: 'Invalid or expired token' });
    ws.close();
  }
}

function handleDriverModeChange(ws: WebSocket, mode: WorkMode): void {
  driverWorkMode = mode;
  setDriverWorkMode(mode);
  const driverId = driverIdByWs.get(ws);
  if (driverId) {
    const conn = driverConnections.get(driverId);
    if (conn) conn.workMode = mode;
  }
  sendDriver({ type: 'auth_ok', workMode: mode });
}

async function handleAccept(tripId: string): Promise<void> {
  // Check if this is a real client trip
  const clientTrip = await getClientTripRaw(tripId);
  if (clientTrip) {
    const MOCK_DRIVER = {
      name: 'Carlos Méndez',
      phone: '+57 310 456 7890',
      vehicle: 'Toyota Yaris • NEX 123',
    };
    const updated = await acceptClientTrip(tripId, MOCK_DRIVER.name, MOCK_DRIVER.phone, MOCK_DRIVER.vehicle);
    if (updated) {
      sendDriver({ type: 'trip_accepted', trip: updated });
      driverActiveTripId = tripId;
      const clientWs = clientSockets.get(clientTrip.clientId);
      if (clientWs) sendTo(clientWs, { type: 'trip_update', tripId, trip: updated });
    }
    return;
  }

  // Mock dispatch trip
  const acked = acknowledgeTripResponse(tripId);
  if (!acked) {
    sendDriver({ type: 'error', message: `Trip ${tripId} is no longer available` });
    return;
  }
  try {
    const trip = getTripService().acceptTrip(tripId);
    sendDriver({ type: 'trip_accepted', trip });
  } catch (err) {
    sendDriver({
      type: 'error',
      message: err instanceof Error ? err.message : 'Failed to accept trip',
    });
  }
}

function handleReject(tripId: string): void {
  const acked = acknowledgeTripResponse(tripId);
  if (!acked) {
    sendDriver({ type: 'error', message: `Trip ${tripId} is no longer available` });
    return;
  }
  try {
    getTripService().rejectTrip(tripId);
    sendDriver({ type: 'trip_rejected', tripId });
    resumeDispatch();
  } catch (err) {
    sendDriver({
      type: 'error',
      message: err instanceof Error ? err.message : 'Failed to reject trip',
    });
  }
}

function handleAcceptErrand(errandId: string): void {
  if (driverActiveErrandId && driverActiveErrandId !== errandId) {
    sendDriver({ type: 'error', message: 'Already handling an errand' });
    return;
  }

  // Real client errand
  const clientErrand = getClientErrandRaw(errandId);
  if (clientErrand) {
    const updated = acceptClientErrand(errandId, 'Carlos Méndez', '+57 310 456 7890');
    if (updated) {
      sendDriver({ type: 'errand_update', errandId, errand: updated });
      driverActiveErrandId = errandId;

      const clientWs = clientSockets.get(clientErrand.clientId);
      if (clientWs) sendTo(clientWs, { type: 'errand_update', errandId, errand: updated });
    }
    return;
  }

  // Mock dispatch errand
  const acked = acknowledgeErrandResponse(errandId);
  if (!acked) {
    sendDriver({ type: 'error', message: `Errand ${errandId} is no longer available` });
    return;
  }
  driverActiveErrandId = errandId;
  sendDriver({ type: 'errand_accepted', errandId });
}

function handleRejectErrand(errandId: string): void {
  const acked = acknowledgeErrandResponse(errandId);
  if (!acked) {
    sendDriver({ type: 'error', message: `Errand ${errandId} is no longer available` });
    return;
  }
  sendDriver({ type: 'errand_rejected', errandId });
  resumeDispatch();
}

function handleErrandStatus(
  errandId: string,
  status: string,
  actualCost: number | null,
): void {
  const validStatuses: ErrandStatus[] = ['shopping', 'on_the_way', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status as ErrandStatus)) {
    sendDriver({ type: 'error', message: `Invalid errand status: ${status}` });
    return;
  }

  const terminal = status === 'delivered' || status === 'cancelled';

  // Update real client errand
  const clientErrand = getClientErrandRaw(errandId);
  if (clientErrand) {
    const updated = updateErrandStatus(
      errandId,
      status as ErrandStatus,
      actualCost ?? undefined,
    );
    if (updated) {
      sendDriver({ type: 'errand_update', errandId, errand: updated });
      const clientWs = clientSockets.get(clientErrand.clientId);
      if (clientWs) sendTo(clientWs, { type: 'errand_update', errandId, errand: updated });

      if (terminal) {
        driverActiveErrandId = null;
        getTripService().setDriverStatus('online');
        resumeDispatch();
      }
    }
    return;
  }

  // Mock errand — echo back to driver
  sendDriver({ type: 'errand_status_ack', errandId, status });
  if (terminal) {
    driverActiveErrandId = null;
    resumeDispatch();
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

function handleSubscribeErrand(ws: WebSocket, errandId: string): void {
  const snapshot = getClientErrandSnapshot(errandId);
  if (snapshot) sendTo(ws, { type: 'errand_update', errandId, errand: snapshot });

  const unsubscribe = subscribeClientErrand(errandId, (_id, errand) => {
    sendTo(ws, { type: 'errand_update', errandId, errand });
  });
  const map = clientErrandSubs.get(ws) ?? new Map<string, () => void>();
  map.set(errandId, unsubscribe);
  clientErrandSubs.set(ws, map);
}

function handleSubscribeIntercity(ws: WebSocket, bookingId: string): void {
  const snapshot = getIntercityBookingSnapshot(bookingId);
  if (snapshot) sendTo(ws, { type: 'intercity_update', bookingId, booking: snapshot });

  const unsubscribe = subscribeIntercityBooking(bookingId, (_id, booking) => {
    sendTo(ws, { type: 'intercity_update', bookingId, booking });
  });
  const map = clientIntercitySubs.get(ws) ?? new Map<string, () => void>();
  map.set(bookingId, unsubscribe);
  clientIntercitySubs.set(ws, map);
}

function handleSubscribePooled(ws: WebSocket, tripId: string): void {
  const snapshot = getPooledTripSnapshot(tripId);
  if (snapshot) sendTo(ws, { type: 'pooled_update', tripId, trip: snapshot });

  const unsubscribe = subscribePooledTrip(tripId, (_id, trip) => {
    sendTo(ws, { type: 'pooled_update', tripId, trip });
  });
  const map = pooledSubs.get(ws) ?? new Map<string, () => void>();
  map.set(tripId, unsubscribe);
  pooledSubs.set(ws, map);
}

function handleBusinessAuth(ws: WebSocket, token: string): void {
  try {
    const business = getBusinessService().getBusinessByToken(token);
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

async function handleLocationUpdate(lat: number, lng: number, tripId: string | null): Promise<void> {
  const effectiveTripId = tripId ?? driverActiveTripId;
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
function handleDriverRegister(ws: WebSocket): void {
  const driverId = driverIdByWs.get(ws);
  if (!driverId) { sendTo(ws, { type: 'error', message: 'Driver not authenticated' }); return; }

  // Block unverified drivers from receiving rides (Feature D gate).
  if (!isDriverVerified(driverId)) {
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

function handleRideBid(ws: WebSocket, rideId: string, fare: number, etaMinutes: number): void {
  const driverId = driverIdByWs.get(ws);
  if (!driverId) { sendTo(ws, { type: 'error', message: 'Driver not authenticated' }); return; }
  const profile = getDriverProfile(driverId);
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
      if (driverSocket && driverSocket.readyState === WebSocket.OPEN && driverSocket !== ws) {
        sendTo(ws, { type: 'auth_error', message: 'Another driver session is active' });
        ws.close();
        return;
      }
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
      if (ws !== driverSocket) { sendTo(ws, { type: 'error', message: 'Not authenticated' }); return; }
      const mode = msg['workMode'];
      if (typeof mode !== 'string') { sendTo(ws, { type: 'error', message: 'workMode required' }); return; }
      handleDriverModeChange(ws, mode as WorkMode);
      break;
    }

    // ── Trip accept / reject ─────────────────────────────────────────────────
    case 'accept': {
      if (ws !== driverSocket) { sendTo(ws, { type: 'error', message: 'Not authenticated' }); return; }
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') { sendTo(ws, { type: 'error', message: 'tripId required' }); return; }
      void handleAccept(tripId);
      break;
    }
    case 'reject': {
      if (ws !== driverSocket) { sendTo(ws, { type: 'error', message: 'Not authenticated' }); return; }
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') { sendTo(ws, { type: 'error', message: 'tripId required' }); return; }
      handleReject(tripId);
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
      if (ws !== driverSocket) { sendTo(ws, { type: 'error', message: 'Not authenticated' }); return; }
      const errandId = msg['errandId'];
      if (typeof errandId !== 'string') { sendTo(ws, { type: 'error', message: 'errandId required' }); return; }
      handleAcceptErrand(errandId);
      break;
    }
    case 'reject_errand': {
      if (ws !== driverSocket) { sendTo(ws, { type: 'error', message: 'Not authenticated' }); return; }
      const errandId = msg['errandId'];
      if (typeof errandId !== 'string') { sendTo(ws, { type: 'error', message: 'errandId required' }); return; }
      handleRejectErrand(errandId);
      break;
    }

    // ── Errand status update ─────────────────────────────────────────────────
    case 'errand_status': {
      if (ws !== driverSocket) { sendTo(ws, { type: 'error', message: 'Not authenticated' }); return; }
      const errandId = msg['errandId'];
      const status = msg['status'];
      if (typeof errandId !== 'string' || typeof status !== 'string') {
        sendTo(ws, { type: 'error', message: 'errandId and status required' });
        return;
      }
      const actualCost = typeof msg['actualCost'] === 'number' ? msg['actualCost'] : null;
      handleErrandStatus(errandId, status, actualCost);
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
      handleSubscribeErrand(ws, errandId);
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
      handleSubscribeIntercity(ws, bookingId);
      break;
    }
    case 'unsubscribe_intercity': {
      const bookingId = msg['bookingId'];
      if (typeof bookingId !== 'string') break;
      const map = clientIntercitySubs.get(ws);
      if (map) { map.get(bookingId)?.(); map.delete(bookingId); }
      break;
    }

    case 'subscribe_pooled': {
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') { sendTo(ws, { type: 'error', message: 'tripId required' }); return; }
      handleSubscribePooled(ws, tripId);
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
      if (ws !== driverSocket) { sendTo(ws, { type: 'error', message: 'Not authenticated as driver' }); return; }
      const lat = msg['lat'];
      const lng = msg['lng'];
      const tripId = msg['tripId'];
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        sendTo(ws, { type: 'error', message: 'lat and lng required as numbers' });
        return;
      }
      void handleLocationUpdate(lat, lng, typeof tripId === 'string' ? tripId : null);
      break;
    }

    // ── Business ─────────────────────────────────────────────────────────────
    case 'business_auth': {
      const token = msg['token'];
      if (typeof token !== 'string' || !token) {
        sendTo(ws, { type: 'business_auth_error', message: 'token field is required' });
        return;
      }
      handleBusinessAuth(ws, token);
      break;
    }

    // ── Ride negotiation: driver pool ────────────────────────────────────────
    case 'driver_register': {
      handleDriverRegister(ws);
      break;
    }
    case 'ride_bid': {
      const rideId = msg['rideId'];
      const fare = msg['fare'];
      const eta = msg['etaMinutes'];
      if (typeof rideId !== 'string' || typeof fare !== 'number') {
        sendTo(ws, { type: 'error', message: 'rideId and fare required' }); return;
      }
      handleRideBid(ws, rideId, fare, typeof eta === 'number' ? eta : 0);
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
  }
  driverIdByWs.delete(ws);
  clientIdByWs.delete(ws);

  if (ws === driverSocket) {
    stopDispatch();
    driverSocket = null;
    driverActiveTripId = null;
    driverActiveErrandId = null;
    driverWorkMode = 'pasajero';
    getTripService().setDriverStatus('offline');
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
  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    console.log('[WS] New connection');
    ws.on('message', (data) => onMessage(ws, data.toString()));
    ws.on('close', () => onClose(ws));
    ws.on('error', (err) => { console.error('[WS] Error:', err.message); onClose(ws); });
  });
}
