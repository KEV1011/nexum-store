-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "stock" INTEGER,
ADD COLUMN     "unit" TEXT;

-- CreateIndex
CREATE INDEX "products_businessId_barcode_idx" ON "products"("businessId", "barcode");

