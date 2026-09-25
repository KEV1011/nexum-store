-- El puesto de taxi urbano sobre el motor de salidas que ya existe.
--
-- Todo aditivo y con default: las salidas intermunicipales ya publicadas
-- quedan como estaban (kind = INTERCITY) y ninguna consulta viva cambia de
-- resultado por esta migración.
--
-- Los extremos de una ruta urbana son dos PUNTOS de la misma ciudad, no dos
-- municipios: por eso las etiquetas y las coordenadas. `soloFareRef` guarda la
-- carrera sola con la que se calculó el tope del puesto, sellada, para poder
-- auditar el precio después. Ver `src/lib/puesto-urbano.ts`.

-- CreateEnum
CREATE TYPE "PooledKind" AS ENUM ('INTERCITY', 'URBANO');

-- AlterTable
ALTER TABLE "pooled_trips" ADD COLUMN     "destLabel" TEXT,
ADD COLUMN     "destLat" DOUBLE PRECISION,
ADD COLUMN     "destLng" DOUBLE PRECISION,
ADD COLUMN     "kind" "PooledKind" NOT NULL DEFAULT 'INTERCITY',
ADD COLUMN     "originLabel" TEXT,
ADD COLUMN     "originLat" DOUBLE PRECISION,
ADD COLUMN     "originLng" DOUBLE PRECISION,
ADD COLUMN     "routeName" TEXT,
ADD COLUMN     "soloFareRef" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "pooled_trips_kind_origin_status_idx" ON "pooled_trips"("kind", "origin", "status");

