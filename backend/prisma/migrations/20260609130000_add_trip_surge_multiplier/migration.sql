-- Surge multiplier recorded at the moment a trip is created.
-- Used for auditing and transparency (conductor/pasajero can see what multiplier was applied).
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "surgeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
