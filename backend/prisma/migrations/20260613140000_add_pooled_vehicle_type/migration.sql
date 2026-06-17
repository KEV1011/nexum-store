-- Tipo de vehículo para viajes compartidos (carro / camioneta / van / buseta).
-- Permite al pasajero saber en qué viaja y validar la capacidad de puestos.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PooledVehicleType" AS ENUM ('SEDAN', 'SUV', 'VAN', 'MINIBUS');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable
ALTER TABLE "pooled_trips"
  ADD COLUMN IF NOT EXISTS "vehicleType" "PooledVehicleType" NOT NULL DEFAULT 'SEDAN';
