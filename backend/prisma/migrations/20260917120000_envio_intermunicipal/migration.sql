-- Envío entre ciudades: el comercio sabe dónde está y hasta dónde despacha, y
-- el pedido sabe a qué plaza va.
--
-- El modelo detrás: las empresas intermunicipales de pasajeros ya salen todos
-- los días y ya tienen taquilla en cada terminal. Un comercio puede mandar su
-- mercancía en esos buses y el cliente de la otra ciudad la recibe al día
-- siguiente. Esto es solo el cimiento: las columnas que hacen que la pregunta
-- «¿a qué ciudad va este pedido?» tenga respuesta.

-- AlterTable: el comercio
ALTER TABLE "businesses" ADD COLUMN     "citySlug" TEXT;
ALTER TABLE "businesses" ADD COLUMN     "shipsTo" JSONB;

-- AlterTable: el pedido
ALTER TABLE "orders" ADD COLUMN     "originCitySlug" TEXT;
ALTER TABLE "orders" ADD COLUMN     "destCitySlug" TEXT;
ALTER TABLE "orders" ADD COLUMN     "isIntercity" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN     "intercityFee" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "businesses_citySlug_idx" ON "businesses"("citySlug");
CREATE INDEX "orders_destCitySlug_idx" ON "orders"("destCitySlug");

-- Relleno de la plaza de los comercios ya registrados, con EL MISMO criterio
-- que aplica el código y que usó la migración `city_scope` para viajes y
-- conductores: municipio activo con el centroide más cercano, y solo si está a
-- 40 km o menos. Lo que quede lejos de toda plaza se deja en NULL a propósito:
-- es la verdad, y el sistema entero ya sabe tratar «no se sabe».
UPDATE "businesses" b
SET "citySlug" = (
  SELECT m."slug"
  FROM "municipalities" m
  WHERE m."isActive"
    AND 2 * 6371 * asin(sqrt(
      power(sin(radians(m."lat" - b."lat") / 2), 2)
      + cos(radians(b."lat")) * cos(radians(m."lat"))
        * power(sin(radians(m."lng" - b."lng") / 2), 2)
    )) <= 40
  ORDER BY 2 * 6371 * asin(sqrt(
      power(sin(radians(m."lat" - b."lat") / 2), 2)
      + cos(radians(b."lat")) * cos(radians(m."lat"))
        * power(sin(radians(m."lng" - b."lng") / 2), 2)
    )) ASC
  LIMIT 1
)
WHERE b."lat" IS NOT NULL AND b."lng" IS NOT NULL;

-- Los pedidos que ya existen NO se rellenan, y es deliberado: todos son locales
-- —no había forma de pedir a otra ciudad— así que `isIntercity = false` ya dice
-- la verdad sobre ellos. Inventarles una plaza de origen a partir de dónde está
-- hoy el comercio sería escribir un dato que nadie midió cuando se hizo el
-- pedido.

-- `shipsTo` queda en NULL para todos, que la capa de lectura interpreta como
-- lista vacía: ningún comercio despacha a otra ciudad hasta que su dueño lo
-- declare. Ponerlo al revés habría abierto de golpe el catálogo local a todo el
-- país el día del despliegue.
