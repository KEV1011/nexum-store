-- DropForeignKey
ALTER TABLE "freight_events" DROP CONSTRAINT "freight_events_freightId_fkey";

-- AlterTable
ALTER TABLE "freight_requests" ADD COLUMN     "cargoTripId" TEXT;

-- AlterTable
ALTER TABLE "freight_events" ADD COLUMN     "cargoTripId" TEXT,
ALTER COLUMN "freightId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "cargo_trips" ADD COLUMN     "destCity" TEXT,
ADD COLUMN     "promisedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "freight_requests_cargoTripId_key" ON "freight_requests"("cargoTripId");

-- CreateIndex
CREATE INDEX "freight_events_cargoTripId_idx" ON "freight_events"("cargoTripId");

-- AddForeignKey
ALTER TABLE "freight_requests" ADD CONSTRAINT "freight_requests_cargoTripId_fkey" FOREIGN KEY ("cargoTripId") REFERENCES "cargo_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_events" ADD CONSTRAINT "freight_events_freightId_fkey" FOREIGN KEY ("freightId") REFERENCES "freight_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_events" ADD CONSTRAINT "freight_events_cargoTripId_fkey" FOREIGN KEY ("cargoTripId") REFERENCES "cargo_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

