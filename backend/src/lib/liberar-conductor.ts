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

/**
 * Cuánto tiene que llevar quieto un servicio para darlo por HUÉRFANO: abierto
 * en la base, asignado al conductor, y sin que nadie lo mueva.
 */
export const HUERFANO_MIN = Number(process.env['SERVICIO_HUERFANO_MIN'] ?? 5);

/** Los servicios abiertos del conductor, con cuándo se movieron por última vez. */
export async function serviciosAbiertosDetalle(
  driverId: string,
): Promise<Array<{ tipo: 'trip' | 'order' | 'errand'; id: string; updatedAt: Date }>> {
  const [viajes, pedidos, mandados] = await Promise.all([
    prisma.trip.findMany({
      where: { driverId, status: guardaNoOcupa('trip') as { notIn: TripStatus[] } },
      select: { id: true, updatedAt: true },
    }),
    prisma.order.findMany({
      where: { driverId, status: guardaNoOcupa('order') as { notIn: OrderStatus[] } },
      select: { id: true, updatedAt: true },
    }),
    prisma.errand.findMany({
      where: { driverId, status: guardaNoOcupa('errand') as { notIn: ErrandStatus[] } },
      select: { id: true, updatedAt: true },
    }),
  ]);
  return [
    ...viajes.map((v) => ({ tipo: 'trip' as const, ...v })),
    ...pedidos.map((v) => ({ tipo: 'order' as const, ...v })),
    ...mandados.map((v) => ({ tipo: 'errand' as const, ...v })),
  ];
}

/**
 * EL CONDUCTOR «EN VIAJE» QUE ESTÁ EN SU PANTALLA DE INICIO.
 *
 * `liberarConductorSiNoTieneMas` no lo suelta mientras le quede UN servicio
 * abierto en la base. Y un servicio se queda abierto sin que nadie lo atienda
 * con facilidad: la app se cerró a mitad (no sabe retomar un servicio ya
 * aceptado), el cliente nunca canceló, o una prueba se dejó a medias. A partir
 * de ahí, en cuanto ese conductor termina su siguiente servicio queda ON_TRIP
 * para siempre: la app le dice «En línea», el GPS llega cada cuatro segundos,
 * y el despacho no le ofrece nada. Se veía como «el pedido está listo y no le
 * llega a ningún repartidor» — y le pasaba justo a quien más trabaja.
 *
 * La señal que lo delata la manda la propia app: mientras hay un servicio en
 * pantalla, cada posición viaja con el id de ese servicio; el latido SIN id
 * solo sale desde el inicio, sin nada activo. Quien llama aquí ya comprobó que
 * lleva un rato seguido latiendo así.
 *
 * Solo se libera si NINGUNO de sus servicios abiertos se movió hace poco
 * (`HUERFANO_MIN`): uno recién aceptado no es un huérfano, es el siguiente
 * viaje en cola de quien está mirando el resumen del anterior.
 *
 * Los servicios huérfanos NO se tocan: cerrarlos pagaría algo que quizá no se
 * prestó y cancelarlos negaría algo que quizá sí. Se devuelven para dejar
 * constancia y que los resuelva una persona.
 */
export async function liberarConductorOcioso(
  driverId: string,
  ahora: Date = new Date(),
): Promise<{ liberado: boolean; huerfanos: string[] }> {
  try {
    const abiertos = await serviciosAbiertosDetalle(driverId);
    const corte = ahora.getTime() - HUERFANO_MIN * 60_000;
    if (abiertos.some((s) => s.updatedAt.getTime() > corte)) {
      return { liberado: false, huerfanos: [] };
    }
    const r = await prisma.driver.updateMany({
      where: { id: driverId, status: 'ON_TRIP' },
      data: { status: 'ONLINE' },
    });
    return { liberado: r.count > 0, huerfanos: abiertos.map((s) => `${s.tipo}:${s.id}`) };
  } catch {
    return { liberado: false, huerfanos: [] };
  }
}
