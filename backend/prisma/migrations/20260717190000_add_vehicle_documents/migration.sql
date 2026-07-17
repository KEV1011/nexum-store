-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "operationCardExpiry" TIMESTAMP(3),
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "rtmExpiry" TIMESTAMP(3),
ADD COLUMN     "soatExpiry" TIMESTAMP(3);

