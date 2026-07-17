-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "openingHours" TEXT;

