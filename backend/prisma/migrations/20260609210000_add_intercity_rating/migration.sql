-- Calificación del pasajero al viaje intermunicipal completado (1-5 estrellas)
ALTER TABLE "intercity_bookings" ADD COLUMN "rating" INTEGER;
ALTER TABLE "intercity_bookings" ADD COLUMN "ratingComment" TEXT;
