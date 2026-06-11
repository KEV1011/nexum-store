import { DriverStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { TripRequestDTO } from '../types';
import { sendPushToDriver, sendPushToClient } from './push.service';

// ─────────────────────────────────────────────────────────────────────────────
// Geospatial matching service (PostGIS).
//
// Replaces the old dispatch *simulator*. Responsibilities:
//   • Persist each driver's live position into the PostGIS `geo` column.
//   • Find the nearest available drivers to a trip origin (ST_DWithin/ST_Distance).
//   • Run a one-driver-at-a-time offer cycle with timeout + fallback to the next
//     nearest driver (idempotent: a SEARCHING trip is never offered to two
//     drivers simultaneously).
//
// Prisma has no native PostGIS type, so all geo reads/writes use parameterised
// raw SQL (tagged templates ⇒ no string interpolation ⇒ injection-safe).
// ─────────────────────────────────────────────────────────────────────────────

// ─── Phase 1: driver position writes ─────────────────────────────────────────

/**
 * Persist a driver's latest GPS fix.
 *
 * Writes the PostGIS `geo` point (note: ST_MakePoint takes lng,lat) alongside
 * the plain lastLat/lastLng/lastSeenAt columns used for presence/debugging.
 * Safe to call on every location_update, whether or not the driver is on a trip.
 */
export async function updateDriverGeo(driverId: string, lat: number, lng: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "drivers"
    SET "geo" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        "lastLat" = ${lat},
        "lastLng" = ${lng},
        "lastSeenAt" = now()
    WHERE "id" = ${driverId}`;
}

// ─── Phase 2: geospatial nearest-driver matching ──────────────────────────────

const OFFER_TIMEOUT_MS = 15_000;
const SEARCH_RADIUS_M = 5_000;   // 5 km initial radius
const MAX_CANDIDATES = 5;         // try up to 5 drivers before giving up
const GEO_FRESHNESS_S = 120;      // ignore drivers last seen > 2 min ago

type NearbyDriver = { driverId: string; distanceMeters: number };

interface OfferState {
  tripId: string;
  candidates: NearbyDriver[];
  candidateIndex: number;
  currentDriverId: string;
  timeout: NodeJS.Timeout;
}

// tripId → active offer state (at most one offer per trip at a time)
const activeOffers = new Map<string, OfferState>();

// Injected by ws.handler.ts at startup — keeps this service free of WS internals.
let _sendToDriver: ((driverId: string, msg: Record<string, unknown>) => void) | null = null;
let _notifyTripUpdate: ((tripId: string) => Promise<void>) | null = null;

export function registerSendToDriver(
  fn: (driverId: string, msg: Record<string, unknown>) => void,
): void {
  _sendToDriver = fn;
}

export function registerNotifyTripUpdate(fn: (tripId: string) => Promise<void>): void {
  _notifyTripUpdate = fn;
}

// ─── Geo query ────────────────────────────────────────────────────────────────

async function findNearestAvailableDrivers(
  originLat: number,
  originLng: number,
  radiusMeters: number,
  maxResults: number,
  freshnessSeconds: number,
): Promise<NearbyDriver[]> {
  // All parameters come from internal constants or trusted DB data — no user strings.
  // freshnessSeconds * INTERVAL '1 second' uses PostgreSQL's integer×interval operator.
  const rows = await prisma.$queryRaw<Array<{ driver_id: string; distance_m: number }>>`
    SELECT d."id" AS driver_id,
           ST_Distance(
             d."geo",
             ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326)::geography
           ) AS distance_m
    FROM "drivers" d
    WHERE d."geo" IS NOT NULL
      AND d."status" = 'ONLINE'
      AND d."isVerified" = true
      AND d."lastSeenAt" >= now() - ${freshnessSeconds} * INTERVAL '1 second'
      AND ST_DWithin(
            d."geo",
            ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326)::geography,
            ${radiusMeters}
          )
    ORDER BY distance_m ASC
    LIMIT ${maxResults}`;
  return rows.map((r) => ({ driverId: r.driver_id, distanceMeters: Number(r.distance_m) }));
}

// ─── TripRequestDTO builder ───────────────────────────────────────────────────

async function buildTripRequestDTO(tripId: string): Promise<TripRequestDTO | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { passenger: true },
  });
  if (!trip || !trip.passenger) return null;
  return {
    id: trip.id,
    passenger: {
      id: trip.passenger.id,
      name: trip.passenger.name ?? 'Pasajero',
      rating: 5.0,
    },
    origin: { lat: trip.originLat, lng: trip.originLng, address: trip.originAddress },
    destination: { lat: trip.destLat, lng: trip.destLng, address: trip.destAddress },
    distanceKm: trip.distanceKm ?? 0,
    estimatedMinutes: trip.etaMinutes ?? 0,
    estimatedFare: trip.estimatedFare,
  };
}

// ─── Offer cycle ──────────────────────────────────────────────────────────────

/**
 * Entry point — called from requestClientTrip after the Trip row is created.
 * Fire-and-forget from the caller's perspective.
 */
export async function startMatchingCycle(
  tripId: string,
  originLat: number,
  originLng: number,
): Promise<void> {
  const candidates = await findNearestAvailableDrivers(
    originLat,
    originLng,
    SEARCH_RADIUS_M,
    MAX_CANDIDATES,
    GEO_FRESHNESS_S,
  );
  if (candidates.length === 0) {
    console.log(`[Matching] No drivers available within ${SEARCH_RADIUS_M}m for trip ${tripId}`);
    return;
  }
  await _offerToCandidate(tripId, candidates, 0);
}

async function _offerToCandidate(
  tripId: string,
  candidates: NearbyDriver[],
  index: number,
): Promise<void> {
  if (index >= candidates.length) {
    console.log(`[Matching] All ${candidates.length} candidates exhausted for trip ${tripId}`);
    return;
  }

  const candidate = candidates[index]!;

  // Guard: trip must still be SEARCHING (may have been cancelled in the meantime)
  const current = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { status: true },
  });
  if (!current || current.status !== 'SEARCHING') return;

  const dto = await buildTripRequestDTO(tripId);
  if (!dto) return;

  const timeout = setTimeout(() => {
    void onDriverDeclineOrTimeout(tripId);
  }, OFFER_TIMEOUT_MS);

  activeOffers.set(tripId, {
    tripId,
    candidates,
    candidateIndex: index,
    currentDriverId: candidate.driverId,
    timeout,
  });

  _sendToDriver?.(candidate.driverId, { type: 'trip_request', trip: dto });

  void sendPushToDriver(
    candidate.driverId,
    'Nueva solicitud de viaje',
    `${dto.origin.address} → ${dto.destination.address}`,
    { tripId, type: 'trip_request' },
  );


  console.log(
    `[Matching] Offered trip ${tripId} to driver ${candidate.driverId} ` +
      `(${Math.round(candidate.distanceMeters)}m away, candidate ${index + 1}/${candidates.length})`,
  );
}

/**
 * Called when the current offer driver declines or the 15-second window expires.
 * Advances to the next candidate.  If `driverId` is provided, the state is only
 * advanced when it matches the currently-pending driver (prevents stale timeouts
 * from advancing after an accept has already cleared the offer).
 */
export async function onDriverDeclineOrTimeout(
  tripId: string,
  driverId?: string,
): Promise<void> {
  const state = activeOffers.get(tripId);
  if (!state) return;
  if (driverId && state.currentDriverId !== driverId) return;
  clearTimeout(state.timeout);
  activeOffers.delete(tripId);
  await _offerToCandidate(tripId, state.candidates, state.candidateIndex + 1);
}

/**
 * Called when the offered driver sends `accept { tripId }`.
 *
 * Transactionally verifies the trip is still SEARCHING and flips it to ACCEPTED.
 * Returns `true` on success, `false` if the offer is stale (wrong driver, already
 * accepted by someone else, or cancelled).
 */
export async function onDriverAccept(tripId: string, driverId: string): Promise<boolean> {
  const state = activeOffers.get(tripId);
  if (!state || state.currentDriverId !== driverId) return false;

  clearTimeout(state.timeout);
  activeOffers.delete(tripId);

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.trip.findUnique({
      where: { id: tripId },
      select: { status: true },
    });
    if (!current || current.status !== 'SEARCHING') return null;
    return tx.trip.update({
      where: { id: tripId },
      data: { status: 'ACCEPTED', driverId, acceptedAt: new Date() },
    });
  });

  if (!updated) return false;

  await prisma.driver.update({
    where: { id: driverId },
    data: { status: DriverStatus.ON_TRIP },
  });

  if (_notifyTripUpdate) await _notifyTripUpdate(tripId);

  if (updated.passengerId) {
    const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { name: true } });
    void sendPushToClient(
      updated.passengerId,
      'Conductor asignado',
      `${driver?.name ?? 'Tu conductor'} está en camino. Toca para ver el estado.`,
      { tripId, type: 'trip_accepted' },
    );
  }

  console.log(`[Matching] Driver ${driverId} accepted trip ${tripId}`);
  return true;
}
