-- Paridad intermunicipal: un conductor ONLINE recibe intermunicipales por
-- defecto (opt-out en Preferencias de servicio), igual que viajes/envíos.
-- AlterTable
ALTER TABLE "drivers" ALTER COLUMN "intercityEnabled" SET DEFAULT true;

-- Backfill: los conductores existentes (default anterior = false, que en la
-- práctica significa "nunca lo activó", no "lo apagó") quedan habilitados.
UPDATE "drivers" SET "intercityEnabled" = true WHERE "intercityEnabled" = false;
