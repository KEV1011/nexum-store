/**
 * Pedidos apilados: el repartidor que ya lleva un pedido recibe otro cercano.
 *
 * En un pueblo los locales quedan a dos cuadras: mientras lleva uno puede pasar
 * por otro que ya está listo, o llevarse dos del mismo local. Se comprueba:
 *
 *   1. Con un pedido en la mano, le llega otro del local de al lado (y la
 *      oferta va marcada `chained`, para que la app no le tape la pantalla).
 *   2. El orden: uno LIBRE le gana a uno ocupado algo más cerca (penalización),
 *      salvo que el ocupado esté en ESE MISMO local.
 *   3. Lo que NO: con el máximo de pedidos, con un pasajero o un mandado
 *      abierto, con «Enlazar servicios» apagado, lejos del local, o si lo que
 *      se ofrece es un VIAJE.
 *   4. Aceptar el segundo y entregar los dos: tras el primero sigue «en viaje»
 *      (le queda otro), tras el último vuelve a estar en línea.
 *   5. El diagnóstico lo da por despachable.
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  if (ok) console.log(`  ✓ ${nombre}`);
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
}
const sufijo = String(Date.now()).slice(-6);
let n = 0;
const tel = () => `+5731${sufijo}${String(++n).padStart(2, '0')}`;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const P = { lat: 7.3754, lng: -72.6486 };
/** Desplaza `m` metros al norte (≈ 111 km por grado de latitud). */
const alNorte = (p: { lat: number; lng: number }, m: number) => ({ lat: p.lat + m / 111_000, lng: p.lng });

async function main(): Promise<void> {
  const { placeClientOrder, acceptOrderByBusiness, acceptClientOrder } =
    await import('../src/services/client.service');
  const { createBusinessProduct, updateBusinessLocation } = await import('../src/services/business.service');
  const { driverUpdateOrderStatus } = await import('../src/services/estado-por-conductor.service');
  const matching = await import('../src/services/matching.service');
  const { diagnoseMatching } = await import('../src/services/admin.service');

  const ofertas: Array<{ id: string; type: string; orderId?: string; chained?: boolean }> = [];
  matching.registerSendToDriver((id, msg) => {
    const m = msg as { type: string; order?: { id: string }; chained?: boolean };
    ofertas.push({ id, type: m.type, orderId: m.order?.id, chained: m.chained });
    return true;
  });
  const ofertasDe = (orderId: string) => ofertas.filter((o) => o.type === 'order_request' && o.orderId === orderId);

  await prisma.municipality.upsert({
    where: { slug: 'pamplona' }, update: { lat: P.lat, lng: P.lng, isActive: true },
    create: { slug: 'pamplona', name: 'Pamplona', department: 'Norte de Santander', lat: P.lat, lng: P.lng, isActive: true },
  });
  // Nadie de otra corrida compitiendo por la oferta (se ofrece de a uno).
  await prisma.driver.updateMany({ where: { status: { in: ['ONLINE', 'ON_TRIP'] } }, data: { status: 'OFFLINE' } });

  const m = `e2eapila-${sufijo}`;
  const A = P;                    // el local donde ya recoge
  const B = alNorte(P, 600);      // el de al lado
  const C = alNorte(P, 3_200);    // dentro de los 5 km, lejos para apilar
  const negocio = async (nombre: string, p: { lat: number; lng: number }) => {
    const b = await prisma.business.create({
      data: {
        name: `${m} ${nombre}`, ownerName: 'Dueño', category: 'RESTAURANT', address: 'Calle 5 #4-20',
        phone: tel(), token: `tok-${m}-${nombre}`, acceptingOrders: true, deliveryFee: 2500, etaMinutes: 20,
      },
    });
    await updateBusinessLocation(b.id, p.lat, p.lng);
    const prod = await createBusinessProduct(b.id, { name: 'Empanada', price: 3000, category: 'Fritos' } as never) as { id: string };
    return { id: b.id, prod: prod.id };
  };
  const nA = await negocio('A', A);
  const nB = await negocio('B', B);
  const nC = await negocio('C', C);
  const cliente = await prisma.user.create({ data: { name: 'Cliente', phone: tel() } });

  const conductor = (nombre: string, status: 'ONLINE' | 'ON_TRIP') => prisma.driver.create({
    data: {
      name: nombre, phone: tel(), documentType: 'CC', documentNumber: `93${sufijo}${n}`,
      isVerified: true, status, acceptsOrders: true, acceptsChained: true,
    },
  });
  const ocupado = await conductor('Ocupado', 'ON_TRIP');
  const libre = await conductor('Libre', 'OFFLINE' as never);

  const negocios = [nA.id, nB.id, nC.id];
  deshacer = async () => {
    const ids = (await prisma.order.findMany({ where: { businessId: { in: negocios } }, select: { id: true } })).map((o) => o.id);
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.trip.deleteMany({ where: { driverId: { in: [ocupado.id, libre.id] } } });
    await prisma.errand.deleteMany({ where: { driverId: { in: [ocupado.id, libre.id] } } });
    await prisma.product.deleteMany({ where: { businessId: { in: negocios } } });
    await prisma.business.deleteMany({ where: { id: { in: negocios } } });
    await prisma.driverEarning.deleteMany({ where: { driverId: { in: [ocupado.id, libre.id] } } });
    await prisma.driver.deleteMany({ where: { id: { in: [ocupado.id, libre.id] } } });
    await prisma.user.deleteMany({ where: { id: cliente.id } });
  };

  const pedido = async (negocioId: string, prod: string) => (await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocioId, deliveryAddress: 'Pje. la Curia #6',
    deliveryLat: P.lat + 0.004, deliveryLng: P.lng - 0.003, paymentMethod: 'efectivo',
    items: [{ productId: prod, quantity: 1 }],
  } as never)).id;
  const asignar = (orderId: string, driverId: string, status: 'DRIVER_TO_PICKUP' | 'IN_TRANSIT' = 'DRIVER_TO_PICKUP') =>
    prisma.order.update({ where: { id: orderId }, data: { driverId, status, driverName: 'X' } });
  const candidatos = async (p: { lat: number; lng: number }, kind: 'order' | 'trip' = 'order') =>
    (await matching.findNearestAvailableDrivers(p.lat, p.lng, 5_000, 10, 120, kind))
      .map((c) => c.driverId).filter((id) => id === ocupado.id || id === libre.id);
  const ponerEn = (id: string, p: { lat: number; lng: number }) => matching.updateDriverGeo(id, p.lat, p.lng);

  // El ocupado lleva un pedido del local A.
  const a1 = await pedido(nA.id, nA.prod);
  await asignar(a1, ocupado.id);
  await ponerEn(ocupado.id, alNorte(A, 200));

  console.log('\n── 1. Con un pedido en la mano le llega otro del local de al lado ──');
  const b1 = await pedido(nB.id, nB.prod);
  await acceptOrderByBusiness(nB.id, b1, 15);
  await esperar(800);
  const o1 = ofertasDe(b1);
  comprobar('se lo ofrece al repartidor que ya lleva uno', o1.length === 1 && o1[0]?.id === ocupado.id,
    `ofertas=${JSON.stringify(o1)}`);
  comprobar('la oferta va marcada como encadenada', o1[0]?.chained === true);
  comprobar('puede llevarse uno más', await matching.puedeApilarPedido(ocupado.id));

  console.log('\n── 2. Orden: el libre gana, salvo en el mismo local ──');
  await prisma.driver.update({ where: { id: libre.id }, data: { status: 'ONLINE' } });
  // Hacia el local B: ocupado a 400 m (+1 km de penalización), libre a 1 km.
  await ponerEn(ocupado.id, alNorte(B, -400));
  await ponerEn(libre.id, alNorte(B, 1_000));
  const ordenB = await candidatos(B);
  comprobar('hacia otro local, primero el libre aunque esté más lejos',
    ordenB[0] === libre.id && ordenB[1] === ocupado.id, `orden=${ordenB.map((x) => x === libre.id ? 'libre' : 'ocupado')}`);
  // Hacia el local A (donde ya recoge): ocupado a 400 m, libre a 800 m.
  await ponerEn(ocupado.id, alNorte(A, 400));
  await ponerEn(libre.id, alNorte(A, -800));
  const ordenA = await candidatos(A);
  comprobar('en el mismo local, primero el que ya está recogiendo ahí',
    ordenA[0] === ocupado.id && ordenA[1] === libre.id, `orden=${ordenA.map((x) => x === libre.id ? 'libre' : 'ocupado')}`);
  await prisma.driver.update({ where: { id: libre.id }, data: { status: 'OFFLINE' } });
  await ponerEn(ocupado.id, alNorte(A, 200));

  console.log('\n── 3. Cuándo NO se apila ──');
  comprobar('un viaje de pasajero no se le ofrece', !(await candidatos(A, 'trip')).includes(ocupado.id));
  comprobar('lejos del local (3,2 km) no se le ofrece', !(await candidatos(C)).includes(ocupado.id));

  await prisma.driver.update({ where: { id: ocupado.id }, data: { acceptsChained: false } });
  comprobar('con «Enlazar servicios» apagado no se le ofrece', !(await candidatos(B)).includes(ocupado.id));
  await prisma.driver.update({ where: { id: ocupado.id }, data: { acceptsChained: true } });

  const viaje = await prisma.trip.create({
    data: {
      requestRef: `T-${m}`, passengerId: cliente.id, driverId: ocupado.id, status: 'ACCEPTED',
      serviceType: 'TAXI', originLat: A.lat, originLng: A.lng, originAddress: 'x',
      destLat: B.lat, destLng: B.lng, destAddress: 'y', estimatedFare: 5000,
    } as never,
  });
  comprobar('con un pasajero asignado no se le ofrece', !(await candidatos(B)).includes(ocupado.id));
  await prisma.trip.delete({ where: { id: viaje.id } });

  const mandado = await prisma.errand.create({
    data: {
      requestRef: `E-${m}`, userId: cliente.id, driverId: ocupado.id, status: 'ACCEPTED',
      category: 'OTHER', description: 'x', pickupAddress: 'x', dropoffAddress: 'y',
      serviceFee: 3000, updatedAt: new Date(),
    } as never,
  });
  comprobar('con un mandado abierto no se le ofrece', !(await candidatos(B)).includes(ocupado.id));
  await prisma.errand.delete({ where: { id: mandado.id } });

  const extra1 = await pedido(nA.id, nA.prod);
  const extra2 = await pedido(nA.id, nA.prod);
  await asignar(extra1, ocupado.id);
  comprobar('con 2 pedidos todavía puede (máximo 3)', (await candidatos(B)).includes(ocupado.id));
  await asignar(extra2, ocupado.id);
  comprobar('con 3 pedidos ya no', !(await candidatos(B)).includes(ocupado.id)
    && !(await matching.puedeApilarPedido(ocupado.id)));
  await prisma.order.updateMany({ where: { id: { in: [extra1, extra2] } }, data: { status: 'CANCELLED' } });
  comprobar('vuelto a uno, vuelve a poder', (await candidatos(B)).includes(ocupado.id));

  console.log('\n── 4. Acepta el segundo y entrega los dos ──');
  // Se deja vencer la oferta: así se mide la aceptación TARDÍA, que es la que
  // exige que siga libre y donde un repartidor ocupado se quedaba fuera.
  await esperar(20_000);
  comprobar('la oferta ya venció', !matching.onOrderAccept(b1, ocupado.id));
  comprobar('el servidor le deja aceptarlo tarde estando «en viaje»',
    await matching.aceptacionTardia('order', b1, ocupado.id));
  const aceptado = await acceptClientOrder(b1, 'Ocupado', ocupado.phone, ocupado.id);
  comprobar('el pedido queda a su nombre', aceptado != null
    && (await prisma.order.findUniqueOrThrow({ where: { id: b1 } })).driverId === ocupado.id);

  const entregar = async (orderId: string) => {
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await driverUpdateOrderStatus(ocupado.id, orderId, 'in_transit', o.pickupPin ?? undefined);
    await driverUpdateOrderStatus(ocupado.id, orderId, 'delivered', o.deliveryPin ?? undefined);
  };
  await entregar(a1);
  const tras1 = await prisma.driver.findUniqueOrThrow({ where: { id: ocupado.id } });
  comprobar('tras entregar el primero sigue «en viaje» (le queda otro)', tras1.status === 'ON_TRIP', `status=${tras1.status}`);
  await entregar(b1);
  const tras2 = await prisma.driver.findUniqueOrThrow({ where: { id: ocupado.id } });
  comprobar('tras entregar el último vuelve a estar en línea', tras2.status === 'ONLINE', `status=${tras2.status}`);
  await esperar(700); // la liquidación se escribe sin esperar (fire-and-forget)
  // Una fila por día con el acumulado: lo que cuenta es `tripCount`.
  const dia = await prisma.driverEarning.findFirst({ where: { driverId: ocupado.id } });
  comprobar('se liquidaron los dos domicilios', dia?.tripCount === 2, `tripCount=${dia?.tripCount}`);

  console.log('\n── 5. El diagnóstico ──');
  const a2 = await pedido(nA.id, nA.prod);
  await asignar(a2, ocupado.id);
  await prisma.driver.update({ where: { id: ocupado.id }, data: { status: 'ON_TRIP' } });
  await ponerEn(ocupado.id, alNorte(A, 200));
  const fila = (await diagnoseMatching(B.lat, B.lng, 'order')).find((d) => d.id === ocupado.id);
  comprobar('un pedido cercano: lo da por despachable', fila?.dispatchable === true, `motivo=${fila?.motivo}`);
  const filaViaje = (await diagnoseMatching(B.lat, B.lng, 'trip')).find((d) => d.id === ocupado.id);
  comprobar('un viaje: no', filaViaje?.dispatchable === false);

  for (const id of [b1]) matching.cancelSearchRetry(`order:${id}`);
  await limpiar();
  console.log(fallos === 0 ? '\nTODO EN VERDE' : `\n${fallos} FALLO(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}

let deshacer: (() => Promise<void>) | null = null;
async function limpiar(): Promise<void> {
  const f = deshacer;
  deshacer = null;
  if (!f) return;
  try { await f(); } catch (e) { console.error('(no se pudo limpiar del todo)', e); }
}

main().catch(async (e) => {
  console.error(e);
  await limpiar();
  process.exit(1);
});
