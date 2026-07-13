-- CreateEnum
CREATE TYPE "OperatorKind" AS ENUM ('EMPRESA', 'PERSONA');

-- CreateEnum
CREATE TYPE "FreightStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "operators" ADD COLUMN     "kind" "OperatorKind" NOT NULL DEFAULT 'EMPRESA';

-- CreateTable
CREATE TABLE "freight_requests" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT,
    "clientPhone" TEXT,
    "originAddress" TEXT NOT NULL,
    "destAddress" TEXT NOT NULL,
    "originCity" TEXT,
    "destCity" TEXT,
    "cargoDescription" TEXT NOT NULL,
    "weightKg" INTEGER NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "offeredPrice" DOUBLE PRECISION NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "status" "FreightStatus" NOT NULL DEFAULT 'REQUESTED',
    "operatorId" TEXT,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "finalPrice" DOUBLE PRECISION,
    "commission" DOUBLE PRECISION,
    "netEarning" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "freight_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "freight_requests_status_idx" ON "freight_requests"("status");

-- CreateIndex
CREATE INDEX "freight_requests_operatorId_idx" ON "freight_requests"("operatorId");

-- CreateIndex
CREATE INDEX "freight_requests_clientId_idx" ON "freight_requests"("clientId");

