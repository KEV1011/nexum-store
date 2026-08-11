-- AlterTable
ALTER TABLE "products" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "optionIds" TEXT[];

