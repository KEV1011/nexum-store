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
import { getBusinessService } from '../services/business.service';
import { WsMessage, WorkMode, ErrandStatus } from '../types';

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

const businessSockets = new Map<string, WebSocket>();
const businessSubscriptions = new Map<WebSocket, Array<() => void>>();

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

function handleDriverModeChange(mode: WorkMode): void {
  driverWorkMode = mode;
  setDriverWorkMode(mode);
  sendDriver({ type: 'auth_ok', workMode: mode });
}

function handleAccept(tripId: string): void {
  // Check if this is a real client trip
  const clientTrip = getClientTripRaw(tripId);
  if (clientTrip) {
    const MOCK_DRIVER = {
      name: 'Carlos Méndez',
      phone: '+57 310 456 7890',
      vehicle: 'Toyota Yaris • NEX 123',
    };
    const updated = acceptClientTrip(tripId, MOCK_DRIVER.name, MOCK_DRIVER.phone, MOCK_DRIVER.vehicle);
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

function handleLocationUpdate(lat: number, lng: number, tripId: string | null): void {
  const effectiveTripId = tripId ?? driverActiveTripId;
  if (!effectiveTripId) return;

  const clientId = updateClientTripLocation(effectiveTripId, lat, lng);
  if (!clientId) return;

  const clientWs = clientSockets.get(clientId);
  if (clientWs) sendTo(clientWs, { type: 'driver_location', tripId: effectiveTripId, lat, lng });
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
      handleDriverModeChange(mode as WorkMode);
      break;
    }

    // ── Trip accept / reject ─────────────────────────────────────────────────
    case 'accept': {
      if (ws !== driverSocket) { sendTo(ws, { type: 'error', message: 'Not authenticated' }); return; }
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') { sendTo(ws, { type: 'error', message: 'tripId required' }); return; }
      handleAccept(tripId);
      break;
    }
    case 'reject': {
      if (ws !== driverSocket) { sendTo(ws, { type: 'error', message: 'Not authenticated' }); return; }
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') { sendTo(ws, { type: 'error', message: 'tripId required' }); return; }
      handleReject(tripId);
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
      handleLocationUpdate(lat, lng, typeof tripId === 'string' ? tripId : null);
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

    case 'ping':
      sendTo(ws, { type: 'pong' });
      break;

    default:
      sendTo(ws, { type: 'error', message: `Unknown message type: ${String(msg['type'])}` });
  }
}

// ─── Cleanup on close ─────────────────────────────────────────────────────────

function onClose(ws: WebSocket): void {
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
