// ── Rastro GPS histórico ──────────────────────────────────────────────────────
//
// `Driver.lastLat/lastLng` guarda UN punto que cada heartbeat sobreescribe:
// responde "dónde está" pero no "por dónde pasó". Para una empresa de carga eso
// es justo lo que falta cuando el cliente reclama — no hay recorrido que
// mostrar, no se sabe cuántos kilómetros hizo el camión de verdad (el flete
// solo conoce origen y destino) y no se pueden medir tiempos por tramo.
//
// Este servicio graba la traza y la resume. Tres decisiones que acotan el
// volumen sin perder valor probatorio:
//
//  1. Solo se graba con un servicio EN CURSO. Un punto sin dueño no le sirve a
//     nadie y multiplicaría las filas por cada conductor conectado sin viaje.
//     El servicio activo ya lo resuelve safety-alerts con caché de 30 s, así
//     que grabar no cuesta una consulta extra.
//  2. Filtro por distancia, no por tiempo. El heartbeat llega cada 4 s; guardar
//     todo serían ~900 filas por hora y por conductor, casi todas repetidas. Se
//     graba cuando el vehículo SE MOVIÓ (TRACK_MIN_DIST_M).
//  3. Piso de tiempo en parada (TRACK_IDLE_INTERVAL_S). Un camión detenido
//     igual deja un punto cada pocos minutos: "estuvo quieto aquí" es
//     exactamente lo que hay que poder probar en un reclamo por demora.
//
// La purga por retención (TRACK_RETENTION_DAYS) corre en el timer de index.ts.
// Todo es best-effort: un fallo al grabar jamás afecta el fix GPS ni el viaje.

import { prisma } from '../lib/prisma';

// ── Umbrales (env con defaults razonables) ────────────────────────────────────

/** No grabar dos puntos más seguido que esto, aunque el camión vuele. */
const MIN_INTERVAL_S = Number(process.env['TRACK_MIN_INTERVAL_S'] ?? 25);
/** Movimiento mínimo para considerar que hay un punto nuevo que contar. */
const MIN_DIST_M = Number(process.env['TRACK_MIN_DIST_M'] ?? 75);
/** Aunque esté quieto, dejar constancia cada tanto. */
const IDLE_INTERVAL_S = Number(process.env['TRACK_IDLE_INTERVAL_S'] ?? 300);
/** Días de historia que se conservan. */
const RETENTION_DAYS = Number(process.env['TRACK_RETENTION_DAYS'] ?? 90);
/** Distancia bajo la cual se considera que el vehículo estuvo detenido. */
const STOPPED_DIST_M = 100;

export type TrackServiceKind = 'trip' | 'intercity' | 'freight';

// ── Estado en memoria: último punto GRABADO por conductor ─────────────────────

interface LastSaved {
  lat: number;
  lng: number;
  at: number;
  serviceId: string;
}

const _lastSaved = new Map<string, LastSaved>();

export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Decide si este fix merece una fila. Exportada para poder probar la regla sin
 * base de datos: es la que gobierna todo el volumen de la tabla.
 *
 * - Servicio distinto al último grabado ⇒ siempre (primer punto del recorrido).
 * - Antes de MIN_INTERVAL_S ⇒ nunca (antirrebote).
 * - Se movió MIN_DIST_M ⇒ sí.
 * - Quieto pero pasó IDLE_INTERVAL_S ⇒ sí (deja constancia de la parada).
 */
export function shouldRecord(
  prev: LastSaved | undefined,
  serviceId: string,
  lat: number,
  lng: number,
  nowMs: number,
): boolean {
  if (!prev || prev.serviceId !== serviceId) return true;
  const elapsedS = (nowMs - prev.at) / 1000;
  if (elapsedS < MIN_INTERVAL_S) return false;
  const moved = haversineM(prev.lat, prev.lng, lat, lng);
  return moved >= MIN_DIST_M || elapsedS >= IDLE_INTERVAL_S;
}

/**
 * Último punto grabado del servicio. Normalmente sale de memoria, pero si está
 * fría —el proceso se reinició en mitad de un viaje, cosa que pasa en cada
 * despliegue— se hidrata desde la base.
 *
 * Sin esto el punto siguiente al reinicio guardaría `metersFromPrev = null` y
 * ese tramo desaparecería de los kilómetros reales sin que nadie lo notara: el
 * mapa se vería completo y el total saldría corto.
 */
async function _prevPoint(
  driverId: string,
  svc: { kind: TrackServiceKind; id: string },
): Promise<LastSaved | undefined> {
  const mem = _lastSaved.get(driverId);
  if (mem && mem.serviceId === svc.id) return mem;

  const last = await prisma.driverTrackPoint.findFirst({
    where: { serviceKind: svc.kind, serviceId: svc.id },
    orderBy: { at: 'desc' },
    select: { lat: true, lng: true, at: true },
  });
  if (!last) return undefined;

  const hidratado: LastSaved = {
    lat: last.lat, lng: last.lng, at: last.at.getTime(), serviceId: svc.id,
  };
  _lastSaved.set(driverId, hidratado);
  return hidratado;
}

/**
 * Graba un punto del recorrido si corresponde. Se llama desde el heartbeat con
 * el servicio activo YA resuelto (no consulta la BD para averiguarlo).
 * Best-effort: cualquier error se traga.
 */
export async function recordTrackPoint(
  driverId: string,
  lat: number,
  lng: number,
  svc: { kind: TrackServiceKind; id: string; operatorId: string | null },
): Promise<void> {
  try {
    const now = Date.now();
    const prev = await _prevPoint(driverId, svc);
    if (!shouldRecord(prev, svc.id, lat, lng, now)) return;

    // Solo cuenta como distancia recorrida si el punto anterior es del MISMO
    // servicio; si no, es el primer punto y no hay tramo previo que sumar.
    const metersFromPrev =
      prev && prev.serviceId === svc.id ? haversineM(prev.lat, prev.lng, lat, lng) : null;

    await prisma.driverTrackPoint.create({
      data: {
        driverId,
        lat,
        lng,
        serviceKind: svc.kind,
        serviceId: svc.id,
        operatorId: svc.operatorId,
        metersFromPrev,
      },
    });

    _lastSaved.set(driverId, { lat, lng, at: now, serviceId: svc.id });
  } catch (e) {
    console.warn('[Rastro] no se pudo grabar el punto:', (e as Error).message);
  }
}

// ── Consulta y resumen ────────────────────────────────────────────────────────

export interface TrackPointDTO {
  lat: number;
  lng: number;
  at: string;
  metersFromPrev: number | null;
}

export interface TrackSummary {
  points: number;
  /** Kilómetros REALES recorridos (suma de tramos), no la línea recta. */
  distanceKm: number;
  startedAt: string | null;
  endedAt: string | null;
  /** Minutos entre el primer y el último punto. */
  durationMin: number;
  /** Minutos con el vehículo detenido (tramos de menos de 100 m). */
  stoppedMin: number;
  /** Promedio sobre el tiempo en movimiento, no sobre el total. */
  avgKmh: number;
}

export interface ServiceTrack {
  summary: TrackSummary;
  points: TrackPointDTO[];
}

export function summarizeTrack(
  rows: { lat: number; lng: number; at: Date; metersFromPrev: number | null }[],
): TrackSummary {
  const empty: TrackSummary = {
    points: 0, distanceKm: 0, startedAt: null, endedAt: null,
    durationMin: 0, stoppedMin: 0, avgKmh: 0,
  };
  if (rows.length === 0) return empty;

  let meters = 0;
  let stoppedMs = 0;
  let movingMs = 0;

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const cur = rows[i]!;
    const d = cur.metersFromPrev ?? haversineM(prev.lat, prev.lng, cur.lat, cur.lng);
    const dtMs = cur.at.getTime() - prev.at.getTime();
    meters += d;
    if (d < STOPPED_DIST_M) stoppedMs += dtMs;
    else movingMs += dtMs;
  }

  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const totalMs = last.at.getTime() - first.at.getTime();
  const km = meters / 1000;

  return {
    points: rows.length,
    distanceKm: Math.round(km * 100) / 100,
    startedAt: first.at.toISOString(),
    endedAt: last.at.toISOString(),
    durationMin: Math.round(totalMs / 60000),
    stoppedMin: Math.round(stoppedMs / 60000),
    // Promedio en movimiento: incluir las paradas hunde el número y no
    // describe cómo condujo. Sin tiempo en movimiento, 0 (no dividir por cero).
    avgKmh: movingMs > 0 ? Math.round((km / (movingMs / 3600000)) * 10) / 10 : 0,
  };
}

/** Recorrido completo de un servicio, con su resumen. */
export async function getServiceTrack(kind: TrackServiceKind, serviceId: string): Promise<ServiceTrack> {
  const rows = await prisma.driverTrackPoint.findMany({
    where: { serviceKind: kind, serviceId },
    orderBy: { at: 'asc' },
    select: { lat: true, lng: true, at: true, metersFromPrev: true },
  });

  return {
    summary: summarizeTrack(rows),
    points: rows.map((r) => ({
      lat: r.lat,
      lng: r.lng,
      at: r.at.toISOString(),
      metersFromPrev: r.metersFromPrev,
    })),
  };
}

/**
 * Kilómetros reales por servicio, en lote. Lo usa el panel financiero para dar
 * costo por kilómetro sin traerse la traza completa de cada flete.
 */
export async function realKmByService(
  kind: TrackServiceKind,
  serviceIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (serviceIds.length === 0) return out;

  const rows = await prisma.driverTrackPoint.groupBy({
    by: ['serviceId'],
    where: { serviceKind: kind, serviceId: { in: serviceIds } },
    _sum: { metersFromPrev: true },
  });
  for (const r of rows) {
    out.set(r.serviceId, Math.round(((r._sum.metersFromPrev ?? 0) / 1000) * 100) / 100);
  }
  return out;
}

// ── Retención ─────────────────────────────────────────────────────────────────

/** Borra el rastro más viejo que la retención. Se llama desde el timer. */
export async function purgeOldTrackPoints(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await prisma.driverTrackPoint.deleteMany({ where: { at: { lt: cutoff } } });
    if (count > 0) console.log(`[Rastro] purgados ${count} puntos anteriores a ${cutoff.toISOString()}`);
    return count;
  } catch (e) {
    console.warn('[Rastro] purga fallida:', (e as Error).message);
    return 0;
  }
}

/** Limpia el estado en memoria de conductores que ya no reportan. */
export function pruneTrackState(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [driverId, v] of _lastSaved) {
    if (v.at < cutoff) _lastSaved.delete(driverId);
  }
}

/** Solo para pruebas: olvida el último punto grabado. */
export function _resetTrackState(): void {
  _lastSaved.clear();
}
