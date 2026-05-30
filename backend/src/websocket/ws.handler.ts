import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verifyToken } from '../services/auth.service';
import {
  startDispatch,
  stopDispatch,
  acknowledgeTripResponse,
  resumeDispatch,
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
import { getBusinessService } from '../services/business.service';
import { WsMessage } from '../types';

// ─── State ────────────────────────────────────────────────────────────────────

let driverSocket: WebSocket | null = null;
// clientId → WebSocket (one active connection per client)
const clientSockets = new Map<string, WebSocket>();
// WebSocket → list of unsubscribe functions for order subscriptions
const clientSubscriptions = new Map<WebSocket, Array<() => void>>();
// WebSocket → map of tripId → unsubscribe function
const clientTripSubs = new Map<WebSocket, Map<string, () => void>>();
// Track which client trip the driver is currently serving (for GPS relay)
let driverActiveTripId: string | null = null;
// businessId → WebSocket (one active connection per business portal)
const businessSockets = new Map<string, WebSocket>();
// WebSocket → list of unsubscribe functions for business subscriptions
const businessSubscriptions = new Map<WebSocket, Array<() => void>>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendTo(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function send(payload: Record<string, unknown>): void {
  if (driverSocket) sendTo(driverSocket, payload);
}

// ─── Driver handlers ──────────────────────────────────────────────────────────

function handleDriverAuth(ws: WebSocket, token: string): void {
  try {
    const payload = verifyToken(token);
    driverSocket = ws;
    getTripService().setDriverStatus('online');

    sendTo(ws, { type: 'auth_ok', driverId: payload.driverId });

    startDispatch(
      (trip) => send({ type: 'trip_request', trip }),
      (tripId) => {
        send({ type: 'trip_cancelled', tripId, reason: 'No response within 15 seconds' });
        resumeDispatch();
      },
    );
  } catch {
    sendTo(ws, { type: 'auth_error', message: 'Invalid or expired token' });
    ws.close();
  }
}

function handleAccept(tripId: string): void {
  // Check if this is a client-initiated trip
  const clientTrip = getClientTripRaw(tripId);
  if (clientTrip) {
    // Accept client trip — notify the client via WS
    const MOCK_DRIVER = { name: 'Carlos Méndez', phone: '+57 310 456 7890', vehicle: 'Toyota Yaris • NEX 123' };
    const updated = acceptClientTrip(tripId, MOCK_DRIVER.name, MOCK_DRIVER.phone, MOCK_DRIVER.vehicle);
    if (updated) {
      send({ type: 'trip_accepted', trip: updated });
      driverActiveTripId = tripId;
      // Notify the client
      const clientWs = clientSockets.get(clientTrip.clientId);
      if (clientWs) sendTo(clientWs, { type: 'trip_update', tripId, trip: updated });
    }
    return;
  }

  // Otherwise handle as mock dispatch trip
  const acked = acknowledgeTripResponse(tripId);
  if (!acked) { send({ type: 'error', message: `Trip ${tripId} is no longer available` }); return; }
  try {
    const trip = getTripService().acceptTrip(tripId);
    send({ type: 'trip_accepted', trip });
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : 'Failed to accept trip' });
  }
}

function handleReject(tripId: string): void {
  const acked = acknowledgeTripResponse(tripId);
  if (!acked) { send({ type: 'error', message: `Trip ${tripId} is no longer available` }); return; }
  try {
    getTripService().rejectTrip(tripId);
    send({ type: 'trip_rejected', tripId });
    resumeDispatch();
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : 'Failed to reject trip' });
  }
}

// ─── Client handlers ──────────────────────────────────────────────────────────

function handleClientAuth(ws: WebSocket, token: string): void {
  try {
    const payload = verifyClientToken(token);

    // Replace any old connection for this client
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
  // Send current snapshot immediately
  const snapshot = getClientOrderSnapshot(orderId);
  if (snapshot) sendTo(ws, { type: 'order_update', orderId, ...snapshot });

  // Subscribe to future updates
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

function handleBusinessAuth(ws: WebSocket, token: string): void {
  try {
    const business = getBusinessService().getBusinessByToken(token);

    const old = businessSockets.get(business.id);
    if (old && old !== ws && old.readyState === WebSocket.OPEN) old.close();
    businessSockets.set(business.id, ws);

    sendTo(ws, { type: 'business_auth_ok', businessId: business.id, businessName: business.name });
    console.log(`[WS] Business portal ${business.name} authenticated`);

    // Subscribe to new client orders for this business
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

  // Relay to the client subscribed to this trip
  const clientWs = clientSockets.get(clientId);
  if (clientWs) {
    sendTo(clientWs, { type: 'driver_location', tripId: effectiveTripId, lat, lng });
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
    // ── Driver ──
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
      handleDriverAuth(ws, token);
      break;
    }
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

    // ── Client ──
    case 'client_auth': {
      const token = msg['token'];
      if (typeof token !== 'string' || !token) {
        sendTo(ws, { type: 'client_auth_error', message: 'token field is required' });
        return;
      }
      handleClientAuth(ws, token);
      break;
    }
    case 'subscribe_order': {
      const orderId = msg['orderId'];
      if (typeof orderId !== 'string') { sendTo(ws, { type: 'error', message: 'orderId required' }); return; }
      handleSubscribeOrder(ws, orderId);
      break;
    }
    case 'unsubscribe_order': {
      // For simplicity, unsubscribing is handled on close; could be per-order
      break;
    }
    case 'location_update': {
      if (ws !== driverSocket) { sendTo(ws, { type: 'error', message: 'Not authenticated as driver' }); return; }
      const lat = msg['lat'];
      const lng = msg['lng'];
      const tripId = msg['tripId'];
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        sendTo(ws, { type: 'error', message: 'lat and lng required as numbers' }); return;
      }
      handleLocationUpdate(lat, lng, typeof tripId === 'string' ? tripId : null);
      break;
    }
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

function onClose(ws: WebSocket): void {
  if (ws === driverSocket) {
    stopDispatch();
    driverSocket = null;
    driverActiveTripId = null;
    getTripService().setDriverStatus('offline');
    console.log('[WS] Driver disconnected');
  } else {
    // Cancel all order subscriptions for this client
    const unsubscribers = clientSubscriptions.get(ws) ?? [];
    for (const fn of unsubscribers) fn();
    clientSubscriptions.delete(ws);

    // Cancel all trip subscriptions for this client
    const tripMap = clientTripSubs.get(ws);
    if (tripMap) {
      for (const fn of tripMap.values()) fn();
      clientTripSubs.delete(ws);
    }

    // Remove from clientSockets
    for (const [cid, sock] of clientSockets.entries()) {
      if (sock === ws) { clientSockets.delete(cid); break; }
    }

    // Cancel business order subscriptions
    const bizUnsubs = businessSubscriptions.get(ws);
    if (bizUnsubs) {
      for (const fn of bizUnsubs) fn();
      businessSubscriptions.delete(ws);
    }
    // Remove from businessSockets
    for (const [bid, sock] of businessSockets.entries()) {
      if (sock === ws) { businessSockets.delete(bid); break; }
    }
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
