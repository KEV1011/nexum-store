-- El tiempo que promete el repartidor del mandado.
--
-- Nullable y sin relleno: los mandados que ya existen no tienen promesa, y
-- escribirles una ahora seria inventar un tiempo que nadie dijo.
ALTER TABLE "errands" ADD COLUMN "etaMinutes" INTEGER;
ALTER TABLE "errands" ADD COLUMN "etaSetAt" TIMESTAMP(3);
