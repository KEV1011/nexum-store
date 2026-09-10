-- La calificación del conductor deja de ser un adorno.
--
-- `drivers.rating` era `NOT NULL DEFAULT 5.0` y NADIE la escribía nunca: todos
-- los conductores enseñaban el mismo cinco al pasajero que decidía si subirse a
-- su carro. Pasa a NULL-able con su contador, y el promedio se recalcula de los
-- viajes calificados.

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "rating" DROP NOT NULL,
ALTER COLUMN "rating" DROP DEFAULT;

-- El valor que traen todas las filas es el POR DEFECTO de la columna (o el del
-- seed): no salió de ninguna calificación, porque nunca hubo forma de calificar
-- a un conductor. Dejarlo sería seguir enseñando una nota que nadie dio. Sin
-- calificaciones, la app dirá «Nuevo».
UPDATE "drivers" SET "rating" = NULL WHERE "ratingCount" = 0;

-- La tabla `ratings` era código muerto: cero escrituras y cero lecturas en todo
-- el backend (el modelo `Rating` existía en el esquema y nada lo usaba), así que
-- no puede contener filas creadas por la aplicación. Las calificaciones reales
-- viven en `trips.rating` / `trips.ratingComment`, que ya existían.
-- DropForeignKey
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_authorId_fkey";

-- DropForeignKey
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_tripId_fkey";

-- DropTable
DROP TABLE "ratings";
