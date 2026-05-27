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
import { WsMessage } from '../types';

// ─── State ────────────────────────────────────────────────────────────────────

let driverSocket: WebSocket | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(payload: Record<string, unknown>): void {
  if (driverSocket && driverSocket.readyState === WebSocket.OPEN) {
    driverSocket.send(JSON.stringify(payload));
  }
}

function sendError(message: string): void {
  send({ type: 'error', message });
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handleAuth(ws: WebSocket, token: string): void {
  try {
    const payload = verifyToken(token);
    driverSocket = ws;
    getTripService().setDriverStatus('online');

    ws.send(JSON.stringify({ type: 'auth_ok', driverId: payload.driverId }));

    startDispatch(
      (trip) => {
        send({ type: 'trip_request', trip });
      },
      (tripId) => {
        send({ type: 'trip_cancelled', tripId, reason: 'No response within 15 seconds' });
        scheduleNextAfterTimeout();
      }
    );
  } catch {
    ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid or expired token' }));
    ws.close();
  }
}

function scheduleNextAfterTimeout(): void {
  resumeDispatch();
}

function handleAccept(tripId: string): void {
  const acked = acknowledgeTripResponse(tripId);
  if (!acked) {
    sendError(`Trip ${tripId} is no longer available`);
    return;
  }

  try {
    const trip = getTripService().acceptTrip(tripId);
    send({ type: 'trip_accepted', trip });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to accept trip';
    sendError(msg);
  }
}

function handleReject(tripId: string): void {
  const acked = acknowledgeTripResponse(tripId);
  if (!acked) {
    sendError(`Trip ${tripId} is no longer available`);
    return;
  }

  try {
    getTripService().rejectTrip(tripId);
    send({ type: 'trip_rejected', tripId });
    resumeDispatch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to reject trip';
    sendError(msg);
  }
}

// ─── Connection ───────────────────────────────────────────────────────────────

function onMessage(ws: WebSocket, raw: string): void {
  let msg: WsMessage;
  try {
    msg = JSON.parse(raw) as WsMessage;
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    return;
  }

  switch (msg['type']) {
    case 'auth': {
      const token = msg['token'];
      if (typeof token !== 'string' || !token) {
        ws.send(JSON.stringify({ type: 'auth_error', message: 'token field is required' }));
        return;
      }
      handleAuth(ws, token);
      break;
    }
    case 'accept': {
      if (ws !== driverSocket) { sendError('Not authenticated'); return; }
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') { sendError('tripId is required'); return; }
      handleAccept(tripId);
      break;
    }
    case 'reject': {
      if (ws !== driverSocket) { sendError('Not authenticated'); return; }
      const tripId = msg['tripId'];
      if (typeof tripId !== 'string') { sendError('tripId is required'); return; }
      handleReject(tripId);
      break;
    }
    case 'ping':
      send({ type: 'pong' });
      break;
    default:
      sendError(`Unknown message type: ${String(msg['type'])}`);
  }
}

function onClose(): void {
  if (driverSocket) {
    stopDispatch();
    driverSocket = null;
    getTripService().setDriverStatus('offline');
    console.log('[WS] Driver disconnected');
  }
}

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    console.log('[WS] New connection');

    if (driverSocket && driverSocket.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: 'Another driver session is active' }));
      ws.close();
      return;
    }

    ws.on('message', (data) => onMessage(ws, data.toString()));
    ws.on('close', onClose);
    ws.on('error', (err) => {
      console.error('[WS] Socket error:', err.message);
      onClose();
    });
  });
}
