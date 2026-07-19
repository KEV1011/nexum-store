-- CreateEnum
CREATE TYPE "LegalDocKind" AS ENUM ('TERMS', 'PRIVACY');

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" TEXT NOT NULL,
    "kind" "LegalDocKind" NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_consents" (
    "id" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "docKind" "LegalDocKind" NOT NULL,
    "docVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "legal_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "takedown_requests" (
    "id" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "reporterEmail" TEXT NOT NULL,
    "contentUrl" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "takedown_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_documents_kind_active_idx" ON "legal_documents"("kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_kind_version_key" ON "legal_documents"("kind", "version");

-- CreateIndex
CREATE INDEX "legal_consents_subjectKind_subjectId_idx" ON "legal_consents"("subjectKind", "subjectId");

-- CreateIndex
CREATE INDEX "takedown_requests_status_idx" ON "takedown_requests"("status");

