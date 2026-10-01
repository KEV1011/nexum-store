-- Recordatorio de la reserva: «tu carrera es en media hora».
--
-- Una marca con el instante, no una bandera: el barrido corre cada minuto y
-- sin constancia el aviso se repetiría treinta veces. Nullable y sin relleno:
-- las reservas que ya existen no han recibido recordatorio, y escribirles una
-- fecha ahora les quitaría el que sí les toca.
ALTER TABLE "trips" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
