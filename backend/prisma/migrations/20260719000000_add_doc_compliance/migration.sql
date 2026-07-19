-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('CLEAR', 'EXPIRING', 'BLOCKED');

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "blockedReason" TEXT,
ADD COLUMN     "complianceStatus" "ComplianceStatus" NOT NULL DEFAULT 'CLEAR';

