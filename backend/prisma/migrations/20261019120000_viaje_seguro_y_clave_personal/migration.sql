-- Viaje más seguro y la llave maestra cerrada. Todo aditivo y nullable (o con
-- valor por defecto): ninguna fila existente cambia de significado.

-- Código de abordaje y nota del pasajero (ver `lib/codigo-abordaje`). Los
-- viajes anteriores quedan sin código: el servidor no se lo pide a nadie.
ALTER TABLE "trips" ADD COLUMN "boardingPin" TEXT;
ALTER TABLE "trips" ADD COLUMN "passengerNote" TEXT;

-- Clave personal (ver `lib/clave-personal`). Sin clave = la cuenta la crea en
-- su próximo ingreso.
ALTER TABLE "drivers" ADD COLUMN "loginPinHash" TEXT;
ALTER TABLE "drivers" ADD COLUMN "loginPinFails" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "drivers" ADD COLUMN "loginPinLockedUntil" TIMESTAMP(3);

ALTER TABLE "operator_members" ADD COLUMN "loginPinHash" TEXT;
ALTER TABLE "operator_members" ADD COLUMN "loginPinFails" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "operator_members" ADD COLUMN "loginPinLockedUntil" TIMESTAMP(3);

ALTER TABLE "businesses" ADD COLUMN "loginPinHash" TEXT;
ALTER TABLE "businesses" ADD COLUMN "loginPinFails" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "businesses" ADD COLUMN "loginPinLockedUntil" TIMESTAMP(3);

-- «¿Todo bien?»: lo que contestó el pasajero. Null = no contestó o no aplica.
ALTER TABLE "safety_alerts" ADD COLUMN "passengerResponse" TEXT;
ALTER TABLE "safety_alerts" ADD COLUMN "respondedAt" TIMESTAMP(3);
CREATE INDEX "safety_alerts_serviceId_idx" ON "safety_alerts"("serviceId");
