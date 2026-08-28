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
import { guardaNoTerminal } from './estado-terminal';

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
 */
export async function liberarConductorSiNoTieneMas(driverId: string): Promise<void> {
  try {
    const [viajes, pedidos, mandados] = await Promise.all([
      prisma.trip.count({
        where: { driverId, status: guardaNoTerminal('trip') as { notIn: TripStatus[] } },
      }),
      prisma.order.count({
        where: { driverId, status: guardaNoTerminal('order') as { notIn: OrderStatus[] } },
      }),
      prisma.errand.count({
        where: { driverId, status: guardaNoTerminal('errand') as { notIn: ErrandStatus[] } },
      }),
    ]);
    if (viajes + pedidos + mandados > 0) return; // sigue ocupado: se queda ON_TRIP
    await prisma.driver.update({ where: { id: driverId }, data: { status: 'ONLINE' } });
  } catch {
    /* noop */
  }
}
