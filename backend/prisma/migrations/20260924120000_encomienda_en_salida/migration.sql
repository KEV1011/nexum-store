-- La encomienda viaja en la bodega del bus de pasajeros.
--
-- Hasta ahora un remito solo podía colgar de un viaje de CARGA
-- (`cargoTripId`), así que la bodega de una salida programada —que es como
-- opera de verdad una cooperativa intermunicipal— no se podía vender desde el
-- sistema. El bus ya va y el costo del viaje ya está hundido: cada encomienda
-- es margen casi puro, y es lo que una cooperativa mira con más interés que el
-- pasaje.
--
-- Nullable y sin tocar `cargoTripId`: los remitos de carga siguen exactamente
-- igual. En la práctica los dos vínculos son excluyentes —un remito va en UN
-- vehículo— pero no se fuerza con una restricción porque el caso de un remito
-- suelto (sin viaje asignado todavía) es legítimo y ya existe.
ALTER TABLE "freight_manifests" ADD COLUMN "pooledTripId" TEXT;

CREATE INDEX "freight_manifests_pooledTripId_idx" ON "freight_manifests"("pooledTripId");

ALTER TABLE "freight_manifests"
  ADD CONSTRAINT "freight_manifests_pooledTripId_fkey"
  FOREIGN KEY ("pooledTripId") REFERENCES "pooled_trips"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
