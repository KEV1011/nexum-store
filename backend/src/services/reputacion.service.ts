/**
 * La nota del conductor y la de la empresa, calculadas de las filas reales.
 *
 * POR QUÉ ESTO EXISTE AHORA
 * -------------------------
 * `recalcularReputacionConductor` vivía en `client.service` y promediaba SOLO
 * los `Trip` urbanos. Mientras tanto `rateIntercityBooking` guardaba la nota
 * del viaje intermunicipal en su fila y no la llevaba a ninguna parte: el
 * pasajero calificaba cinco estrellas y no llegaban ni al conductor ni a
 * nadie. Es el mismo defecto que ya se pagó con `Business.rating` y con
 * `Driver.rating` —una nota que se enseña sin que nadie la escriba, o una que
 * se escribe sin que nadie la lea— y aquí estaba la segunda mitad.
 *
 * Las dos reglas de `lib/reputacion.ts` siguen mandando: sin calificaciones no
 * hay número (`null`, y la app dice «Nuevo»), y el promedio se RECALCULA de
 * las filas en vez de irse sumando encima.
 *
 * UNA SOLA NOTA POR SUJETO, DE TODAS SUS FUENTES
 * ----------------------------------------------
 * Un conductor presta viajes urbanos, intermunicipales y salidas de bus. Tener
 * una nota por servicio obligaría al pasajero a saber cuál está mirando, y la
 * media de las medias no es la media. Se promedian las estrellas, todas juntas.
 *
 * Best-effort a propósito, igual que las otras dos: si el promedio falla, la
 * calificación del pasajero YA quedó guardada en su fila y se corrige en la
 * siguiente. Perder el dato bueno por el derivado sería el peor cambio.
 */

import { prisma } from '../lib/prisma';
import { promedioReputacion } from '../lib/reputacion';

/** Las estrellas de todos los servicios que prestó este conductor. */
async function _estrellasDelConductor(driverId: string): Promise<number[]> {
  const [urbanos, intermunicipales, salidas] = await Promise.all([
    prisma.trip.findMany({
      where: { driverId, rating: { not: null } },
      select: { rating: true },
    }),
    prisma.intercityBooking.findMany({
      where: { driverId, rating: { not: null } },
      select: { rating: true },
    }),
    // Las de sus salidas de bus: la nota cuelga de la reserva del pasajero, y
    // el conductor se alcanza por el viaje.
    prisma.seatBooking.findMany({
      where: { rating: { not: null }, trip: { driverId } },
      select: { rating: true },
    }),
  ]);
  return [...urbanos, ...intermunicipales, ...salidas].map((f) => f.rating as number);
}

export async function recalcularReputacionConductor(driverId: string): Promise<void> {
  try {
    const { rating, ratingCount } = promedioReputacion(await _estrellasDelConductor(driverId));
    await prisma.driver.update({ where: { id: driverId }, data: { rating, ratingCount } });
  } catch (err) {
    console.error('[reputacion] no se pudo recalcular la nota del conductor:', err);
  }
}

/**
 * La nota de la empresa: sus salidas de bus y sus viajes intermunicipales.
 *
 * Los dos cuentan porque para el pasajero son el mismo proveedor — compró «un
 * viaje con Cotranal», no «una salida programada de Cotranal». Separarlos
 * daría dos notas de la misma empresa y ninguna respondería a la pregunta que
 * se hace antes de comprar.
 *
 * Los servicios urbanos NO entran aunque el conductor esté afiliado: ahí la
 * empresa no pone el vehículo ni la operación, y cargarle en su reputación un
 * viaje de taxi sería juzgarla por algo que no prestó.
 */
export async function recalcularReputacionEmpresa(operatorId: string): Promise<void> {
  try {
    const [salidas, intermunicipales] = await Promise.all([
      prisma.seatBooking.findMany({
        where: { rating: { not: null }, trip: { operatorId } },
        select: { rating: true },
      }),
      prisma.intercityBooking.findMany({
        where: { operatorId, rating: { not: null } },
        select: { rating: true },
      }),
    ]);
    const { rating, ratingCount } = promedioReputacion(
      [...salidas, ...intermunicipales].map((f) => f.rating as number),
    );
    await prisma.operator.update({ where: { id: operatorId }, data: { rating, ratingCount } });
  } catch (err) {
    console.error('[reputacion] no se pudo recalcular la nota de la empresa:', err);
  }
}
