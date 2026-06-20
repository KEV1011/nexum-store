-- Propinas en viajes y pedidos (100% para el conductor, sin comisión).
ALTER TABLE "trips" ADD COLUMN "tipAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "trips" ADD COLUMN "tipPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "tipAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "tipPaid" BOOLEAN NOT NULL DEFAULT false;
