-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "noShowAt" TIMESTAMP(3),
ADD COLUMN     "noShowDriverId" TEXT,
ADD COLUMN     "noShowReason" TEXT;

-- CreateIndex
CREATE INDEX "trips_noShowDriverId_idx" ON "trips"("noShowDriverId");

