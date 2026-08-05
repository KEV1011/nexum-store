-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('ANTICIPO', 'ABONO', 'SALDO');

-- AlterTable
ALTER TABLE "cargo_trips" ADD COLUMN     "freightAmount" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "cobro_payments" (
    "id" TEXT NOT NULL,
    "cobroId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'ABONO',
    "method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "receiptUrl" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobro_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cobro_payments_cobroId_paidAt_idx" ON "cobro_payments"("cobroId", "paidAt");

-- AddForeignKey
ALTER TABLE "cobro_payments" ADD CONSTRAINT "cobro_payments_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "cobro_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

