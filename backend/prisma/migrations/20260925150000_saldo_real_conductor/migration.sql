-- El saldo del conductor deja de contar como suyo lo que cobró de su mano.
--
-- Hasta ahora `getDriverBalance` hacía `suma(netEarning) − pagado − pendiente`,
-- y `recordCompletedTrip` escribía `netEarning` en CADA servicio sin mirar
-- quién había cobrado. En una carrera de $6.000 en efectivo el conductor ya
-- tenía los $6.000 y el sistema decía que le debíamos $5.100: el signo estaba
-- invertido, porque en realidad él nos debe la comisión.
--
--  * `platformHeld`: lo que ZIPA recaudó de verdad (solo `en_linea`) y tiene
--    que girarle. Es lo único retirable.
--  * `driverOwes`:  la comisión de los servicios que cobró él (efectivo,
--    Nequi, Daviplata, transferencia — en todos ellos la plata le llega
--    directamente y por la app no pasa un peso).
--
-- `netEarning` NO se toca: sigue siendo «lo que ganó», que es la cifra del
-- panel de ganancias y es correcta como tal.
--
-- LAS FILAS ANTERIORES QUEDAN EN CERO EN LAS DOS COLUMNAS, a propósito. No se
-- puede saber con qué se pagó cada servicio viejo, y las dos formas de
-- adivinarlo son malas de distinta manera: darlas por cobradas por la
-- plataforma acreditaría plata que nunca recibimos —el error que esto viene a
-- cerrar—, y darlas por efectivo estrenaría el sistema cobrándole al conductor
-- una deuda que nadie le avisó que estaba corriendo. Cero en ambas es el único
-- punto de partida defendible: ni le debemos ni nos debe por lo de antes.

-- AlterTable
ALTER TABLE "driver_earnings" ADD COLUMN     "driverOwes" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "platformHeld" DOUBLE PRECISION NOT NULL DEFAULT 0;
