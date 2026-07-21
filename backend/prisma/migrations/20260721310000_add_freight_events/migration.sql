-- CreateTable
CREATE TABLE "freight_events" (
    "id" TEXT NOT NULL,
    "freightId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "address" TEXT,
    "amountCop" DOUBLE PRECISION,
    "gallons" DOUBLE PRECISION,
    "odometerKm" DOUBLE PRECISION,
    "note" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freight_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "freight_events_freightId_idx" ON "freight_events"("freightId");

-- CreateIndex
CREATE INDEX "freight_events_driverId_idx" ON "freight_events"("driverId");

-- AddForeignKey
ALTER TABLE "freight_events" ADD CONSTRAINT "freight_events_freightId_fkey" FOREIGN KEY ("freightId") REFERENCES "freight_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

