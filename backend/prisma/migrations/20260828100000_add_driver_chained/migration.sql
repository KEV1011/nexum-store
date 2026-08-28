-- Viajes encadenados: el conductor recibe la siguiente solicitud mientras
-- termina la actual, ya cerca del destino. Por defecto activo, como en Uber y
-- DiDi; se puede apagar desde las preferencias de servicio.
ALTER TABLE "drivers" ADD COLUMN "acceptsChained" BOOLEAN NOT NULL DEFAULT true;
