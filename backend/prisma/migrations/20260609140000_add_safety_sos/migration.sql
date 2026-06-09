-- Trust & safety: SOS emergency events + trusted contacts.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EmergencyType" AS ENUM ('PANIC', 'SHARE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Trusted contact columns on users and drivers.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trustedContactName" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trustedContactPhone" TEXT;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "trustedContactName" TEXT;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "trustedContactPhone" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "emergency_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "driverId" TEXT,
    "tripId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "type" "EmergencyType" NOT NULL DEFAULT 'PANIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "emergency_events_userId_idx" ON "emergency_events"("userId");
CREATE INDEX IF NOT EXISTS "emergency_events_driverId_idx" ON "emergency_events"("driverId");
CREATE INDEX IF NOT EXISTS "emergency_events_tripId_idx" ON "emergency_events"("tripId");

-- AddForeignKey
ALTER TABLE "emergency_events" ADD CONSTRAINT "emergency_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "emergency_events" ADD CONSTRAINT "emergency_events_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
