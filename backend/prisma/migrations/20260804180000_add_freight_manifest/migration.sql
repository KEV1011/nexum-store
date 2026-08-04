-- Remito de salida de mercancía: reemplaza el formato en papel
-- "SALIDA DE MERCANCÍA" con detalle bulto por bulto y conciliación
-- de faltantes en la entrega. Todo aditivo: no toca tablas existentes.

-- CreateEnum
CREATE TYPE "ManifestStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ManifestItemStatus" AS ENUM ('PENDING', 'OK', 'SHORT', 'MISSING', 'DAMAGED');

-- CreateTable
CREATE TABLE "freight_manifests" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "reference" TEXT,
    "warehouse" TEXT,
    "clientName" TEXT NOT NULL,
    "clientAddress" TEXT,
    "clientCity" TEXT,
    "freightId" TEXT,
    "driverId" TEXT,
    "driverName" TEXT,
    "driverIdNumber" TEXT,
    "vehiclePlate" TEXT,
    "unitLabel" TEXT NOT NULL DEFAULT 'bulto',
    "measureLabel" TEXT NOT NULL DEFAULT 'unidades',
    "status" "ManifestStatus" NOT NULL DEFAULT 'DRAFT',
    "totalItems" INTEGER,
    "totalMeasure" DOUBLE PRECISION,
    "authorizedBy" TEXT,
    "notes" TEXT,
    "receivedByName" TEXT,
    "receivedByIdNumber" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receiptPhotoUrl" TEXT,
    "discrepancyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "freight_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_manifest_items" (
    "id" TEXT NOT NULL,
    "manifestId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "measure" DOUBLE PRECISION NOT NULL,
    "code" TEXT,
    "note" TEXT,
    "receivedMeasure" DOUBLE PRECISION,
    "itemStatus" "ManifestItemStatus" NOT NULL DEFAULT 'PENDING',
    "receivedNote" TEXT,
    "photoUrl" TEXT,

    CONSTRAINT "freight_manifest_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "freight_manifests_operatorId_idx" ON "freight_manifests"("operatorId");

-- CreateIndex
CREATE INDEX "freight_manifests_freightId_idx" ON "freight_manifests"("freightId");

-- CreateIndex
CREATE INDEX "freight_manifests_status_idx" ON "freight_manifests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "freight_manifests_operatorId_code_key" ON "freight_manifests"("operatorId", "code");

-- CreateIndex
CREATE INDEX "freight_manifest_items_manifestId_idx" ON "freight_manifest_items"("manifestId");

-- CreateIndex
CREATE UNIQUE INDEX "freight_manifest_items_manifestId_position_key" ON "freight_manifest_items"("manifestId", "position");

-- AddForeignKey
ALTER TABLE "freight_manifest_items" ADD CONSTRAINT "freight_manifest_items_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "freight_manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

