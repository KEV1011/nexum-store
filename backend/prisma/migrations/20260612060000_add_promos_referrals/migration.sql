-- Promociones (cupones) y programa de referidos.

-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('PERCENT', 'FIXED');
CREATE TYPE "PromoScope" AS ENUM ('ALL', 'TRIPS', 'ORDERS');

-- Referidos en users
ALTER TABLE "users" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "users" ADD COLUMN "referredById" TEXT;
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");
ALTER TABLE "users" ADD CONSTRAINT "users_referredById_fkey"
  FOREIGN KEY ("referredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable promo_codes
CREATE TABLE "promo_codes" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "type" "PromoType" NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "scope" "PromoScope" NOT NULL DEFAULT 'ALL',
  "minAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "maxDiscount" DOUBLE PRECISION,
  "maxRedemptions" INTEGER,
  "perUserLimit" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "ownerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateTable promo_redemptions
CREATE TABLE "promo_redemptions" (
  "id" TEXT NOT NULL,
  "promoCodeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "amountBefore" DOUBLE PRECISION NOT NULL,
  "discount" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promo_redemptions_promoCodeId_idx" ON "promo_redemptions"("promoCodeId");
CREATE INDEX "promo_redemptions_userId_idx" ON "promo_redemptions"("userId");
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
