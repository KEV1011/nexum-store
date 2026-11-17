-- Viaje por puestos: dónde recoger a cada pasajero, cómo paga y la nota que
-- le pone el conductor. Todo nullable: las reservas existentes no cambian.
ALTER TABLE "seat_bookings" ADD COLUMN "pickupLat" DOUBLE PRECISION;
ALTER TABLE "seat_bookings" ADD COLUMN "pickupLng" DOUBLE PRECISION;
ALTER TABLE "seat_bookings" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "seat_bookings" ADD COLUMN "passengerRating" INTEGER;
