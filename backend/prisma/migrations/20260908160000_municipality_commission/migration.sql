-- Comisión de la plataforma por municipio.
--
-- `Operator.commissionRate` ya existía en el esquema desde hace tiempo, pero
-- NADIE lo leía: toda la plataforma cobraba la constante `COMMISSION_RATE`.
-- Esto completa el par para poder resolver flota → ciudad → global.
--
-- Null = usar la global. No se siembra ningún valor: cambiar la economía de
-- una ciudad es una decisión comercial, no algo que deba pasar en una migración.
ALTER TABLE "municipalities" ADD COLUMN "commissionRate" DOUBLE PRECISION;
