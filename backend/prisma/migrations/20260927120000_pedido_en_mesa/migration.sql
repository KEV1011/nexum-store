-- CreateEnum
CREATE TYPE "OrderMode" AS ENUM ('DELIVERY', 'DINE_IN');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "menuCode" TEXT,
ADD COLUMN     "tables" JSONB;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "mode" "OrderMode" NOT NULL DEFAULT 'DELIVERY',
ADD COLUMN     "tableLabel" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "businesses_menuCode_key" ON "businesses"("menuCode");

