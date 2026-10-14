-- Cancelar una ronda, y dejar constancia de reabrir una cuenta cobrada.
--
-- Todo aditivo y con valor por defecto, así que las cuentas que ya existen no
-- cambian de significado: `reopenCount = 0` es exactamente lo que les pasó.

ALTER TABLE "table_tabs" ADD COLUMN "reopenCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "table_tabs" ADD COLUMN "reopenedAt" TIMESTAMP(3);
ALTER TABLE "table_tabs" ADD COLUMN "reopenedBy" TEXT;
ALTER TABLE "table_tabs" ADD COLUMN "reopenedFrom" DOUBLE PRECISION;
