-- AlterEnum
-- Tres valores en una sola migración: correcto desde PostgreSQL 12, y Render
-- corre 16. `IF NOT EXISTS` porque un reintento tras un fallo volvería a
-- ejecutar esto, y sin él la segunda pasada revienta — ya pasó en este
-- repositorio con otra migración y dejó el despliegue atascado.
--
-- Añadir valores al enum y crear una columna de ese tipo en la MISMA
-- transacción es seguro; lo que PostgreSQL no deja es INSERTAR un valor
-- recién añadido antes de confirmar, y aquí no se inserta ninguno.


ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'VAN';
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'BUSETA';
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'BUS';

-- AlterTable
ALTER TABLE "pooled_trips" ADD COLUMN     "seatRows" INTEGER,
ADD COLUMN     "seatType" "VehicleType";

-- CreateTable
CREATE TABLE "seat_assignments" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "bookingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seat_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seat_assignments_bookingId_idx" ON "seat_assignments"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "seat_assignments_tripId_seatNumber_key" ON "seat_assignments"("tripId", "seatNumber");

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "pooled_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "seat_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

