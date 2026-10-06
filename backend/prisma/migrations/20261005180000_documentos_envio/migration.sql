-- Los papeles que viajan CON la carga: remesa, manifiesto, factura, guía.
--
-- Tabla nueva y nada más: no toca ninguna columna existente, así que una
-- base con datos previos queda igual que estaba. Un documento cuelga de
-- exactamente UNO de los tres dueños (viaje de carga, flete o envío
-- urbano), el mismo patrón que freight_events.

-- CreateTable
CREATE TABLE "shipment_documents" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "number" TEXT,
    "issuedOn" TIMESTAMP(3),
    "note" TEXT,
    "signatureUrl" TEXT,
    "signedByName" TEXT,
    "signedAt" TIMESTAMP(3),
    "uploadedByDriverId" TEXT,
    "uploadedByOperatorId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freightId" TEXT,
    "cargoTripId" TEXT,
    "tripId" TEXT,

    CONSTRAINT "shipment_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipment_documents_freightId_idx" ON "shipment_documents"("freightId");

-- CreateIndex
CREATE INDEX "shipment_documents_cargoTripId_idx" ON "shipment_documents"("cargoTripId");

-- CreateIndex
CREATE INDEX "shipment_documents_tripId_idx" ON "shipment_documents"("tripId");

-- CreateIndex
CREATE INDEX "shipment_documents_type_idx" ON "shipment_documents"("type");

-- AddForeignKey
ALTER TABLE "shipment_documents" ADD CONSTRAINT "shipment_documents_freightId_fkey" FOREIGN KEY ("freightId") REFERENCES "freight_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_documents" ADD CONSTRAINT "shipment_documents_cargoTripId_fkey" FOREIGN KEY ("cargoTripId") REFERENCES "cargo_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_documents" ADD CONSTRAINT "shipment_documents_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

