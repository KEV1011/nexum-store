-- CreateTable
CREATE TABLE "driver_track_points" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "serviceKind" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "operatorId" TEXT,
    "metersFromPrev" DOUBLE PRECISION,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_track_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_track_points_serviceKind_serviceId_at_idx" ON "driver_track_points"("serviceKind", "serviceId", "at");

-- CreateIndex
CREATE INDEX "driver_track_points_driverId_at_idx" ON "driver_track_points"("driverId", "at");

-- CreateIndex
CREATE INDEX "driver_track_points_operatorId_at_idx" ON "driver_track_points"("operatorId", "at");

-- CreateIndex
CREATE INDEX "driver_track_points_at_idx" ON "driver_track_points"("at");

