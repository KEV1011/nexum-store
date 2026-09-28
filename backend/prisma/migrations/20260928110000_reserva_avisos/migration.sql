-- CreateTable
CREATE TABLE "reserva_avisos" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reserva_avisos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reserva_avisos_tripId_idx" ON "reserva_avisos"("tripId");

-- CreateIndex
CREATE INDEX "reserva_avisos_driverId_idx" ON "reserva_avisos"("driverId");

-- CreateIndex
CREATE INDEX "reserva_avisos_createdAt_idx" ON "reserva_avisos"("createdAt");

