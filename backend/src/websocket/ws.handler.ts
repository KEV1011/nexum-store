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
} from '../services/client.service';
import { WsMessage } from '../types';

// ─── State ────────────────────────────────────────────────────────────────────

let driverSocket: WebSocket | null = null;
// clientId → WebSocket (one active connection per client)
const clientSockets = new Map<string, WebSocket>();
// WebSocket → list of unsubscribe functions for order subscriptions
const clientSubscriptions = new Map<WebSocket, Array<() => void>>();

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
    getTripService().setDriverStatus('offline');
    console.log('[WS] Driver disconnected');
  } else {
    // Cancel all order subscriptions for this client
    const unsubscribers = clientSubscriptions.get(ws) ?? [];
    for (const fn of unsubscribers) fn();
    clientSubscriptions.delete(ws);

    // Remove from clientSockets
    for (const [cid, sock] of clientSockets.entries()) {
      if (sock === ws) { clientSockets.delete(cid); break; }
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
