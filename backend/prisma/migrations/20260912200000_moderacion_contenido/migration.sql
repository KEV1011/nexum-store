-- Moderación de contenido de usuario: reportes y bloqueos.
--
-- Apple 1.2 y la política de contenido generado por el usuario de Play exigen
-- poder reportar contenido y bloquear a quien abusa. Sin esto la app se
-- rechaza en la primera revisión.

-- CreateTable
CREATE TABLE "content_reports" (
    "id" TEXT NOT NULL,
    "reporterKind" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolution" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "id" TEXT NOT NULL,
    "blockerKind" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedKind" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_reports_status_createdAt_idx" ON "content_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "content_reports_targetKind_targetId_idx" ON "content_reports"("targetKind", "targetId");

-- CreateIndex
CREATE INDEX "user_blocks_blockedKind_blockedId_idx" ON "user_blocks"("blockedKind", "blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "user_blocks_blockerKind_blockerId_blockedKind_blockedId_key" ON "user_blocks"("blockerKind", "blockerId", "blockedKind", "blockedId");
