-- Quién manda el envío y qué declara que va dentro.
--
-- Todo aditivo y nullable: las apps ya instaladas no mandan nada de esto y
-- tienen que seguir enviando igual. La exigencia se enciende aparte, con
-- ENVIO_EXIGIR_REMITENTE, cuando los APK nuevos estén repartidos.

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "cargoCategory" TEXT,
ADD COLUMN     "cargoTermsVersion" INTEGER,
ADD COLUMN     "declaredAt" TIMESTAMP(3),
ADD COLUMN     "declaredValue" DOUBLE PRECISION,
ADD COLUMN     "senderDocNumber" TEXT,
ADD COLUMN     "senderDocType" TEXT,
ADD COLUMN     "senderName" TEXT,
ADD COLUMN     "senderPhone" TEXT;

-- AlterTable
ALTER TABLE "freight_requests" ADD COLUMN     "cargoCategory" TEXT,
ADD COLUMN     "cargoTermsVersion" INTEGER,
ADD COLUMN     "declaredAt" TIMESTAMP(3),
ADD COLUMN     "declaredValue" DOUBLE PRECISION,
ADD COLUMN     "senderDocNumber" TEXT,
ADD COLUMN     "senderDocType" TEXT,
ADD COLUMN     "senderName" TEXT,
ADD COLUMN     "senderPhone" TEXT;

