-- Los grupos de opciones pasan a vivir en el NEGOCIO y los platos los adjuntan.
--
-- ESCRITA A MANO A PROPÓSITO. `prisma migrate diff` genera un solo
-- `ALTER TABLE option_groups DROP COLUMN "productId", ADD COLUMN "businessId"
-- NOT NULL`, que sobre una tabla con datos falla y, si pasara, dejaría todos
-- los grupos sin dueño y sin plato. El relleno tiene que ir ENTRE los dos
-- pasos, y por eso no se usa el fichero generado.

-- 1. El flag de acompañamiento (pieza independiente, sin relleno).
ALTER TABLE "products" ADD COLUMN "suggestAsAddon" BOOLEAN NOT NULL DEFAULT false;

-- 2. El puente, vacío todavía.
CREATE TABLE "product_option_groups" (
    "productId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_option_groups_pkey" PRIMARY KEY ("productId","groupId")
);
CREATE INDEX "product_option_groups_productId_idx" ON "product_option_groups"("productId");
CREATE INDEX "product_option_groups_groupId_idx" ON "product_option_groups"("groupId");

-- 3. La columna nueva nace NULLABLE para poder rellenarla.
ALTER TABLE "option_groups" ADD COLUMN "businessId" TEXT;

-- 4. Cada grupo hereda el negocio de su plato.
UPDATE "option_groups" g
   SET "businessId" = p."businessId"
  FROM "products" p
 WHERE p."id" = g."productId";

-- 5. Y cada grupo queda ADJUNTO al plato que lo tenía: lo que hoy existe sigue
--    viéndose exactamente igual en la carta.
INSERT INTO "product_option_groups" ("productId", "groupId", "sortOrder")
SELECT g."productId", g."id", g."sortOrder"
  FROM "option_groups" g
 WHERE g."productId" IS NOT NULL;

-- 6. Un grupo sin plato no puede existir (hay FK con cascade), pero si alguno
--    sobreviviera bloquearía el NOT NULL de abajo sin decir por qué. Se borra:
--    un grupo sin dueño no lo puede ver nadie ni se puede cobrar.
DELETE FROM "option_groups" WHERE "businessId" IS NULL;

-- 7. Ya con todos los dueños puestos.
ALTER TABLE "option_groups" ALTER COLUMN "businessId" SET NOT NULL;

-- 8. Fuera el vínculo viejo. El puente es ahora el ÚNICO camino de lectura.
ALTER TABLE "option_groups" DROP CONSTRAINT "option_groups_productId_fkey";
DROP INDEX "option_groups_productId_idx";
ALTER TABLE "option_groups" DROP COLUMN "productId";

-- 9. Índices y claves foráneas nuevas.
CREATE INDEX "option_groups_businessId_idx" ON "option_groups"("businessId");

ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_option_groups" ADD CONSTRAINT "product_option_groups_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_option_groups" ADD CONSTRAINT "product_option_groups_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
