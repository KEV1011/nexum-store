-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "operatorId" TEXT;

-- CreateIndex
CREATE INDEX "orders_operatorId_idx" ON "orders"("operatorId");

