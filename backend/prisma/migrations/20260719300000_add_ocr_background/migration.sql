-- CreateEnum
CREATE TYPE "BackgroundStatus" AS ENUM ('UNCHECKED', 'PENDING', 'CLEAR', 'HIT');

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "backgroundCheckedAt" TIMESTAMP(3),
ADD COLUMN     "backgroundProvider" TEXT,
ADD COLUMN     "backgroundReference" TEXT,
ADD COLUMN     "backgroundStatus" "BackgroundStatus" NOT NULL DEFAULT 'UNCHECKED';

-- AlterTable
ALTER TABLE "driver_documents" ADD COLUMN     "ocrConfidence" DOUBLE PRECISION,
ADD COLUMN     "ocrFields" TEXT;

