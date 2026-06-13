-- Matching real de mandados + chat en pedidos de domicilio.

-- Modo de trabajo del conductor (el enum "WorkMode" ya existe desde la
-- migración inicial). El matching de mandados filtra por MANDADO.
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "workMode" "WorkMode" NOT NULL DEFAULT 'PASAJERO';

-- Coordenadas de recogida del mandado para el matching geoespacial.
ALTER TABLE "errands" ADD COLUMN IF NOT EXISTS "pickupLat" DOUBLE PRECISION;
ALTER TABLE "errands" ADD COLUMN IF NOT EXISTS "pickupLng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE IF NOT EXISTS "order_chat_messages" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromRole" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "order_chat_messages_orderId_idx" ON "order_chat_messages"("orderId");

-- AddForeignKey
ALTER TABLE "order_chat_messages" ADD CONSTRAINT "order_chat_messages_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
