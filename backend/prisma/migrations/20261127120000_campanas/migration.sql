-- AlterTable
ALTER TABLE "products" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "campaignOnly" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "citySlug" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_startsAt_endsAt_idx" ON "campaigns"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "products_campaignId_idx" ON "products"("campaignId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
