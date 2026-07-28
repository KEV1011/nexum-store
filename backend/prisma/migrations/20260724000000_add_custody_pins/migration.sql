-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryPin" TEXT,
ADD COLUMN     "deliveryPinAt" TIMESTAMP(3),
ADD COLUMN     "pickupPin" TEXT,
ADD COLUMN     "pickupPinAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "errands" ADD COLUMN     "deliveryPin" TEXT,
ADD COLUMN     "deliveryPinAt" TIMESTAMP(3),
ADD COLUMN     "pickupPin" TEXT,
ADD COLUMN     "pickupPinAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "freight_requests" ADD COLUMN     "deliveryPin" TEXT,
ADD COLUMN     "deliveryPinAt" TIMESTAMP(3),
ADD COLUMN     "pickupPin" TEXT,
ADD COLUMN     "pickupPinAt" TIMESTAMP(3);

