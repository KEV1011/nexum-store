-- La vitrina: precio tachado por producto y promoción de la tienda.
--
-- Las tres columnas nacen NULL a propósito: un catálogo existente no tiene
-- descuentos que declarar, y un cero significaría «rebajado a cero».

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "promoDiscount" INTEGER,
ADD COLUMN     "promoMinAmount" INTEGER;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "compareAtPrice" DOUBLE PRECISION;

-- AlterTable: el descuento que se aplicó a ESE pedido, sellado.
ALTER TABLE "orders" ADD COLUMN     "promoDiscount" DOUBLE PRECISION;
