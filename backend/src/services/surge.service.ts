import { prisma } from '../lib/prisma';
import {
  FARE_BASE, FARE_PER_KM, FARE_PER_MIN, FARE_MINIMUM,
  SURGE_MAX, SURGE_RADIUS_M, SURGE_WINDOW_MIN,
} from '../config/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Surge (dynamic pricing) service.
//
// Computes a demand/supply ratio for a geographic point and maps it to a
// multiplier that is applied to the *suggested* fare shown to the passenger.
// Drivers who bid in free-negotiation mode are unaffected — they can accept,
// counter, or ignore regardless of the multiplier.
//
// All geo queries use PostGIS on the existing `drivers.geo` column (indexed)
// and inline ST_MakePoint for trips (no index, but the count is small and
// the SEARCHING window is bounded to SURGE_WINDOW_MIN).
// ─────────────────────────────────────────────────────────────────────────────

export interface SurgeResult {
  multiplier: number;   // 1.0 – SURGE_MAX, rounded to 1 decimal
  demand: number;       // SEARCHING trips in radius/window
  supply: number;       // ONLINE drivers in radius
  isSurge: boolean;     // multiplier > 1.0
}

export interface FareEstimateResult {
  baseFare: number;
  suggestedFare: number;  // baseFare * surgeMultiplier, rounded to COP
  surgeMultiplier: number;
  isSurge: boolean;
  demand: number;
  supply: number;
}

// ─── Core surge computation ───────────────────────────────────────────────────

export async function getSurgeMultiplier(lat: number, lng: number): Promise<SurgeResult> {
  // demand = SEARCHING trips whose origin is within SURGE_RADIUS_M in the last
  // SURGE_WINDOW_MIN minutes.  Trips lack a PostGIS column so we build the
  // geography inline from the stored originLng/originLat floats.
  const demandRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM "trips" t
    WHERE t."status" = 'SEARCHING'
      AND t."createdAt" >= now() - ${SURGE_WINDOW_MIN} * INTERVAL '1 minute'
      AND ST_DWithin(
            ST_SetSRID(ST_MakePoint(t."originLng", t."originLat"), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${SURGE_RADIUS_M}
          )`;
  const demand = Number(demandRows[0]?.count ?? 0n);

  // supply = ONLINE drivers within SURGE_RADIUS_M (uses the indexed `geo` column).
  const supplyRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM "drivers" d
    WHERE d."status" = 'ONLINE'
      AND d."geo" IS NOT NULL
      AND ST_DWithin(
            d."geo",
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${SURGE_RADIUS_M}
          )`;
  const supply = Number(supplyRows[0]?.count ?? 0n);

  // Map ratio → multiplier in discrete steps, capped at SURGE_MAX.
  const ratio = demand / Math.max(supply, 1);
  let raw: number;
  if (ratio <= 1)      raw = 1.0;
  else if (ratio <= 2) raw = 1.2;
  else if (ratio <= 3) raw = 1.5;
  else                 raw = 1.5 + (ratio - 3) * 0.25; // 0.25 per extra unit above 3

  // Round to 1 decimal, clamp between 1.0 and SURGE_MAX.
  const multiplier = Math.round(Math.max(1.0, Math.min(SURGE_MAX, raw)) * 10) / 10;

  return { multiplier, demand, supply, isSurge: multiplier > 1.0 };
}

// ─── Fare estimate (surge-adjusted) ──────────────────────────────────────────

/**
 * Compute the surge-adjusted fare for a specific distance/time at a given
 * origin point.  Returns both the raw base fare and the suggested fare so the
 * client can show the breakdown transparently.
 */
export async function getFareEstimate(
  lat: number,
  lng: number,
  distanceKm: number,
  etaMinutes: number,
): Promise<FareEstimateResult> {
  const surge = await getSurgeMultiplier(lat, lng);
  const baseFare = Math.round(
    Math.max(FARE_BASE + distanceKm * FARE_PER_KM + etaMinutes * FARE_PER_MIN, FARE_MINIMUM),
  );
  const suggestedFare = Math.round(baseFare * surge.multiplier);
  return {
    baseFare,
    suggestedFare,
    surgeMultiplier: surge.multiplier,
    isSurge: surge.isSurge,
    demand: surge.demand,
    supply: surge.supply,
  };
}
