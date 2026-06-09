-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "commission" DOUBLE PRECISION,
ADD COLUMN     "netEarning" DOUBLE PRECISION,
ADD COLUMN     "passengerName" TEXT,
ADD COLUMN     "passengerRating" DOUBLE PRECISION,
ADD COLUMN     "startedAt" TIMESTAMP(3);
