-- CreateEnum
CREATE TYPE "OperatorType" AS ENUM ('TAXI', 'INTERCITY', 'MIXED');

-- CreateEnum
CREATE TYPE "OperatorStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OperatorDocType" AS ENUM ('HABILITACION', 'RUT', 'CAMARA_COMERCIO', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "OperatorRole" AS ENUM ('OWNER', 'DISPATCHER', 'VIEWER');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('OWN', 'AFFILIATED');

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "employmentType" "EmploymentType",
ADD COLUMN     "operatorId" TEXT;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "internalCode" TEXT,
ADD COLUMN     "operationCardNo" TEXT,
ADD COLUMN     "operatorId" TEXT;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "operatorId" TEXT;

-- CreateTable
CREATE TABLE "operators" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "tradeName" TEXT,
    "type" "OperatorType" NOT NULL,
    "status" "OperatorStatus" NOT NULL DEFAULT 'PENDING',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "habilitacionNo" TEXT,
    "habilitacionExpiresAt" TIMESTAMP(3),
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "city" TEXT,
    "commissionRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_documents" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "type" "OperatorDocType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_members" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "role" "OperatorRole" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_routes" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "destCity" TEXT NOT NULL,
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_assignments" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fleet_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operators_nit_key" ON "operators"("nit");

-- CreateIndex
CREATE INDEX "operator_documents_operatorId_idx" ON "operator_documents"("operatorId");

-- CreateIndex
CREATE INDEX "operator_documents_status_idx" ON "operator_documents"("status");

-- CreateIndex
CREATE INDEX "operator_members_operatorId_idx" ON "operator_members"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "operator_members_operatorId_phone_key" ON "operator_members"("operatorId", "phone");

-- CreateIndex
CREATE INDEX "operator_routes_operatorId_idx" ON "operator_routes"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "operator_routes_operatorId_originCity_destCity_key" ON "operator_routes"("operatorId", "originCity", "destCity");

-- CreateIndex
CREATE INDEX "fleet_assignments_operatorId_idx" ON "fleet_assignments"("operatorId");

-- CreateIndex
CREATE INDEX "fleet_assignments_driverId_idx" ON "fleet_assignments"("driverId");

-- CreateIndex
CREATE INDEX "fleet_assignments_vehicleId_idx" ON "fleet_assignments"("vehicleId");

-- CreateIndex
CREATE INDEX "drivers_operatorId_idx" ON "drivers"("operatorId");

-- CreateIndex
CREATE INDEX "vehicles_operatorId_idx" ON "vehicles"("operatorId");

-- CreateIndex
CREATE INDEX "trips_operatorId_idx" ON "trips"("operatorId");

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_documents" ADD CONSTRAINT "operator_documents_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_members" ADD CONSTRAINT "operator_members_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_routes" ADD CONSTRAINT "operator_routes_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_assignments" ADD CONSTRAINT "fleet_assignments_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_assignments" ADD CONSTRAINT "fleet_assignments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_assignments" ADD CONSTRAINT "fleet_assignments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

