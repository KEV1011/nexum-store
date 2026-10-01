-- Comercios listados por nosotros desde una foto de su carta.
--
-- `claimed` nace en true y NO se rellena nada: todos los comercios que ya
-- existen se registraron ellos mismos desde el portal, así que sus precios
-- son firmes y sus pedidos siguen yendo a su pantalla exactamente igual que
-- hasta hoy. Lo nuevo entra solo por las fichas que se creen sin dueño.
ALTER TABLE "businesses" ADD COLUMN "claimed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "businesses" ADD COLUMN "claimedAt" TIMESTAMP(3);
