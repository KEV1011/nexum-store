/**
 * «Cuando el pedido a domicilio ya está listo no le sale a ningún conductor».
 *
 * El despacho del pedido está sano (se comprueba aquí mismo, como contraprueba).
 * Lo que dejaba al pedido en el mostrador era el REPARTIDOR: marcado ON_TRIP sin
 * ningún servicio abierto, con la app abierta y el GPS latiendo. El despacho lo
 * salta (ON_TRIP solo recibe encadenados) y el barrido de colgados no lo ve
 * (solo rescata a quien NO late). Se queda así para siempre.
 *
 *   1. Contraprueba: con el repartidor ONLINE, aceptar el pedido SÍ lo ofrece.
 *   2. El caso: repartidor ON_TRIP sin nada abierto → su latido lo devuelve a
 *      ONLINE, y «listo para recoger» le ofrece el pedido.
 *   3. Lo que NO se puede romper: un repartidor ON_TRIP CON un pedido abierto
 *      sigue en viaje aunque lata.
 *   4. «Listo» con una oferta en curso no manda la misma oferta dos veces.
 *   5. El diagnóstico por pedido dice el motivo (encargos apagados).
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  if (ok) console.log(`  ✓ ${nombre}`);
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
}
const tel = (p: string) => `+573${p}${String(Date.now()).slice(-7)}`;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const P = { lat: 7.3754, lng: -72.6486 };

async function main(): Promise<void> {
  const { placeClientOrder, acceptOrderByBusiness, markOrderReadyByBusiness } =
    await import('../src/services/client.service');
  const { createBusinessProduct, updateBusinessLocation } = await import('../src/services/business.service');
  const matching = await import('../src/services/matching.service');
  const { diagnosePedido } = await import('../src/services/admin.service');

  const ofertas: Array<{ id: string; type: string; orderId?: string }> = [];
  matching.registerSendToDriver((id, msg) => {
    const m = msg as { type: string; order?: { id: string } };
    ofertas.push({ id, type: m.type, orderId: m.order?.id });
    return true;
  });
  const ofertasDe = (orderId: string) => ofertas.filter((o) => o.type === 'order_request' && o.orderId === orderId);

  await prisma.municipality.upsert({
    where: { slug: 'pamplona' }, update: { lat: P.lat, lng: P.lng, isActive: true },
    create: { slug: 'pamplona', name: 'Pamplona', department: 'Norte de Santander', lat: P.lat, lng: P.lng, isActive: true },
  });
  const m = `e2elisto-${Date.now()}`;
  const negocio = await prisma.business.create({
    data: {
      name: `${m} Pizzería`, ownerName: 'Dueño', category: 'RESTAURANT', address: 'Calle 5 #4-20',
      phone: tel('11'), token: `tok-${m}`, acceptingOrders: true, deliveryFee: 2500, etaMinutes: 20,
    },
  });
  await updateBusinessLocation(negocio.id, P.lat, P.lng);
  const prod = await createBusinessProduct(negocio.id, { name: 'Focaccina', price: 22000, category: 'Entradas' } as never) as { id: string };
  const cliente = await prisma.user.create({ data: { name: 'Cliente', phone: tel('12') } });

  const repartidor = await prisma.driver.create({
    data: {
      name: 'Moto', phone: tel('13'), documentType: 'CC', documentNumber: `91${Date.now() % 1e7}`,
      isVerified: true, status: 'ONLINE', acceptsOrders: true,
    },
  });
  const latir = () => matching.updateDriverGeo(repartidor.id, P.lat + 0.003, P.lng + 0.003);
  await latir();

  const nuevoPedido = async () => (await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id, deliveryAddress: 'Pje. la Curia #6',
    deliveryLat: P.lat + 0.004, deliveryLng: P.lng - 0.003, paymentMethod: 'bre_b',
    items: [{ productId: prod.id, quantity: 1 }],
  } as never)).id;

  console.log('\n── 1. Contraprueba: el despacho del pedido funciona ──');
  const p1 = await nuevoPedido();
  await acceptOrderByBusiness(negocio.id, p1, 15);
  await esperar(800);
  comprobar('con el repartidor ONLINE, aceptar el pedido se lo ofrece', ofertasDe(p1).length === 1,
    `ofertas=${ofertasDe(p1).length}`);
  await prisma.order.update({ where: { id: p1 }, data: { status: 'CANCELLED' } });
  matching.cancelSearchRetry(`order:${p1}`);
  await esperar(16_000); // que venza la oferta en curso

  console.log('\n── 2. Repartidor «en viaje» sin nada abierto ──');
  await prisma.driver.update({ where: { id: repartidor.id }, data: { status: 'ON_TRIP' } });
  ofertas.length = 0;
  const p2 = await nuevoPedido();
  await acceptOrderByBusiness(negocio.id, p2, 15);
  await esperar(800);
  comprobar('así no le llega (es el síntoma reportado)', ofertasDe(p2).length === 0);

  const diag = await diagnosePedido((await prisma.order.findUniqueOrThrow({ where: { id: p2 } })).orderRef);
  const fila = diag?.drivers.find((d) => d.id === repartidor.id);
  comprobar('el diagnóstico del pedido lo señala con su motivo',
    fila?.dispatchable === false && /sin ningún servicio abierto/.test(fila?.motivo ?? ''),
    `motivo=${fila?.motivo}`);

  await latir();
  await esperar(500);
  const tras = await prisma.driver.findUniqueOrThrow({ where: { id: repartidor.id } });
  comprobar('su latido lo devuelve a ONLINE', tras.status === 'ONLINE', `status=${tras.status}`);

  ofertas.length = 0;
  await markOrderReadyByBusiness(negocio.id, p2);
  await esperar(800);
  comprobar('y «listo para recoger» le ofrece el pedido', ofertasDe(p2).length === 1,
    `ofertas=${ofertasDe(p2).length}`);

  console.log('\n── 3. Un repartidor que SÍ lleva un pedido no se toca ──');
  await prisma.order.update({ where: { id: p2 }, data: { driverId: repartidor.id, status: 'DRIVER_TO_PICKUP' } });
  matching.cancelSearchRetry(`order:${p2}`);
  await prisma.driver.update({ where: { id: repartidor.id }, data: { status: 'ON_TRIP' } });
  await esperar(61_000); // la cura se mira como mucho una vez por minuto
  await latir();
  await esperar(500);
  const conPedido = await prisma.driver.findUniqueOrThrow({ where: { id: repartidor.id } });
  comprobar('con un pedido abierto sigue ON_TRIP aunque lata', conPedido.status === 'ON_TRIP',
    `status=${conPedido.status}`);
  await prisma.order.update({ where: { id: p2 }, data: { status: 'DELIVERED' } });
  await prisma.driver.update({ where: { id: repartidor.id }, data: { status: 'ONLINE' } });
  await esperar(16_000);

  console.log('\n── 4. «Listo» con una oferta en curso no la duplica ──');
  ofertas.length = 0;
  const p3 = await nuevoPedido();
  await acceptOrderByBusiness(negocio.id, p3, 15);
  await esperar(800);
  await markOrderReadyByBusiness(negocio.id, p3);
  await esperar(800);
  comprobar('una sola oferta al mismo repartidor', ofertasDe(p3).length === 1,
    `ofertas=${ofertasDe(p3).length}`);

  console.log('\n── 5. El diagnóstico dice «encargos apagados» ──');
  await prisma.driver.update({ where: { id: repartidor.id }, data: { acceptsOrders: false } });
  const d5 = await diagnosePedido((await prisma.order.findUniqueOrThrow({ where: { id: p3 } })).orderRef);
  const f5 = d5?.drivers.find((d) => d.id === repartidor.id);
  comprobar('motivo: tiene apagado Encargos', /Encargos \(pedidos\)/.test(f5?.motivo ?? ''), `motivo=${f5?.motivo}`);
  comprobar('el pedido se busca alrededor del local', !d5?.pedido.negocioSinUbicacion
    && Math.abs((d5?.lat ?? 0) - P.lat) < 1e-6);

  matching.cancelSearchRetry(`order:${p3}`);
  console.log(fallos === 0 ? '\nTODO EN VERDE' : `\n${fallos} FALLO(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
