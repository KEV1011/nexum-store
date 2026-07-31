-- Custodia del ENVÍO: PIN que dicta quien recibe el paquete.
-- Pedidos, mandados y fletes ya lo tenían; los envíos van por el flujo de
-- "viaje" y se habían quedado sin ninguna prueba de entrega verificable.
-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "deliveryPin" TEXT,
ADD COLUMN     "deliveryPinAt" TIMESTAMP(3);
