-- Con qué paga el cliente su pedido, y la hora de cada paso.
--
-- `paymentMethod` es nullable y NO se rellena: no hay forma de saber con qué
-- se pagó un pedido anterior, y adivinarlo escribiría un dato falso en un
-- campo que decide si el repartidor cobra en la puerta. Se lee como efectivo,
-- que es lo que de hecho ocurría, y eso vive en el código con su motivo.
ALTER TABLE "orders" ADD COLUMN "paymentMethod" TEXT;

-- La bitácora del pedido. Los pedidos anteriores nacen SIN eventos: inventar
-- una hora para pasos que ya ocurrieron sería peor que no tenerla, así que la
-- línea de tiempo cae a mostrar el paso sin hora cuando no hay registro.
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT,
    "note" TEXT,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- Por pedido y en orden: es la única consulta que se hace sobre esta tabla.
CREATE INDEX "order_events_orderId_at_idx" ON "order_events"("orderId", "at");

ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
