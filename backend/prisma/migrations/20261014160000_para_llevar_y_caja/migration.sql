-- Para llevar, y la caja del día.

-- ── El modo «para llevar» ─────────────────────────────────────────────────
-- Aditivo: los pedidos que ya existen conservan su modo. `ADD VALUE` fuera de
-- transacción es lo que PostgreSQL exige para los enums.
ALTER TYPE "OrderMode" ADD VALUE IF NOT EXISTS 'TAKEAWAY';

-- ── La caja del turno ─────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedBy" TEXT,
    "openingFloat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "countedCash" DOUBLE PRECISION,
    "expectedCash" DOUBLE PRECISION,
    "difference" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_sessions_businessId_openedAt_idx" ON "cash_sessions"("businessId", "openedAt");

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- UNA SOLA CAJA ABIERTA POR LOCAL. Sin esto, abrir caja dos veces por
-- descuido reparte las ventas del turno entre dos arqueos: ninguno cuadra y
-- el faltante de uno es el sobrante del otro. Índice parcial, porque la
-- restricción solo aplica mientras está abierta — un local tiene muchas
-- cajas cerradas y todas son legítimas. Prisma no sabe declararlos.
CREATE UNIQUE INDEX "cash_sessions_una_abierta"
  ON "cash_sessions" ("businessId")
  WHERE "closedAt" IS NULL;
