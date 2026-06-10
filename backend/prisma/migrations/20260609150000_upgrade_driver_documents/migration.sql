-- Upgrade driver_documents: add enums DocumentType / DocumentStatus,
-- add reviewedBy column, and migrate existing string data.

-- 1. Create enum types
CREATE TYPE "DocumentType" AS ENUM ('CEDULA', 'LICENSE', 'SOAT', 'PROPERTY_CARD', 'PROFILE_PHOTO');
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- 2. Add reviewedBy column
ALTER TABLE "driver_documents" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;

-- 3. Add status index
CREATE INDEX IF NOT EXISTS "driver_documents_status_idx" ON "driver_documents"("status");

-- 4. Normalise existing type values to enum literals
UPDATE "driver_documents" SET "type" = 'CEDULA'        WHERE "type" = 'cedula';
UPDATE "driver_documents" SET "type" = 'LICENSE'        WHERE "type" = 'license';
UPDATE "driver_documents" SET "type" = 'SOAT'           WHERE "type" = 'soat';
UPDATE "driver_documents" SET "type" = 'PROPERTY_CARD'  WHERE "type" = 'vehicle_registration';
UPDATE "driver_documents" SET "type" = 'PROFILE_PHOTO'  WHERE "type" = 'profile_photo';

-- 5. Normalise existing status values to enum literals
UPDATE "driver_documents" SET "status" = 'PENDING'   WHERE LOWER("status") = 'pending';
UPDATE "driver_documents" SET "status" = 'APPROVED'  WHERE LOWER("status") = 'approved';
UPDATE "driver_documents" SET "status" = 'REJECTED'  WHERE LOWER("status") = 'rejected';
-- Safety-net: any other value defaults to PENDING
UPDATE "driver_documents"
  SET "status" = 'PENDING'
  WHERE "status" NOT IN ('PENDING', 'APPROVED', 'REJECTED');

-- 6. Convert columns to enum types (drop TEXT default first; it cannot be auto-cast)
ALTER TABLE "driver_documents" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "driver_documents"
  ALTER COLUMN "type"   TYPE "DocumentType"   USING "type"::"DocumentType",
  ALTER COLUMN "status" TYPE "DocumentStatus" USING "status"::"DocumentStatus";
ALTER TABLE "driver_documents" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"DocumentStatus";
