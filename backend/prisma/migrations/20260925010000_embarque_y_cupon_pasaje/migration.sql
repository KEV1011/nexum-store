-- Dónde se sube el pasajero, y quién paga el descuento de su pasaje.
--
--  · `pooled_trips.boardingPoints` — los puntos de abordaje con su hora. No
--    son las paradas de `stops` (los municipios por los que pasa el bus):
--    estos están en la ciudad de origen y sirven para subirse.
--  · `seat_bookings.boardingPoint` — el que eligió, COPIADO y no referenciado:
--    si la empresa le cambia la hora mañana, a esta persona le dijeron otra.
--  · `seat_bookings.fareTotal`/`discount`/`promoCode` — la reserva no guardaba
--    NINGÚN importe, así que al subir la tarifa el pasajero veía en «Mis
--    reservas» un precio que nunca aceptó. Ahora se sella al reservar.
--  · `PromoScope.INTERCITY` y `promo_codes.operatorId` — un cupón de pasaje lo
--    emite y lo asume la EMPRESA. El de la plataforma no puede aplicarse
--    mientras el pasaje no se pague por la app: el dinero va directo a la
--    empresa y no hay comisión de la que descontarlo.
--
-- Aditivo y nullable salvo `discount`, que arranca en 0 porque las reservas
-- que ya existen no llevaban ninguno.

-- AlterEnum
ALTER TYPE "PromoScope" ADD VALUE 'INTERCITY';

-- AlterTable
ALTER TABLE "promo_codes" ADD COLUMN     "operatorId" TEXT;

-- AlterTable
ALTER TABLE "pooled_trips" ADD COLUMN     "boardingPoints" JSONB;

-- AlterTable
ALTER TABLE "seat_bookings" ADD COLUMN     "boardingPoint" JSONB,
ADD COLUMN     "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "fareTotal" DOUBLE PRECISION,
ADD COLUMN     "promoCode" TEXT;

