-- Un viaje por puestos puede nacer SIN conductor.
--
-- Hasta ahora toda salida la publicaba quien iba a manejarla (un conductor o
-- una empresa), así que los cuatro campos del conductor eran obligatorios.
-- El puesto de taxi urbano funciona también al revés: el pasajero dice a dónde
-- va y a qué hora, otros pasajeros se le suman, y un taxista la toma del
-- tablero. Mientras nadie la toma, no hay conductor que guardar — y ponerle
-- «Taxi» o el nombre del pasajero sería inventarle uno.
--
-- Solo se AFLOJA la restricción: ninguna fila existente cambia, porque todas
-- tienen los cuatro campos puestos.
ALTER TABLE "pooled_trips" ALTER COLUMN "driverId" DROP NOT NULL;
ALTER TABLE "pooled_trips" ALTER COLUMN "driverName" DROP NOT NULL;
ALTER TABLE "pooled_trips" ALTER COLUMN "driverPhone" DROP NOT NULL;
ALTER TABLE "pooled_trips" ALTER COLUMN "vehicleDescription" DROP NOT NULL;

-- Quién la publicó, cuando la publicó un pasajero. NULL en todas las de antes.
ALTER TABLE "pooled_trips" ADD COLUMN "createdByUserId" TEXT;
CREATE INDEX "pooled_trips_createdByUserId_idx" ON "pooled_trips"("createdByUserId");
