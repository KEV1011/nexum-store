-- AlterTable
ALTER TABLE "users" ADD COLUMN     "kycCheckedAt" TIMESTAMP(3),
ADD COLUMN     "kycProvider" TEXT,
ADD COLUMN     "kycReference" TEXT,
ADD COLUMN     "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "selfieUrl" TEXT;

-- AlterTable
ALTER TABLE "trip_messages" ADD COLUMN     "imageUrl" TEXT,
ALTER COLUMN "body" SET DEFAULT '';

