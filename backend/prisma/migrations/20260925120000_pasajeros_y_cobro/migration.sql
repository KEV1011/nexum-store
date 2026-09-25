-- Quién viaja en cada silla, y cómo cobra la empresa el pasaje.
--
-- Las dos columnas son nullable y aditivas a propósito:
--
--  * `seat_bookings.passengers` guarda `[{tipoDoc,documento,nombre}]`, uno por
--    puesto. Hasta hoy la reserva guardaba UN nombre —el de la cuenta— sin
--    importar cuántas sillas se compraran, así que una familia de cuatro
--    quedaba registrada como una sola persona. Las reservas anteriores quedan
--    en NULL y se muestran como «sin datos»: rellenarlas con el nombre de la
--    cuenta inventaría tres pasajeros que nadie declaró.
--
--  * `operators.paymentInfo` guarda `{medios:[...], detalle?}`. NULL significa
--    que la empresa no ha publicado cómo cobra, y la app lo dice. No se
--    rellena con «efectivo», que es lo habitual pero no es lo que declaró
--    cada empresa: a la que cobra por transferencia le llegaría gente sin
--    efectivo a la puerta del bus.

-- AlterTable
ALTER TABLE "seat_bookings" ADD COLUMN     "passengers" JSONB;

-- AlterTable
ALTER TABLE "operators" ADD COLUMN     "paymentInfo" JSONB;
