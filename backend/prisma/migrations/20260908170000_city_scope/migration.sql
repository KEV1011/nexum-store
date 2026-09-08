-- La plaza a la que pertenece cada viaje y cada conductor.
--
-- Se guarda en vez de resolverse al consultar porque el panel filtra por ella y
-- porque el criterio (centroide más cercano) puede cambiar: si mañana se
-- corrige la coordenada de un municipio, no debe reescribirse a qué plaza
-- perteneció un viaje del mes pasado.

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "citySlug" TEXT;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "citySlug" TEXT;

-- CreateIndex
CREATE INDEX "drivers_citySlug_idx" ON "drivers"("citySlug");

-- CreateIndex
CREATE INDEX "trips_citySlug_idx" ON "trips"("citySlug");

-- Relleno de lo que ya existe, con EL MISMO criterio que aplica el código:
-- municipio activo con el centroide más cercano, y solo si está a 40 km o
-- menos (el valor por defecto de ZONA_MAX_KM; si alguien lo cambió por
-- variable de entorno, las filas nuevas usarán el suyo y estas el de aquí).
-- Lo que quede lejos de toda plaza se deja en NULL a propósito: es la verdad,
-- y el panel lo cuenta aparte en vez de atribuirlo a una ciudad cualquiera.
UPDATE "trips" t
SET "citySlug" = (
  SELECT m."slug"
  FROM "municipalities" m
  WHERE m."isActive"
    AND 2 * 6371 * asin(sqrt(
      power(sin(radians(m."lat" - t."originLat") / 2), 2)
      + cos(radians(t."originLat")) * cos(radians(m."lat"))
        * power(sin(radians(m."lng" - t."originLng") / 2), 2)
    )) <= 40
  ORDER BY 2 * 6371 * asin(sqrt(
      power(sin(radians(m."lat" - t."originLat") / 2), 2)
      + cos(radians(t."originLat")) * cos(radians(m."lat"))
        * power(sin(radians(m."lng" - t."originLng") / 2), 2)
    )) ASC
  LIMIT 1
);

UPDATE "drivers" d
SET "citySlug" = (
  SELECT m."slug"
  FROM "municipalities" m
  WHERE m."isActive"
    AND 2 * 6371 * asin(sqrt(
      power(sin(radians(m."lat" - d."lastLat") / 2), 2)
      + cos(radians(d."lastLat")) * cos(radians(m."lat"))
        * power(sin(radians(m."lng" - d."lastLng") / 2), 2)
    )) <= 40
  ORDER BY 2 * 6371 * asin(sqrt(
      power(sin(radians(m."lat" - d."lastLat") / 2), 2)
      + cos(radians(d."lastLat")) * cos(radians(m."lat"))
        * power(sin(radians(m."lng" - d."lastLng") / 2), 2)
    )) ASC
  LIMIT 1
)
WHERE d."lastLat" IS NOT NULL AND d."lastLng" IS NOT NULL;
