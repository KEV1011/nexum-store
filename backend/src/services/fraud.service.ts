// ── Antifraude básico ─────────────────────────────────────────────────────────
//
// Señales sin terceros: (1) GPS imposible (saltos/velocidad irreal) → marca al
// conductor para revisión; (2) límite de solicitudes por cliente (ventana
// deslizante en memoria) para frenar spam de pedidos/viajes; (3) conteo de
// cancelaciones abusivas. No bloquea de forma agresiva (el GPS tiene ruido): la
// política es MARCAR y contar, y que el admin/gating decidan.

import { prisma } from '../lib/prisma';

// Velocidad máxima plausible para un vehículo urbano/carretera (km/h). Por
// encima de esto entre dos fixes reales = GPS falso o teletransporte.
const MAX_SPEED_KMH = Number(process.env['FRAUD_MAX_SPEED_KMH'] ?? 200);
// Distancia mínima para evaluar velocidad (evita ruido de GPS en reposo).
const MIN_MOVE_M = 120;

function _haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Evalúa un nuevo fix GPS contra la ÚLTIMA posición conocida (que el llamador ya
 * leyó, para no reconsultar ni cruzarse con la escritura). Si implica una
 * velocidad imposible, incrementa `fraudFlags`. Fire-and-forget: nunca bloquea
 * el fix (el GPS tiene ruido) — solo marca para revisión.
 */
export function evaluateGeoJump(
  driverId: string,
  prev: { lastLat: number | null; lastLng: number | null; lastSeenAt: Date | null },
  newLat: number,
  newLng: number,
): void {
  if (!prev.lastLat || !prev.lastLng || !prev.lastSeenAt) return;

  const meters = _haversineMeters(prev.lastLat, prev.lastLng, newLat, newLng);
  if (meters < MIN_MOVE_M) return;

  const seconds = (Date.now() - prev.lastSeenAt.getTime()) / 1000;
  if (seconds <= 0) return;

  const kmh = meters / 1000 / (seconds / 3600);
  if (kmh <= MAX_SPEED_KMH) return;

  void prisma.driver
    .update({ where: { id: driverId }, data: { fraudFlags: { increment: 1 } } })
    .catch(() => undefined);
  console.warn(
    `[Fraude] GPS imposible driver=${driverId}: ${Math.round(meters)} m en ${Math.round(seconds)} s = ${Math.round(kmh)} km/h`,
  );
}

// ── Límite de solicitudes por cliente (ventana deslizante en memoria) ─────────

const CLIENT_WINDOW_MS = Number(process.env['FRAUD_CLIENT_WINDOW_MS'] ?? 60_000);
const CLIENT_MAX_REQUESTS = Number(process.env['FRAUD_CLIENT_MAX_REQ'] ?? 8);
const _clientHits = new Map<string, number[]>();

export class RateLimitError extends Error {}

/**
 * Lanza RateLimitError si el cliente supera el máximo de solicitudes de
 * servicio (viaje/mandado/pedido/flete/intercity) en la ventana. En memoria:
 * un redeploy lo resetea — suficiente como freno anti-spam de un solo proceso.
 */
export function assertClientRequestRate(clientId: string): void {
  const now = Date.now();
  const arr = (_clientHits.get(clientId) ?? []).filter((t) => now - t < CLIENT_WINDOW_MS);
  if (arr.length >= CLIENT_MAX_REQUESTS) {
    throw new RateLimitError(
      'Demasiadas solicitudes seguidas. Espera un momento antes de volver a pedir.',
    );
  }
  arr.push(now);
  _clientHits.set(clientId, arr);
}

/** Purga entradas viejas del mapa (evita crecer sin límite). Llamar en un timer. */
export function pruneRateLimits(): void {
  const now = Date.now();
  for (const [k, arr] of _clientHits) {
    const fresh = arr.filter((t) => now - t < CLIENT_WINDOW_MS);
    if (fresh.length === 0) _clientHits.delete(k);
    else _clientHits.set(k, fresh);
  }
}
