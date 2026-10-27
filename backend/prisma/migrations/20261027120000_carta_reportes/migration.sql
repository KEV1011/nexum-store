-- Cartas que el dueño marcó como «se leyó mal»: la foto, la respuesta del OCR
-- y lo que salió, para reproducirlas como prueba.
CREATE TABLE "carta_reportes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "photoUrl" TEXT,
    "ocrRaw" JSONB,
    "lectura" JSONB,
    "comentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carta_reportes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "carta_reportes_createdAt_idx" ON "carta_reportes"("createdAt");

CREATE INDEX "carta_reportes_businessId_idx" ON "carta_reportes"("businessId");

ALTER TABLE "carta_reportes" ADD CONSTRAINT "carta_reportes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
