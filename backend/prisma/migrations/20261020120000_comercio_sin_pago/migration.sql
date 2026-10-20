-- Comercio con el plan sin pagar: sigue en la vitrina, pero sus pedidos salen
-- como mandados de compra en vez de llegar a su portal. Nullable: los que ya
-- existen quedan al día.
ALTER TABLE "businesses" ADD COLUMN "unpaidSince" TIMESTAMP(3);
