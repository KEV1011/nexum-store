-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "deletedAt" TIMESTAMP(3);

