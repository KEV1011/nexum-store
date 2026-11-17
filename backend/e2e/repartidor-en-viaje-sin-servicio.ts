/**
 * «El local da listo y no le llega a ningún repartidor» — y el repartidor está
 * en línea, con la app abierta, a tres cuadras.
 *
 * LA CAUSA. Al repartidor le quedó un servicio abierto en la base que nadie
 * atiende (la app se cerró a mitad y no sabe retomarlo, el cliente nunca
 * canceló, una prueba a medias). Mientras tanto recibe ofertas con normalidad.
 * Pero en cuanto ENTREGA su siguiente servicio, la regla que lo devuelve al
 * despacho ve ese otro abierto y lo deja «en viaje». Para siempre: sigue
 * latiendo, así que el barrido de conductores colgados no lo mira, y la app le
 * dice «En línea». Desde entonces no le llega nada.
 *
 * LA CURA. Con un servicio en pantalla la app manda cada posición con el id de
 * ese servicio; el latido sin id solo sale desde el inicio. Un conductor «en
 * viaje» que late sin id un rato seguido no está atendiendo nada: se devuelve
 * al despacho, y el servicio huérfano se deja como está para que lo resuelva
 * una persona.
 *
 * Se reproduce con el servidor de sockets REAL: la señal vive en el manejador
 * de sockets y llamando a los servicios no se ve.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/repartidor-en-viaje-sin-servicio.ts
 */
// Antes de importar el manejador: lee la ventana al cargarse.
process.env['OCIOSO_EN_VIAJE_S'] = '2';

import http from 'http';
import jwt from 'jsonwebtoken';
import WebSocket, { WebSocketServer } from 'ws';
import { prisma } from '../src/lib/prisma';
import { JWT_SECRET } from '../src/config/constants';
import { exigirBaseLocal } from './_base-de-pruebas';

let fallos = 0;
let bien = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  if (ok) { bien++; console.log(`  ✓ ${nombre}`); }
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
}
const tel = (p: string) => `+573${p}${String(Date.now()).slice(-7)}`;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const P = { lat: 7.3754, lng: -72.6486 };

interface Conexion {
  recibidos: Array<Record<string, unknown>>;
  enviar: (m: Record<string, unknown>) => void;
  de: (type: string) => Array<Record<string, unknown>>;
  cerrar: () => Promise<void>;
}

async function conectar(puerto: number, driverId: string, phone: string): Promise<Conexion> {
  const ws = new WebSocket(`ws://127.0.0.1:${puerto}`);
  const recibidos: Array<Record<string, unknown>> = [];
  ws.on('message', (d) => { recibidos.push(JSON.parse(d.toString())); });
  await new Promise<void>((ok, mal) => { ws.once('open', () => ok()); ws.once('error', mal); });
  const token = jwt.sign({ driverId, phone }, JWT_SECRET, { expiresIn: '1h' });
  ws.send(JSON.stringify({ type: 'auth', token, workMode: 'pasajero' }));
  for (let i = 0; i < 40 && !recibidos.some((m) => m['type'] === 'auth_ok'); i++) await esperar(50);
  await esperar(250);
  return {
    recibidos,
    enviar: (m) => ws.send(JSON.stringify(m)),
    de: (type) => recibidos.filter((m) => m['type'] === type),
    cerrar: () => new Promise<void>((ok) => { ws.once('close', () => ok()); ws.close(); }),
  };
}

async function main(): Promise<void> {
  exigirBaseLocal('el estado en línea de todos los conductores');
  const { setupWebSocket } = await import('../src/websocket/ws.handler');
  const { placeClientOrder, acceptOrderByBusiness, markOrderReadyByBusiness } =
    await import('../src/services/client.service');
  const { createBusinessProduct, updateBusinessLocation } =
    await import('../src/services/business.service');
  const { driverUpdateOrderStatus } = await import('../src/services/estado-por-conductor.service');
  const matching = await import('../src/services/matching.service');

  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  setupWebSocket(wss);
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  const puerto = (server.address() as { port: number }).port;

  await prisma.municipality.upsert({
    where: { slug: 'pamplona' }, update: { lat: P.lat, lng: P.lng, isActive: true },
    create: { slug: 'pamplona', name: 'Pamplona', department: 'Norte de Santander', lat: P.lat, lng: P.lng, isActive: true },
  });
  await prisma.driver.updateMany({ where: { status: { in: ['ONLINE', 'ON_TRIP'] } }, data: { status: 'OFFLINE' } });

  const m = `e2eocioso-${Date.now()}`;
  const negocio = await prisma.business.create({
    data: {
      name: `${m} Pizzería`, ownerName: 'Dueño', category: 'RESTAURANT', address: 'Calle 5 #4-20',
      phone: tel('41'), token: `tok-${m}`, acceptingOrders: true, deliveryFee: 2500, etaMinutes: 20,
    },
  });
  await updateBusinessLocation(negocio.id, P.lat, P.lng);
  const prod = await createBusinessProduct(
    negocio.id, { name: 'Focaccina', price: 22000, category: 'Entradas' } as never,
  ) as { id: string };
  const cliente = await prisma.user.create({ data: { name: 'Cliente', phone: tel('42') } });
  const steve = await prisma.driver.create({
    data: {
      name: 'Steve', phone: tel('43'), documentType: 'CC', documentNumber: `95${Date.now() % 1e7}`,
      isVerified: true, status: 'OFFLINE', acceptsOrders: true, acceptsErrands: true, acceptsTrips: true,
    },
  });

  const estado = async () =>
    (await prisma.driver.findUniqueOrThrow({ where: { id: steve.id }, select: { status: true } })).status;
  const nuevoPedido = async () => (await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id, deliveryAddress: 'Cra. 9 #7-88',
    deliveryLat: P.lat + 0.004, deliveryLng: P.lng - 0.003, paymentMethod: 'efectivo',
    items: [{ productId: prod.id, quantity: 1 }],
  } as never)).id;
  const ofrecido = (c: Conexion, id: string) =>
    c.de('order_request').some((o) => (o['order'] as { id: string }).id === id);
  /** El latido del inicio: posición SIN id de servicio, como lo manda la app. */
  const latirSinServicio = async (c: Conexion, ms: number) => {
    for (let t = 0; t < ms; t += 300) {
      c.enviar({ type: 'location_update', lat: P.lat + 0.001, lng: P.lng + 0.001 });
      await esperar(300);
    }
  };

  const limpiar = async () => {
    const pedidos = await prisma.order.findMany({ where: { businessId: negocio.id }, select: { id: true } });
    const ids = pedidos.map((o) => o.id);
    for (const id of ids) matching.cancelSearchRetry(`order:${id}`);
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { businessId: negocio.id } });
    await prisma.errand.deleteMany({ where: { userId: cliente.id } });
    await prisma.product.deleteMany({ where: { businessId: negocio.id } });
    await prisma.business.deleteMany({ where: { id: negocio.id } });
    await prisma.driverEarning.deleteMany({ where: { driverId: steve.id } });
    await prisma.driver.deleteMany({ where: { id: steve.id } });
    await prisma.user.deleteMany({ where: { id: cliente.id } });
  };

  try {
    console.log('\n── 1. Cómo se queda atascado ──');
    // El huérfano: un mandado que aceptó hace dos días y nadie cerró.
    const huerfano = await prisma.errand.create({
      data: {
        requestRef: `NXE-${m}`, userId: cliente.id, driverId: steve.id, category: 'FOOD',
        description: 'Mandado que se quedó a medias', pickupAddress: 'Calle 1', dropoffAddress: 'Calle 2',
        status: 'ACCEPTED', acceptedAt: new Date(Date.now() - 48 * 3600_000),
      },
    });
    await prisma.$executeRaw`
      UPDATE "errands" SET "updatedAt" = now() - interval '2 days' WHERE "id" = ${huerfano.id}`;

    const c = await conectar(puerto, steve.id, steve.phone);
    c.enviar({ type: 'location_update', lat: P.lat + 0.001, lng: P.lng + 0.001 });
    await esperar(400);
    comprobar('se conecta y queda EN LÍNEA aunque tenga el huérfano', (await estado()) === 'ONLINE');

    // Un pedido normal, de punta a punta.
    const p1 = await nuevoPedido();
    await acceptOrderByBusiness(negocio.id, p1, 15);
    await esperar(900);
    comprobar('le llega el primer pedido', ofrecido(c, p1));
    c.enviar({ type: 'accept_order', orderId: p1 });
    await esperar(700);
    comprobar('al aceptar queda EN VIAJE', (await estado()) === 'ON_TRIP');
    await markOrderReadyByBusiness(negocio.id, p1);
    const pines = await prisma.order.findUniqueOrThrow({
      where: { id: p1 }, select: { pickupPin: true, deliveryPin: true },
    });
    await driverUpdateOrderStatus(steve.id, p1, 'at_pickup');
    await driverUpdateOrderStatus(steve.id, p1, 'in_transit', pines.pickupPin ?? undefined);
    await driverUpdateOrderStatus(steve.id, p1, 'delivered', pines.deliveryPin ?? undefined);
    await esperar(300);
    comprobar('entregado', (await prisma.order.findUniqueOrThrow({ where: { id: p1 } })).status === 'DELIVERED');
    comprobar('EL FALLO: tras entregar sigue EN VIAJE por el mandado huérfano',
      (await estado()) === 'ON_TRIP', `status=${await estado()}`);

    // Y el siguiente pedido listo no le llega, con él a 150 m y latiendo.
    const p2 = await nuevoPedido();
    await acceptOrderByBusiness(negocio.id, p2, 15);
    await markOrderReadyByBusiness(negocio.id, p2);
    c.enviar({ type: 'location_update', lat: P.lat + 0.001, lng: P.lng + 0.001 });
    await esperar(900);
    comprobar('y el pedido siguiente NO le llega', !ofrecido(c, p2));

    console.log('\n── 2. La cura: late desde el inicio, sin servicio en pantalla ──');
    await latirSinServicio(c, 3200);
    await esperar(400);
    comprobar('tras un rato latiendo sin servicio vuelve a EN LÍNEA',
      (await estado()) === 'ONLINE', `status=${await estado()}`);
    comprobar('el mandado huérfano NO se toca',
      (await prisma.errand.findUniqueOrThrow({ where: { id: huerfano.id } })).status === 'ACCEPTED');

    // El pedido seguía buscando con sus reintentos (uno cada 30 s). Aquí se
    // adelanta el siguiente para no esperar medio minuto: es la misma llamada.
    comprobar('el pedido seguía buscando', matching.busquedaEnCurso('order', p2));
    matching.cancelSearchRetry(`order:${p2}`);
    await matching.startOrderMatchingCycle(p2, 1);
    await esperar(600);
    comprobar('y en el siguiente reintento el pedido listo SÍ le llega', ofrecido(c, p2));
    c.enviar({ type: 'reject_order', orderId: p2 });
    await esperar(300);
    await prisma.order.update({ where: { id: p2 }, data: { status: 'CANCELLED' } });
    matching.cancelSearchRetry(`order:${p2}`);

    console.log('\n── 3. Lo que NO se puede romper ──');
    // (a) Con un servicio en pantalla la app manda el id: no se le libera.
    await prisma.driver.update({ where: { id: steve.id }, data: { status: 'ON_TRIP' } });
    for (let t = 0; t < 3200; t += 300) {
      c.enviar({ type: 'location_update', lat: P.lat + 0.001, lng: P.lng + 0.001, tripId: huerfano.id });
      await esperar(300);
    }
    comprobar('quien late CON su servicio en pantalla sigue en viaje',
      (await estado()) === 'ON_TRIP', `status=${await estado()}`);

    // (b) Un servicio recién aceptado no es un huérfano: es el siguiente en cola.
    await prisma.$executeRaw`UPDATE "errands" SET "updatedAt" = now() WHERE "id" = ${huerfano.id}`;
    await latirSinServicio(c, 3200);
    await esperar(300);
    comprobar('con un servicio recién movido NO se le libera',
      (await estado()) === 'ON_TRIP', `status=${await estado()}`);

    // (c) Un latido suelto de vez en cuando no cuenta como «un rato seguido».
    await prisma.$executeRaw`
      UPDATE "errands" SET "updatedAt" = now() - interval '2 days' WHERE "id" = ${huerfano.id}`;
    c.enviar({ type: 'location_update', lat: P.lat, lng: P.lng, tripId: huerfano.id }); // reinicia la cuenta
    await esperar(200);
    c.enviar({ type: 'location_update', lat: P.lat + 0.001, lng: P.lng + 0.001 });
    await esperar(1000);
    comprobar('un solo latido sin servicio no basta', (await estado()) === 'ON_TRIP');

    // (d) A quien está desconectado no se le pone en línea por esta vía.
    await c.cerrar();
    await esperar(400);
    await prisma.driver.update({ where: { id: steve.id }, data: { status: 'OFFLINE' } });
    const { liberarConductorOcioso } = await import('../src/lib/liberar-conductor');
    const r = await liberarConductorOcioso(steve.id);
    comprobar('a un desconectado no lo pone en línea', !r.liberado && (await estado()) === 'OFFLINE');
  } finally {
    await limpiar();
    await new Promise<void>((ok) => { wss.close(); server.close(() => ok()); });
    await prisma.$disconnect();
  }

  console.log(`\n${bien} bien · ${fallos} mal`);
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
