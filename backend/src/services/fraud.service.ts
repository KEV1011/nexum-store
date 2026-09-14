// ── Antifraude básico ─────────────────────────────────────────────────────────
//
// Señales sin terceros: (1) GPS imposible (saltos/velocidad irreal) → marca al
// conductor para revisión; (2) límite de solicitudes por cliente (ventana
// deslizante en memoria) para frenar spam de pedidos/viajes; (3) conteo de
// cancelaciones abusivas. No bloquea de forma agresiva (el GPS tiene ruido): la
// política es MARCAR y contar, y que el admin/gating decidan.

import { prisma } from '../lib/prisma';
import {
  esSaltoImposible,
  segundosEntreLecturas,
  velocidadKmh,
  type Fix,
} from '../lib/salto-gps';

// Los umbrales y la decisión viven en `lib/salto-gps.ts`, sueltos y probados:
// esto acusa a una persona, y el contador acabó en 444 sobre un conductor con
// 16 viajes por medir el tiempo entre ESCRITURAS en vez de entre LECTURAS.

// Última lectura de cada conductor, CON la marca de tiempo del teléfono.
//
// En memoria a propósito: es una señal best-effort y guardarla costaría una
// columna y una escritura por latido. Al reiniciar el servidor se pierde y lo
// único que pasa es que el primer salto de cada conductor no se evalúa, que es
// justo el lado por el que hay que fallar.
const _ultimaLectura = new Map<string, Fix>();

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
  /** Cuándo tomó el TELÉFONO esta lectura. Las apps viejas no lo mandan. */
  tomadoEn: number | null = null,
): void {
  const anteriorEnMemoria = _ultimaLectura.get(driverId);
  _ultimaLectura.set(driverId, { lat: newLat, lng: newLng, tomadoEn });

  if (!prev.lastLat || !prev.lastLng || !prev.lastSeenAt) return;

  const meters = _haversineMeters(prev.lastLat, prev.lastLng, newLat, newLng);

  // El reloj del servidor mide el hueco entre mensajes, no el recorrido. Se
  // queda como respaldo para las apps que aún no mandan la marca de tiempo.
  const segundosDePared = (Date.now() - prev.lastSeenAt.getTime()) / 1000;
  const segundos = segundosEntreLecturas(
    anteriorEnMemoria ?? { lat: prev.lastLat, lng: prev.lastLng, tomadoEn: null },
    { lat: newLat, lng: newLng, tomadoEn },
    Date.now(),
    segundosDePared,
  );

  if (!esSaltoImposible(meters, segundos)) return;

  void prisma.driver
    .update({ where: { id: driverId }, data: { fraudFlags: { increment: 1 } } })
    .catch(() => undefined);
  console.warn(
    `[Fraude] GPS imposible driver=${driverId}: ${Math.round(meters)} m en ` +
      `${segundos!.toFixed(1)} s = ${Math.round(velocidadKmh(meters, segundos!))} km/h ` +
      `(reloj: ${tomadoEn ? 'teléfono' : 'servidor'})`,
  );
}

/** Solo para las pruebas y el apagado: la memoria de lecturas no debe crecer sin fin. */
export function olvidarLecturaDe(driverId: string): void {
  _ultimaLectura.delete(driverId);
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
