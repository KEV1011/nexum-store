-- AlterTable
ALTER TABLE "intercity_bookings" ADD COLUMN     "operatorId" TEXT;

-- CreateIndex
CREATE INDEX "intercity_bookings_operatorId_idx" ON "intercity_bookings"("operatorId");

