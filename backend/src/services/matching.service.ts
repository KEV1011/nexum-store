import { prisma } from '../lib/prisma';

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
