-- Punto de entrega del mandado. Dos columnas nullable: los mandados que ya
-- existen quedan sin punto y se comportan como hasta ahora.
ALTER TABLE "errands" ADD COLUMN "dropoffLat" DOUBLE PRECISION;
ALTER TABLE "errands" ADD COLUMN "dropoffLng" DOUBLE PRECISION;
