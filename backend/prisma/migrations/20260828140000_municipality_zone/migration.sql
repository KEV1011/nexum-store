-- Zona con la que la marca se presenta en cada municipio.
--
-- No es una división administrativa: es identidad local. En Pamplona la app se
-- presenta como «ZIPA/SANTURBÁN» porque el operador de allí quiere que se note
-- que la plataforma es de su tierra. Null = solo «ZIPA», que es lo que verán
-- todos los demás municipios hasta que se les asigne una.
ALTER TABLE "municipalities" ADD COLUMN "zone" TEXT;

-- Se siembra SOLO Pamplona, que es la que el operador pidió. Santurbán es el
-- páramo que comparten varios municipios vecinos, y sería fácil dárselo también
-- a Mutiscua, Cácota, Silos o Chitagá — pero eso es una decisión de marca que
-- nadie ha tomado, y ponerla aquí sería inventarla. Añadirlos después es un
-- UPDATE de una línea.
UPDATE "municipalities" SET "zone" = 'Santurbán' WHERE "slug" = 'pamplona';
