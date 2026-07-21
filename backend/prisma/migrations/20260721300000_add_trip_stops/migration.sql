-- AlterTable
ALTER TABLE "intercity_bookings" ADD COLUMN     "stops" JSONB;

-- AlterTable
ALTER TABLE "pooled_trips" ADD COLUMN     "stops" JSONB;

