-- La firma de quien recibe, guardada de verdad.
--
-- `hasSignature` se retira sin pérdida: era un booleano que NADIE escribía
-- (nacía en `false` al crear el pedido o el mandado y ningún camino lo ponía
-- en `true`), mientras las dos apps y el portal del negocio ya lo pintaban.
-- Toda la columna vale `false` en cualquier base, así que no se borra ni un
-- dato. A partir de aquí el booleano del DTO se deriva de `signatureUrl`:
-- un flag guardado al lado del archivo acaba diciendo que hay firma donde
-- no la hay, y en un envío esa firma es la prueba que se reclama.

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "hasSignature",
ADD COLUMN     "signatureUrl" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedByName" TEXT;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "signatureUrl" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedByName" TEXT;

-- AlterTable
ALTER TABLE "errands" DROP COLUMN "hasSignature",
ADD COLUMN     "signatureUrl" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedByName" TEXT;
