-- Entrar con Google o Apple. La identidad la verifica el proveedor (token
-- firmado), así que esas cuentas pueden nacer sin teléfono. Solo se AFLOJA el
-- NOT NULL: ninguna fila existente cambia. Postgres admite varios NULL bajo
-- un índice único, así que el único del teléfono sigue valiendo.
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;

ALTER TABLE "users" ADD COLUMN "googleSub" TEXT;
ALTER TABLE "users" ADD COLUMN "appleSub" TEXT;

CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");
CREATE UNIQUE INDEX "users_appleSub_key" ON "users"("appleSub");
