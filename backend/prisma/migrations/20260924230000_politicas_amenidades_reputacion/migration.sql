-- Lo que el pasajero pregunta antes de comprar un pasaje de bus.
--
-- Tres cosas que la referencia de redBus/Copetran tiene y aquí faltaban:
--
--  · `pooled_trips.amenities` — qué trae el vehículo (aire, USB, wifi…). Va en
--    la salida y no en la empresa porque dentro de la misma flota un bus tiene
--    aire y la buseta vieja no. El baño NO se guarda: se deriva del plano de
--    sillas, para que el chip no prometa lo que el dibujo no tiene.
--  · `operators.policies` — equipaje, mascotas, menores y cancelación. NULL
--    significa «no las ha publicado» y la app lo dice: un valor por defecto
--    sería una condición reclamable que la empresa nunca fijó.
--  · `operators.rating`/`ratingCount` + `seat_bookings.rating` — la nota de la
--    empresa, promediada de las filas calificadas. `rating` nace NULL a
--    propósito: un 5,0 de fábrica ya se pagó dos veces, en `businesses` y en
--    `drivers`, y hubo que borrarlo con un UPDATE.
--
-- Todo aditivo y nullable: las salidas y empresas que ya existen siguen
-- funcionando igual, sin comodidades, sin políticas y sin nota.

-- AlterTable
ALTER TABLE "pooled_trips" ADD COLUMN     "amenities" JSONB;

-- AlterTable
ALTER TABLE "seat_bookings" ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "ratingComment" TEXT;

-- AlterTable
ALTER TABLE "operators" ADD COLUMN     "policies" JSONB,
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0;

