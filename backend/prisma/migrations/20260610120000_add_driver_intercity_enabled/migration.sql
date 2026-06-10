-- Disponibilidad del conductor para viajes intermunicipales
ALTER TABLE "drivers" ADD COLUMN "intercityEnabled" BOOLEAN NOT NULL DEFAULT false;
