-- CreateTable
CREATE TABLE "whatsapp_inbound" (
    "id" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_inbound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magic_links" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "magic_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_inbound_waMessageId_key" ON "whatsapp_inbound"("waMessageId");

-- CreateIndex
CREATE INDEX "whatsapp_inbound_fromPhone_receivedAt_idx" ON "whatsapp_inbound"("fromPhone", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "magic_links_code_key" ON "magic_links"("code");

-- CreateIndex
CREATE INDEX "magic_links_userId_createdAt_idx" ON "magic_links"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "magic_links_expiresAt_idx" ON "magic_links"("expiresAt");

-- AddForeignKey
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

