-- La encomienda: un pedido intermunicipal que viaja en el despacho de una
-- empresa de transporte.
--
-- No se crea un modelo nuevo a propósito. `FreightManifest` YA es exactamente
-- un remito —un destinatario, su ciudad, sus bultos conciliables uno a uno, y
-- el acta firmada de quien recibe— y `CargoTrip` YA es el despacho con su
-- rastro, sus gastos y su cuenta de cobro. Un pedido se convierte en un remito
-- de un despacho y hereda todo eso sin duplicar nada.

-- El estado nuevo del pedido. Va ANTES de IN_TRANSIT en el enum porque ese es
-- el orden del recorrido, y separado de él porque son dos cosas distintas:
-- aquí la caja va en un bus entre ciudades, en IN_TRANSIT va en la moto de un
-- repartidor urbano.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'IN_INTERCITY_TRANSIT' BEFORE 'IN_TRANSIT';

-- AlterTable: el remito puede ser el de un pedido.
ALTER TABLE "freight_manifests" ADD COLUMN     "orderId" TEXT;

-- ÚNICO: un pedido no puede viajar en dos despachos. Si pudiera, dos empresas
-- cobrarían el mismo envío y nadie sabría en qué bus va la caja.
CREATE UNIQUE INDEX "freight_manifests_orderId_key" ON "freight_manifests"("orderId");

-- AddForeignKey
ALTER TABLE "freight_manifests" ADD CONSTRAINT "freight_manifests_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- No hay relleno: ningún pedido anterior es una encomienda (hasta la migración
-- de las piezas 1 y 2 no existía la ciudad de destino), así que `orderId` en
-- NULL para todos los remitos ya creados dice la verdad — son remitos que la
-- flota escribió a mano y no nacieron de un pedido.
