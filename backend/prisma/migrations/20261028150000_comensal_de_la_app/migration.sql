-- El cliente de la app que pidió en la mesa con su sesión: su historial, sus
-- avisos y su calificación. Aparte de "userId", que en la mesa sigue nulo.
ALTER TABLE "orders" ADD COLUMN "dinerUserId" TEXT;

CREATE INDEX "orders_dinerUserId_idx" ON "orders"("dinerUserId");
