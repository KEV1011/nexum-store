/**
 * Devolver un conductor al despacho cuando termina —o se cae— un servicio.
 *
 * Vive suelto y no dentro de `client.service` porque lo necesitan también los
 * mandados, y hacer que `errand.service` importe a `client.service` por una
 * función de dos líneas es justo como nacen los ciclos que ya obligaron a sacar
 * `order-offer.service` de su sitio.
 */
import type { ErrandStatus, OrderStatus, TripStatus } from '@prisma/client';

import { prisma } from './prisma';
import { guardaNoOcupa } from './estado-terminal';

/**
 * Cuántos servicios tiene ABIERTOS el conductor ahora mismo (viajes, pedidos y
 * mandados: los tres que lo ponen ON_TRIP al aceptarlos). Una reserva apartada
 * para otro día no cuenta: ver `guardaNoOcupa`.
 */
export async function serviciosAbiertos(driverId: string): Promise<number> {
  const [viajes, pedidos, mandados] = await Promise.all([
    prisma.trip.count({
      // `guardaNoOcupa` y no `guardaNoTerminal`: una reserva apartada para
      // mañana está abierta pero no lo tiene ocupado hoy, y contarla lo
      // dejaría ON_TRIP —o sea, fuera del despacho— hasta que la cumpla.
      where: { driverId, status: guardaNoOcupa('trip') as { notIn: TripStatus[] } },
    }),
    prisma.order.count({
      where: { driverId, status: guardaNoOcupa('order') as { notIn: OrderStatus[] } },
    }),
    prisma.errand.count({
      where: { driverId, status: guardaNoOcupa('errand') as { notIn: ErrandStatus[] } },
    }),
  ]);
  return viajes + pedidos + mandados;
}

/**
 * Pone al conductor ONLINE **solo si no le queda ningún otro servicio abierto**.
 *
 * Hasta que existió el encadenado esto era una asignación directa, y era
 * correcta: un conductor no podía tener dos servicios a la vez, así que cerrar
 * uno significaba quedar libre. Ahora sí puede tener dos —acepta el siguiente
 * mientras termina el actual, que es como reparten Uber y DiDi— y ponerlo
 * ONLINE con un pasajero ya asignado lo devolvería a la cola del despacho: le
 * llegaría un tercer servicio teniendo dos, y alguien se quedaría esperando.
 *
 * Mira los tres tipos, no solo los viajes: el encadenado ofrece lo que haya
 * cerca, y bien puede ser un pedido detrás de un viaje.
 *
 * Best-effort, igual que la asignación que sustituye: si la consulta falla, se
 * prefiere dejar al conductor como está antes que tumbar la liquidación, que es
 * lo que de verdad importa en ese momento. El barrido de conductores colgados
 * recoge después lo que se quede atrás.
 *
 * Y es también la cura del conductor «en viaje» que no lleva nada: lo llama
 * el latido del GPS (ver `updateDriverGeo`). Sin eso, un servicio cerrado por
 * un camino que no lo liberaba lo dejaba ON_TRIP con la app abierta y latiendo
 * — fuera del despacho para siempre, porque el barrido de colgados solo mira a
 * quien NO late. Se veía como «el pedido está listo y no le sale a nadie».
 *
 * Devuelve `true` si lo liberó, para que quien lo llama pueda dejar constancia.
 */
export async function liberarConductorSiNoTieneMas(driverId: string): Promise<boolean> {
  try {
    if ((await serviciosAbiertos(driverId)) > 0) return false; // sigue ocupado: se queda ON_TRIP
    const r = await prisma.driver.updateMany({
      // Solo se toca a quien está EN VIAJE: si ya se desconectó, ponerlo ONLINE
      // lo metería al despacho sin estar mirando la app.
      where: { id: driverId, status: 'ON_TRIP' },
      data: { status: 'ONLINE' },
    });
    return r.count > 0;
  } catch {
    return false;
  }
}
