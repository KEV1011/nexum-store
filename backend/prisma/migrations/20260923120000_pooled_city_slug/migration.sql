-- Normaliza la ciudad de las salidas programadas al slug del municipio.
--
-- La migración de municipios (20260801200000) pasó estas dos columnas de enum a
-- TEXT en minúscula, pero `intercity-pool.service` siguió escribiéndolas con un
-- mapa de los siete valores viejos y `?? toUpperCase()` de respaldo. Resultado:
-- las salidas anteriores a aquella migración quedaron en 'pamplona' y las
-- posteriores en 'PAMPLONA', y como en PostgreSQL esa comparación es sensible a
-- mayúsculas, la búsqueda del pasajero solo veía la mitad de las salidas.
--
-- El servicio ya escribe el slug. Esto alinea lo que quedó escrito antes.
-- Idempotente: aplicar lower() sobre un slug ya en minúscula no lo cambia.
UPDATE "pooled_trips" SET "origin" = lower("origin") WHERE "origin" <> lower("origin");
UPDATE "pooled_trips" SET "destination" = lower("destination") WHERE "destination" <> lower("destination");
