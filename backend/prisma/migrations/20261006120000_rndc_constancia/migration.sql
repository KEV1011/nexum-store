-- La constancia del reporte al RNDC y el pago al conductor.
--
-- Todo aditivo y nullable: ningún viaje existente cambia. La empresa es
-- quien reporta, con su usuario del Ministerio; aquí solo queda escrito
-- qué se reportó y cuándo, para poder auditarlo.

-- AlterTable
ALTER TABLE "cargo_trips" ADD COLUMN     "driverPayAmount" DOUBLE PRECISION,
ADD COLUMN     "rndcManifiesto" TEXT,
ADD COLUMN     "rndcRemesa" TEXT,
ADD COLUMN     "rndcReportedAt" TIMESTAMP(3);

