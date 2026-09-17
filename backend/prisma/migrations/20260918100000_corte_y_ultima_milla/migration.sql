-- AlterEnum
-- `BEFORE 'IN_TRANSIT'` para que el orden del enum siga el del flujo real, y
-- `IF NOT EXISTS` para que reaplicar la migración sobre una base que ya la
-- tenga no la tumbe. Igual que la migración de IN_INTERCITY_TRANSIT.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'AT_DESTINATION_HUB' BEFORE 'IN_TRANSIT';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "hubAt" TIMESTAMP(3),
ADD COLUMN     "hubLat" DOUBLE PRECISION,
ADD COLUMN     "hubLng" DOUBLE PRECISION,
ADD COLUMN     "lastMile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promisedAt" TIMESTAMP(3);

