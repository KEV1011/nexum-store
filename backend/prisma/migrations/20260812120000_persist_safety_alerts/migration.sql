-- CreateTable
CREATE TABLE "safety_alerts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "operatorId" TEXT,
    "serviceKind" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "safety_alerts_operatorId_createdAt_idx" ON "safety_alerts"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "safety_alerts_driverId_createdAt_idx" ON "safety_alerts"("driverId", "createdAt");

