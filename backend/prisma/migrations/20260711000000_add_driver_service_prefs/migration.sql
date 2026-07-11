-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "acceptsErrands" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "acceptsOrders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "acceptsTrips" BOOLEAN NOT NULL DEFAULT true;

