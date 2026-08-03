-- Trazabilidad del intermunicipal: al pasajero solo se le mostraba "confirmado"
-- y luego "en viaje". Faltaban los dos momentos en que más espera saber algo:
-- que el conductor va en camino y que ya llegó a recogerlo.

-- AlterEnum
ALTER TYPE "IntercityStatus" ADD VALUE 'DRIVER_TO_PICKUP';
ALTER TYPE "IntercityStatus" ADD VALUE 'AT_PICKUP';

-- AlterTable
ALTER TABLE "intercity_bookings" ADD COLUMN     "enRouteAt" TIMESTAMP(3),
ADD COLUMN     "arrivedAt" TIMESTAMP(3);
