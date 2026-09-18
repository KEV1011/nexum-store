-- AlterTable
ALTER TABLE "magic_links" ADD COLUMN     "originLabel" TEXT,
ADD COLUMN     "originLat" DOUBLE PRECISION,
ADD COLUMN     "originLng" DOUBLE PRECISION;

