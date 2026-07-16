-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "fraudFlags" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "kycCheckedAt" TIMESTAMP(3),
ADD COLUMN     "kycProvider" TEXT,
ADD COLUMN     "kycReference" TEXT,
ADD COLUMN     "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "selfieUrl" TEXT;

