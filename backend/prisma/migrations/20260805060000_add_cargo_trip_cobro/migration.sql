-- CreateEnum
CREATE TYPE "CargoTripStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CobroStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');

-- AlterTable
ALTER TABLE "freight_manifests" ADD COLUMN     "cargoTripId" TEXT,
ADD COLUMN     "deliveredOn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "cargo_trips" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "originCity" TEXT NOT NULL,
    "originPlace" TEXT,
    "weightKg" INTEGER,
    "isUrban" BOOLEAN NOT NULL DEFAULT false,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "driverName" TEXT,
    "vehiclePlate" TEXT,
    "status" "CargoTripStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cobroId" TEXT,

    CONSTRAINT "cargo_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobro_accounts" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "status" "CobroStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "signedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobro_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cargo_trips_operatorId_createdAt_idx" ON "cargo_trips"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "cargo_trips_cobroId_idx" ON "cargo_trips"("cobroId");

-- CreateIndex
CREATE UNIQUE INDEX "cargo_trips_operatorId_number_key" ON "cargo_trips"("operatorId", "number");

-- CreateIndex
CREATE INDEX "cobro_accounts_operatorId_createdAt_idx" ON "cobro_accounts"("operatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cobro_accounts_operatorId_number_key" ON "cobro_accounts"("operatorId", "number");

-- CreateIndex
CREATE INDEX "freight_manifests_cargoTripId_idx" ON "freight_manifests"("cargoTripId");

-- AddForeignKey
ALTER TABLE "freight_manifests" ADD CONSTRAINT "freight_manifests_cargoTripId_fkey" FOREIGN KEY ("cargoTripId") REFERENCES "cargo_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargo_trips" ADD CONSTRAINT "cargo_trips_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "cobro_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

