-- La cuenta de una mesa: agrupa las rondas que esa mesa va pidiendo.
--
-- Todo aditivo: `orders.tabId` nace NULL y los pedidos que ya existen se
-- quedan así. Un pedido sin cuenta sigue funcionando exactamente igual que
-- hoy — es lo que son todos los de domicilio.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "tabId" TEXT;

-- CreateTable
CREATE TABLE "table_tabs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "tableLabel" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedTotal" DOUBLE PRECISION,
    "paymentMethod" TEXT,
    "closedBy" TEXT,

    CONSTRAINT "table_tabs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "table_tabs_businessId_openedAt_idx" ON "table_tabs"("businessId", "openedAt");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "table_tabs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_tabs" ADD CONSTRAINT "table_tabs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── La guarda que de verdad sostiene esto ─────────────────────────────────
--
-- UNA SOLA CUENTA ABIERTA POR MESA. Sin este índice, dos comensales de la
-- misma mesa pidiendo a la vez desde sus teléfonos crearían DOS cuentas: una
-- ronda caería en una, el cobro en la otra, y el local cobraría de menos sin
-- que nada fallara visiblemente.
--
-- Va como índice ÚNICO PARCIAL (`WHERE "closedAt" IS NULL`) porque la
-- restricción solo aplica mientras la cuenta está abierta: la misma mesa
-- tiene muchas cuentas cerradas a lo largo del día y todas son legítimas.
-- Prisma no sabe declarar índices parciales, por eso esta línea va a mano.
CREATE UNIQUE INDEX "table_tabs_una_abierta_por_mesa"
  ON "table_tabs" ("businessId", "tableLabel")
  WHERE "closedAt" IS NULL;

-- Buscar la cuenta abierta de una mesa es la consulta más caliente: pasa en
-- cada pedido que entra desde un QR.
CREATE INDEX "table_tabs_abiertas" ON "table_tabs" ("businessId", "closedAt");
