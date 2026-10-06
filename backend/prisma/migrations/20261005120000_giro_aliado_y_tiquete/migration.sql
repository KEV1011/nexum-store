-- DropForeignKey
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_driverId_fkey";

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "businessId" TEXT,
ADD COLUMN     "operatorId" TEXT,
ALTER COLUMN "driverId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "seat_bookings" ADD COLUMN     "boardedAt" TIMESTAMP(3),
ADD COLUMN     "ticketCode" TEXT;

-- CreateTable
CREATE TABLE "partner_credits" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "operatorId" TEXT,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_credits_businessId_payoutId_idx" ON "partner_credits"("businessId", "payoutId");

-- CreateIndex
CREATE INDEX "partner_credits_operatorId_payoutId_idx" ON "partner_credits"("operatorId", "payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_credits_source_sourceId_key" ON "partner_credits"("source", "sourceId");

-- CreateIndex
CREATE INDEX "payouts_businessId_idx" ON "payouts"("businessId");

-- CreateIndex
CREATE INDEX "payouts_operatorId_idx" ON "payouts"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "seat_bookings_ticketCode_key" ON "seat_bookings"("ticketCode");

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_credits" ADD CONSTRAINT "partner_credits_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_credits" ADD CONSTRAINT "partner_credits_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_credits" ADD CONSTRAINT "partner_credits_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

