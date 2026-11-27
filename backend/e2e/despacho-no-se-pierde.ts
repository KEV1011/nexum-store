/**
 * «Hay solicitudes que no le llegan a ningún conductor».
 *
 * Cinco agujeros distintos por los que un servicio se quedaba sin conductor
 * con conductores conectados en la calle, cada uno reproducido aquí con el
 * servidor de sockets REAL (no con funciones sueltas: tres de los cinco viven
 * en el manejador de sockets y llamando a los servicios no se ven).
 *
 *   1. El cierre de un socket VIEJO marcaba al conductor fuera de línea aunque
 *      estuviera conectado por uno nuevo. Y nada lo devolvía.
 *   2. El barrido de rescate medía la edad por la CREACIÓN: a un pedido con
 *      media hora de cocina le cortaba la búsqueda que «listo» acababa de
 *      arrancar, y a un viaje reservado lo daba por viejo al nacer.
 *   3. Aceptar justo después de vencer el turno: el servidor decía que no y la
 *      app entraba igual al servicio.
 *   4. Un mandado cancelado por el cliente dejaba al mandadero sin poder
 *      aceptar ninguno más.
 *   5. El rechazo de un «Aceptar» no decía a qué se refería.
 */
import http from 'http';
import jwt from 'jsonwebtoken';
import WebSocket, { WebSocketServer } from 'ws';
import { prisma } from '../src/lib/prisma';
import { JWT_SECRET } from '../src/config/constants';
import { exigirBaseLocal } from './_base-de-pruebas';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  if (ok) console.log(`  ✓ ${nombre}`);
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
}
const tel = (p: string) => `+573${p}${String(Date.now()).slice(-7)}`;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const P = { lat: 7.3754, lng: -72.6486 };

/** Un conductor conectado por un socket de verdad, con su buzón de mensajes. */
interface Conexion {
  ws: WebSocket;
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
  await esperar(250); // la marca EN LÍNEA se escribe justo después del auth_ok
  return {
    ws,
    recibidos,
    enviar: (m) => ws.send(JSON.stringify(m)),
    de: (type) => recibidos.filter((m) => m['type'] === type),
    cerrar: () => new Promise<void>((ok) => { ws.once('close', () => ok()); ws.close(); }),
  };
}

async function main(): Promise<void> {
  // Pone fuera de línea a TODOS los conductores: solo contra una base local.
  exigirBaseLocal('el estado en línea de todos los conductores');
  const { setupWebSocket } = await import('../src/websocket/ws.handler');
  const { placeClientOrder, acceptOrderByBusiness, markOrderReadyByBusiness } =
    await import('../src/services/client.service');
  const { createBusinessProduct, updateBusinessLocation } =
    await import('../src/services/business.service');
  const { requestClientErrand, cancelClientErrand } = await import('../src/services/errand.service');
  const matching = await import('../src/services/matching.service');
  const { rescatarDespacho } = await import('../src/services/dispatch-recovery.service');

  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  setupWebSocket(wss);
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  const puerto = (server.address() as { port: number }).port;

  await prisma.municipality.upsert({
    where: { slug: 'pamplona' }, update: { lat: P.lat, lng: P.lng, isActive: true },
    create: { slug: 'pamplona', name: 'Pamplona', department: 'Norte de Santander', lat: P.lat, lng: P.lng, isActive: true },
  });
  // Los ONLINE que dejó otra corrida competirían por las ofertas de esta.
  await prisma.driver.updateMany({ where: { status: { in: ['ONLINE', 'ON_TRIP'] } }, data: { status: 'OFFLINE' } });

  const m = `e2edesp-${Date.now()}`;
  const negocio = await prisma.business.create({
    data: {
      name: `${m} Asadero`, ownerName: 'Dueño', category: 'RESTAURANT', address: 'Calle 5 #4-20',
      phone: tel('21'), token: `tok-${m}`, acceptingOrders: true, deliveryFee: 2500, etaMinutes: 20,
    },
  });
  await updateBusinessLocation(negocio.id, P.lat, P.lng);
  const prod = await createBusinessProduct(
    negocio.id, { name: 'Pollo entero', price: 38000, category: 'Asados' } as never,
  ) as { id: string };
  const cliente = await prisma.user.create({ data: { name: 'Cliente', phone: tel('22') } });

  const nuevoConductor = async (n: string) => prisma.driver.create({
    data: {
      name: n, phone: tel(n === 'Cerca' ? '23' : '24'), documentType: 'CC',
      documentNumber: `${n === 'Cerca' ? 93 : 94}${Date.now() % 1e7}`,
      isVerified: true, status: 'OFFLINE', acceptsOrders: true, acceptsErrands: true, acceptsTrips: true,
    },
  });
  const cerca = await nuevoConductor('Cerca');
  const lejos = await nuevoConductor('Lejos');

  const limpiar = async () => {
    const pedidos = await prisma.order.findMany({ where: { businessId: negocio.id }, select: { id: true } });
    const ids = pedidos.map((o) => o.id);
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { businessId: negocio.id } });
    await prisma.errand.deleteMany({ where: { userId: cliente.id } });
    await prisma.trip.deleteMany({ where: { passengerId: cliente.id } });
    await prisma.product.deleteMany({ where: { businessId: negocio.id } });
    await prisma.business.deleteMany({ where: { id: negocio.id } });
    await prisma.driverEarning.deleteMany({ where: { driverId: { in: [cerca.id, lejos.id] } } });
    await prisma.driver.deleteMany({ where: { id: { in: [cerca.id, lejos.id] } } });
    await prisma.user.deleteMany({ where: { id: cliente.id } });
  };

  const estado = async (id: string) =>
    (await prisma.driver.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
  const nuevoPedido = async () => (await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id, deliveryAddress: 'Cra. 6 #8-12',
    deliveryLat: P.lat + 0.004, deliveryLng: P.lng - 0.003, paymentMethod: 'efectivo',
    items: [{ productId: prod.id, quantity: 1 }],
  } as never)).id;
  const soltarPedido = async (id: string) => {
    await prisma.order.update({ where: { id }, data: { status: 'CANCELLED' } });
    matching.cancelSearchRetry(`order:${id}`);
  };

  try {
    // ───────────────────────────────────────────────────────────────────────
    console.log('\n── 1. El socket viejo que se cierra tarde ──');
    const viejo = await conectar(puerto, cerca.id, cerca.phone);
    comprobar('al conectarse queda EN LÍNEA', (await estado(cerca.id)) === 'ONLINE');
    // El teléfono cambió de red: abre otro socket sin que el primero se cierre.
    const nuevo = await conectar(puerto, cerca.id, cerca.phone);
    await viejo.cerrar();
    await esperar(400);
    comprobar('cerrar el socket VIEJO no lo saca del despacho',
      (await estado(cerca.id)) === 'ONLINE', `status=${await estado(cerca.id)}`);

    // Y la oferta le sigue llegando por el socket nuevo.
    nuevo.enviar({ type: 'location_update', lat: P.lat + 0.001, lng: P.lng + 0.001 });
    await esperar(400);
    const p1 = await nuevoPedido();
    await acceptOrderByBusiness(negocio.id, p1, 15);
    await esperar(900);
    comprobar('la oferta le llega por el socket vigente',
      nuevo.de('order_request').some((o) => (o['order'] as { id: string }).id === p1));
    nuevo.enviar({ type: 'reject_order', orderId: p1 });
    await esperar(300);
    await soltarPedido(p1);

    // El que late estando marcado fuera de línea vuelve solo.
    await prisma.driver.update({ where: { id: cerca.id }, data: { status: 'OFFLINE' } });
    nuevo.enviar({ type: 'location_update', lat: P.lat + 0.001, lng: P.lng + 0.001 });
    await esperar(600);
    comprobar('un latido por el socket vigente lo devuelve a EN LÍNEA',
      (await estado(cerca.id)) === 'ONLINE', `status=${await estado(cerca.id)}`);

    // Pero cerrar el VIGENTE sí lo desconecta: eso no se puede romper.
    await nuevo.cerrar();
    await esperar(400);
    comprobar('cerrar el socket vigente sí lo deja fuera de línea',
      (await estado(cerca.id)) === 'OFFLINE', `status=${await estado(cerca.id)}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n── 2. El barrido y la edad del servicio ──');
    // Un pedido de hace 50 min que el restaurante marca listo AHORA, sin nadie
    // conectado: la búsqueda de «listo» queda viva con sus reintentos.
    const p2 = await nuevoPedido();
    await acceptOrderByBusiness(negocio.id, p2, 15);
    await esperar(300);
    const hace50 = new Date(Date.now() - 50 * 60_000);
    await prisma.order.update({ where: { id: p2 }, data: { createdAt: hace50, acceptedAt: hace50 } });
    // La primera búsqueda ya se había rendido y avisado: la marca está puesta.
    await prisma.order.update({ where: { id: p2 }, data: { noDriverNotifiedAt: hace50 } });
    await markOrderReadyByBusiness(negocio.id, p2);
    await esperar(300);
    comprobar('«listo» deja una búsqueda viva', matching.busquedaEnCurso('order', p2));
    comprobar('y reabre el aviso de «sin repartidor» para esta búsqueda nueva',
      (await prisma.order.findUniqueOrThrow({ where: { id: p2 } })).noDriverNotifiedAt == null);

    let r = await rescatarDespacho();
    await esperar(300);
    comprobar('el barrido NO le corta la búsqueda a un pedido recién listo',
      matching.busquedaEnCurso('order', p2), 'los reintentos desaparecieron');
    comprobar('ni lo cuenta como cerrado por viejo', (r.porTipo['pedido']?.cerrados ?? 0) === 0,
      JSON.stringify(r.porTipo));
    let fila = await prisma.order.findUniqueOrThrow({ where: { id: p2 } });
    comprobar('ni avisa «sin repartidor» antes de tiempo', fila.noDriverNotifiedAt == null);

    // Tras un REINICIO no queda nada en memoria: se reanuda, porque lleva
    // segundos listo aunque se haya creado hace casi una hora.
    matching.cancelSearchRetry(`order:${p2}`);
    r = await rescatarDespacho();
    await esperar(300);
    comprobar('tras un reinicio el pedido recién listo se REANUDA',
      (r.porTipo['pedido']?.reanudados ?? 0) === 1 && matching.busquedaEnCurso('order', p2),
      JSON.stringify(r.porTipo));

    // Uno que lleva listo más de media hora sin nadie buscándolo sí se cierra.
    matching.cancelSearchRetry(`order:${p2}`);
    await prisma.order.update({ where: { id: p2 }, data: { readyAt: new Date(Date.now() - 45 * 60_000) } });
    r = await rescatarDespacho();
    await esperar(300);
    fila = await prisma.order.findUniqueOrThrow({ where: { id: p2 } });
    comprobar('el que lleva 45 min listo y sin búsqueda sí se da por viejo',
      (r.porTipo['pedido']?.cerrados ?? 0) === 1 && fila.noDriverNotifiedAt != null,
      JSON.stringify(r.porTipo));
    await soltarPedido(p2);

    // Un viaje RESERVADO ayer que sale a buscar hoy.
    const viaje = await prisma.trip.create({
      data: {
        requestRef: `NXT-${m}`,
        passengerId: cliente.id, status: 'SEARCHING', serviceType: 'PARTICULAR',
        originLat: P.lat, originLng: P.lng, originAddress: 'Parque principal',
        destLat: P.lat + 0.01, destLng: P.lng + 0.01, destAddress: 'Universidad',
        estimatedFare: 6000, createdAt: new Date(Date.now() - 26 * 3600_000),
        scheduledFor: new Date(Date.now() + 10 * 60_000),
      },
    });
    r = await rescatarDespacho();
    await esperar(500);
    const trasBarrido = await prisma.trip.findUniqueOrThrow({ where: { id: viaje.id } });
    comprobar('un viaje reservado ayer NO se cancela por viejo al salir a buscar',
      trasBarrido.status === 'SEARCHING' && (r.porTipo['viaje']?.cerrados ?? 0) === 0,
      `status=${trasBarrido.status} ${JSON.stringify(r.porTipo)}`);
    matching.cancelSearchRetry(`trip:${viaje.id}`);
    await prisma.trip.update({ where: { id: viaje.id }, data: { status: 'CANCELLED' } });

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n── 3. Aceptar justo después de vencer el turno ──');
    const c1 = await conectar(puerto, cerca.id, cerca.phone);
    const c2 = await conectar(puerto, lejos.id, lejos.phone);
    c1.enviar({ type: 'location_update', lat: P.lat + 0.001, lng: P.lng + 0.001 });
    c2.enviar({ type: 'location_update', lat: P.lat + 0.02, lng: P.lng + 0.02 });
    await esperar(500);

    const p3 = await nuevoPedido();
    await acceptOrderByBusiness(negocio.id, p3, 15);
    await esperar(900);
    const leLlego = (c: Conexion, id: string) =>
      c.de('order_request').some((o) => (o['order'] as { id: string }).id === id);
    comprobar('la oferta va primero al más cercano', leLlego(c1, p3) && !leLlego(c2, p3));

    // A los 15 s la app deja de enseñarla; el servidor espera un poco más.
    await esperar(15_500);
    comprobar('a los 16 s el servidor todavía no pasó el turno (margen)', !leLlego(c2, p3));
    await esperar(4_500);
    comprobar('pasado el margen, la oferta pasa al siguiente', leLlego(c2, p3));

    // El primero acepta TARDE mientras el segundo la tiene delante: no es suya.
    c1.enviar({ type: 'accept_order', orderId: p3 });
    await esperar(700);
    const perdida = c1.de('offer_gone').find((x) => x['id'] === p3);
    comprobar('al que llega tarde se le dice que ya no es suya, con el id',
      perdida != null && perdida['kind'] === 'order' && typeof perdida['message'] === 'string');
    comprobar('y no se le asigna', (await prisma.order.findUniqueOrThrow({ where: { id: p3 } })).driverId == null);
    await esperar(1_600);
    comprobar('las apps anteriores reciben además el aviso que sí escuchan',
      c1.de('order_cancelled').some((x) => x['orderId'] === p3));

    // El segundo deja vencer el suyo: ya nadie la tiene delante. Si acepta
    // ahora —tarde, pero es el único que la quiere— se la lleva.
    await esperar(18_500);
    comprobar('con los dos turnos vencidos queda en reintento, sin oferta viva',
      matching.busquedaEnCurso('order', p3));
    c2.enviar({ type: 'accept_order', orderId: p3 });
    await esperar(900);
    const tomado = await prisma.order.findUniqueOrThrow({ where: { id: p3 } });
    comprobar('quien acepta tarde y nadie más la tiene, se la lleva',
      tomado.driverId === lejos.id && c2.de('order_accept_ok').some((x) => x['orderId'] === p3),
      `driverId=${tomado.driverId}`);
    comprobar('y la búsqueda se apaga', !matching.busquedaEnCurso('order', p3));

    // Alguien a quien NUNCA se le ofreció no puede tomar un servicio por su id.
    const p4 = await nuevoPedido();
    await prisma.driver.update({ where: { id: cerca.id }, data: { acceptsOrders: false } });
    await prisma.driver.update({ where: { id: lejos.id }, data: { status: 'ON_TRIP' } });
    await acceptOrderByBusiness(negocio.id, p4, 15);
    await esperar(700);
    c1.enviar({ type: 'accept_order', orderId: p4 });
    await esperar(700);
    comprobar('a quien no se le ofreció no puede tomarlo conociendo el id',
      (await prisma.order.findUniqueOrThrow({ where: { id: p4 } })).driverId == null);
    await soltarPedido(p4);
    await prisma.order.update({ where: { id: p3 }, data: { status: 'CANCELLED' } });
    await prisma.driver.update({ where: { id: cerca.id }, data: { acceptsOrders: true, status: 'ONLINE' } });
    await prisma.driver.update({ where: { id: lejos.id }, data: { status: 'OFFLINE' } });
    await c2.cerrar();

    // ───────────────────────────────────────────────────────────────────────
    console.log('\n── 4. El mandado cancelado que bloqueaba los siguientes ──');
    c1.enviar({ type: 'location_update', lat: P.lat + 0.001, lng: P.lng + 0.001 });
    await esperar(400);
    const pedirMandado = async () => {
      const e = await requestClientErrand(cliente.id, {
        category: 'shopping', description: 'Un pollo asado', pickupAddress: 'Asadero',
        dropoffAddress: 'Cra. 6 #8-12', pickupLat: P.lat, pickupLng: P.lng,
      } as never);
      void matching.startErrandMatchingCycle(e.id, P.lat, P.lng);
      await esperar(900);
      return e.id;
    };
    const m1 = await pedirMandado();
    c1.enviar({ type: 'accept_errand', errandId: m1 });
    await esperar(900);
    comprobar('acepta el primer mandado',
      (await prisma.errand.findUniqueOrThrow({ where: { id: m1 } })).driverId === cerca.id);
    // El CLIENTE lo cancela: el mandadero queda libre.
    await cancelClientErrand(cliente.id, m1);
    await esperar(500);
    comprobar('la cancelación lo devuelve al despacho', (await estado(cerca.id)) === 'ONLINE');

    const m2 = await pedirMandado();
    comprobar('le llega la oferta del siguiente',
      c1.de('errand_request').some((o) => (o['errand'] as { id: string }).id === m2));
    c1.enviar({ type: 'accept_errand', errandId: m2 });
    await esperar(900);
    const segundo = await prisma.errand.findUniqueOrThrow({ where: { id: m2 } });
    comprobar('y puede aceptarlo (antes: «Already handling an errand»)',
      segundo.driverId === cerca.id && segundo.status === 'ACCEPTED',
      `driverId=${segundo.driverId} status=${segundo.status}`);

    // Antes, con un mandado en curso no aceptaba otro. Cambió a propósito:
    // un local tarda 20 o 30 minutos y mientras tanto va por otro. Lo que NO
    // se puede romper es el TOPE (3 encargos), contado en la base.
    const m3 = await pedirMandado();
    c1.enviar({ type: 'accept_errand', errandId: m3 });
    await esperar(900);
    comprobar('con un mandado abierto ya puede aceptar otro',
      (await prisma.errand.findUniqueOrThrow({ where: { id: m3 } })).driverId === cerca.id);
    const m4 = await pedirMandado();
    c1.enviar({ type: 'accept_errand', errandId: m4 });
    await esperar(900);
    comprobar('y un tercero',
      (await prisma.errand.findUniqueOrThrow({ where: { id: m4 } })).driverId === cerca.id);
    const m5 = await pedirMandado();
    c1.enviar({ type: 'accept_errand', errandId: m5 });
    await esperar(900);
    comprobar('con 3 encargos abiertos no acepta un cuarto',
      (await prisma.errand.findUniqueOrThrow({ where: { id: m5 } })).driverId == null);
    comprobar('y se le dice por qué, en español',
      c1.de('offer_gone').some((x) => x['id'] === m5 && /encargos/.test(String(x['message']))));
    for (const id of [m3, m4, m5]) matching.cancelSearchRetry(`errand:${id}`);
    await c1.cerrar();
  } finally {
    await limpiar().catch((e) => console.log('limpieza:', (e as Error).message));
    await new Promise<void>((ok) => { wss.close(() => ok()); for (const c of wss.clients) c.terminate(); });
    await new Promise<void>((ok) => server.close(() => ok()));
  }

  console.log(fallos === 0 ? '\nTODO EN VERDE' : `\n${fallos} FALLO(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); process.exit(1); });
