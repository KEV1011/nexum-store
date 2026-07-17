-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "optionsSummary" TEXT;

-- CreateTable
CREATE TABLE "option_groups" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_options" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "option_groups_productId_idx" ON "option_groups"("productId");

-- CreateIndex
CREATE INDEX "product_options_groupId_idx" ON "product_options"("groupId");

-- AddForeignKey
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

