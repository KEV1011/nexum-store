-- AlterEnum
ALTER TYPE "TripStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "searchFrom" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "trips_status_searchFrom_idx" ON "trips"("status", "searchFrom");

