-- AlterTable
ALTER TABLE "pooled_trips" ADD COLUMN     "operatorId" TEXT;

-- CreateIndex
CREATE INDEX "pooled_trips_operatorId_idx" ON "pooled_trips"("operatorId");

