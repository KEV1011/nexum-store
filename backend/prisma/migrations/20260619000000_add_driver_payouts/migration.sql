-- Retiros (payouts) del conductor.

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'PAID', 'REJECTED');

-- CreateTable payouts
CREATE TABLE "payouts" (
  "id" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
  "method" TEXT,
  "accountInfo" TEXT,
  "notes" TEXT,
  "reference" TEXT,
  "processedBy" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payouts_driverId_idx" ON "payouts"("driverId");
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

ALTER TABLE "payouts" ADD CONSTRAINT "payouts_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
