-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "noDriverNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "errands" ADD COLUMN     "noDriverNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "intercity_bookings" ADD COLUMN     "noDriverNotifiedAt" TIMESTAMP(3);

