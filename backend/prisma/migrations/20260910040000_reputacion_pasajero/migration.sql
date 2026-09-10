-- El pasajero también tiene reputación real.
--
-- El conductor veía «5.0» de TODO pasajero: era una constante escrita en
-- `matching.service` (`rating: 5.0`), no un dato — en la pantalla con la que
-- decide si acepta la carrera. Y la hoja con la que él califica al pasajero al
-- terminar el viaje no mandaba nada a ninguna parte: lanzaba confeti y cerraba.
--
-- `trips.passengerRating` ya existía sin que nadie lo escribiera; aquí se le
-- añade al pasajero el promedio y su contador, con el mismo patrón que el
-- conductor y el negocio: null mientras nadie lo haya calificado.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0;
