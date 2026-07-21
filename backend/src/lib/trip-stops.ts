import { TripStopDTO } from '../types';
import { Prisma } from '@prisma/client';

/** Máximo de paradas intermedias por trayecto. */
export const MAX_TRIP_STOPS = 6;

/**
 * Valida y normaliza las paradas que llegan del cliente/portal antes de
 * persistirlas como JSON: nombre obligatorio (recortado, máx. 80 chars),
 * coords opcionales numéricas, orden re-secuenciado 0..n. Lanza Error con
 * mensaje en español si el formato es inválido.
 */
export function sanitizeStops(
  stops: TripStopDTO[] | undefined,
): Prisma.InputJsonValue | undefined {
  if (!stops || stops.length === 0) return undefined;
  if (!Array.isArray(stops)) throw new Error('Las paradas deben ser una lista.');
  if (stops.length > MAX_TRIP_STOPS) {
    throw new Error(`Máximo ${MAX_TRIP_STOPS} paradas por trayecto.`);
  }
  const clean = stops
    .map((s, i) => {
      const name = String(s?.name ?? '').trim().slice(0, 80);
      if (!name) throw new Error('Cada parada necesita un nombre.');
      const lat = typeof s.lat === 'number' && Number.isFinite(s.lat) ? s.lat : undefined;
      const lng = typeof s.lng === 'number' && Number.isFinite(s.lng) ? s.lng : undefined;
      return { name, ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}), order: i };
    });
  return clean;
}

/** Lee las paradas persistidas (JSONB) hacia el DTO, tolerando basura. */
export function stopsFromDb(raw: unknown): TripStopDTO[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: TripStopDTO[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const name = typeof r['name'] === 'string' ? r['name'] : '';
    if (!name) continue;
    out.push({
      name,
      lat: typeof r['lat'] === 'number' ? r['lat'] : undefined,
      lng: typeof r['lng'] === 'number' ? r['lng'] : undefined,
      order: typeof r['order'] === 'number' ? r['order'] : out.length,
    });
  }
  return out.length > 0 ? out.sort((a, b) => a.order - b.order) : undefined;
}
