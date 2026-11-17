/**
 * El conductor abre la app y tenía un servicio sin cerrar: lo RETOMA o lo SUELTA.
 *
 * El fallo que motiva esto: la app solo conoce lo que aceptó en esa sesión. Si
 * se cerraba a mitad, al volver no sabía que tenía un servicio: el cliente
 * esperaba a alguien que no iba a llegar, y el conductor quedaba «en viaje»
 * para el despacho — que es lo que dejaba los pedidos listos sin repartidor.
 *
 * Se golpean las RUTAS por HTTP (autenticación, tipo desconocido, códigos de
 * error) y se captura la oferta nueva con `registerSendToDriver`: comprobar
 * solo el estado en la base pasaría igual con el despacho roto.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/retomar-o-soltar.ts
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'net';
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

interface Abierto {
  tipo: string; id: string; estado: string; fase: string;
  puedeSoltar: boolean; motivoNoSoltar?: string; oferta: Record<string, unknown>;
}

async function main(): Promise<void> {
  exigirBaseLocal('el estado en línea de todos los conductores');
  const { placeClientOrder } = await import('../src/services/client.service');
  const { createBusinessProduct, updateBusinessLocation } = await import('../src/services/business.service');
  const matching = await import('../src/services/matching.service');
  const driverRoutes = (await import('../src/routes/driver.routes')).default;

  const app = express();
  app.use(express.json());
  app.use('/driver', driverRoutes);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await prisma.municipality.upsert({
    where: { slug: 'pamplona' }, update: { lat: P.lat, lng: P.lng, isActive: true },
    create: { slug: 'pamplona', name: 'Pamplona', department: 'Norte de Santander', lat: P.lat, lng: P.lng, isActive: true },
  });
  // Los ONLINE de otras corridas competirían por las ofertas.
  await prisma.driver.updateMany({ where: { status: { in: ['ONLINE', 'ON_TRIP'] } }, data: { status: 'OFFLINE' } });

  const m = `e2esoltar-${Date.now()}`;
  const negocio = await prisma.business.create({
    data: {
      name: `${m} Pizzería`, ownerName: 'Dueño', category: 'RESTAURANT', address: 'Calle 5 #4-20',
      phone: tel('51'), token: `tok-${m}`, acceptingOrders: true, deliveryFee: 2500, etaMinutes: 20,
    },
  });
  await updateBusinessLocation(negocio.id, P.lat, P.lng);
  const prod = await createBusinessProduct(negocio.id, { name: 'Focaccina', price: 22000, category: 'Entradas' } as never) as { id: string };
  const cliente = await prisma.user.create({ data: { name: 'Cliente', phone: tel('52') } });

  const nuevoConductor = async (nombre: string, p: string, dLat: number) => {
    const d = await prisma.driver.create({
      data: {
        name: nombre, phone: tel(p), documentType: 'CC', documentNumber: `${p}${Date.now() % 1e7}`,
        isVerified: true, status: 'ONLINE', acceptsOrders: true, acceptsErrands: true, acceptsTrips: true,
      },
    });
    await prisma.$executeRaw`
      UPDATE "drivers"
      SET "geo" = ST_SetSRID(ST_MakePoint(${P.lng}, ${P.lat + dLat}), 4326)::geography,
          "lastSeenAt" = now(), "lastLat" = ${P.lat + dLat}, "lastLng" = ${P.lng}
      WHERE "id" = ${d.id}`;
    return d;
  };
  // Steve está AL LADO; Otro un poco más lejos. Sin la exclusión, la oferta
  // nueva le volvería a llegar a Steve, que es el más cercano.
  const steve = await nuevoConductor('Steve', '53', 0.0005);
  const otro = await nuevoConductor('Otro', '54', 0.004);
  // Los dos con taxi: un viaje TAXI solo se ofrece a quien tiene uno.
  for (const d of [steve, otro]) {
    await prisma.vehicle.create({
      data: {
        driverId: d.id, type: 'TAXI', isActive: true, brand: 'Prueba', model: 'Taxi',
        plate: `X${Math.floor(1000 + Math.random() * 8999)}`, year: 2020, color: 'Amarillo',
      },
    });
  }
  const token = (d: { id: string; phone: string }) =>
    jwt.sign({ driverId: d.id, phone: d.phone }, JWT_SECRET, { expiresIn: '1h' });

  const ofertas: Array<{ driverId: string; type: string; id: string }> = [];
  matching.registerSendToDriver((driverId, msg) => {
    const mm = msg as Record<string, unknown>;
    const cuerpo = (mm['trip'] ?? mm['order'] ?? mm['errand']) as { id?: string } | undefined;
    ofertas.push({ driverId, type: String(mm['type']), id: cuerpo?.id ?? '' });
    return true;
  });

  const pedir = async (ruta: string, metodo = 'GET', d = steve) => {
    const r = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(d)}` },
    });
    return { status: r.status, body: await r.json() as { data?: unknown; error?: string } };
  };
  const abiertos = async (d = steve) => ((await pedir('/driver/servicios-abiertos', 'GET', d)).body.data ?? []) as Abierto[];
  const estado = async (id: string) =>
    (await prisma.driver.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

  const limpiar = async () => {
    const ids = (await prisma.order.findMany({ where: { businessId: negocio.id }, select: { id: true } })).map((o) => o.id);
    for (const id of ids) matching.cancelSearchRetry(`order:${id}`);
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { businessId: negocio.id } });
    const mandados = await prisma.errand.findMany({ where: { userId: cliente.id }, select: { id: true } });
    for (const e of mandados) matching.cancelSearchRetry(`errand:${e.id}`);
    await prisma.errand.deleteMany({ where: { userId: cliente.id } });
    const viajes = await prisma.trip.findMany({ where: { passengerId: cliente.id }, select: { id: true } });
    for (const t of viajes) matching.cancelSearchRetry(`trip:${t.id}`);
    await prisma.trip.deleteMany({ where: { passengerId: cliente.id } });
    await prisma.product.deleteMany({ where: { businessId: negocio.id } });
    await prisma.business.deleteMany({ where: { id: negocio.id } });
    await prisma.driverEarning.deleteMany({ where: { driverId: { in: [steve.id, otro.id] } } });
    await prisma.vehicle.deleteMany({ where: { driverId: { in: [steve.id, otro.id] } } });
    await prisma.driver.deleteMany({ where: { id: { in: [steve.id, otro.id] } } });
    await prisma.user.deleteMany({ where: { id: cliente.id } });
    server.close();
  };

  try {
    // Lo que Steve dejó abierto al cerrarse la app: un viaje esperando al
    // pasajero, un pedido yendo al local y un mandado con la compra hecha.
    await prisma.driver.update({ where: { id: steve.id }, data: { status: 'ON_TRIP' } });
    const viaje = await prisma.trip.create({
      data: {
        requestRef: `NXT-${m}`, passengerId: cliente.id, driverId: steve.id, serviceType: 'TAXI',
        status: 'ARRIVED', acceptedAt: new Date(), arrivedAt: new Date(),
        originAddress: 'Parque principal', originLat: P.lat, originLng: P.lng,
        destAddress: 'Universidad', destLat: P.lat + 0.01, destLng: P.lng + 0.01, estimatedFare: 6000,
      },
    });
    const p = await placeClientOrder(cliente.id, cliente.phone ?? '', {
      businessId: negocio.id, deliveryAddress: 'Cra. 9 #7-88',
      deliveryLat: P.lat + 0.004, deliveryLng: P.lng - 0.003, paymentMethod: 'efectivo',
      items: [{ productId: prod.id, quantity: 1 }],
    } as never);
    const pedido = await prisma.order.update({
      where: { id: p.id },
      data: { driverId: steve.id, driverName: 'Steve', status: 'DRIVER_TO_PICKUP', readyAt: new Date() },
    });
    const mandado = await prisma.errand.create({
      data: {
        requestRef: `NXE-${m}`, userId: cliente.id, driverId: steve.id, driverName: 'Steve',
        category: 'FOOD', description: 'Compra en La Casona', pickupAddress: 'La Casona',
        dropoffAddress: 'Casa', pickupLat: P.lat, pickupLng: P.lng, status: 'SHOPPING', acceptedAt: new Date(),
      },
    });

    console.log('\n── 1. Al abrir la app ve lo que dejó abierto ──');
    const lista = await abiertos();
    const de = (id: string) => lista.find((s) => s.id === id);
    comprobar('lista los tres servicios', lista.length === 3, JSON.stringify(lista.map((s) => s.id)));
    comprobar('el viaje se retoma esperando al pasajero', de(viaje.id)?.fase === 'en_espera', de(viaje.id)?.fase);
    comprobar('el pedido, yendo al local', de(pedido.id)?.fase === 'recogida', de(pedido.id)?.fase);
    comprobar('el mandado, en la compra', de(mandado.id)?.fase === 'en_espera', de(mandado.id)?.fase);
    comprobar('cada uno trae su oferta con su id (la app la mapea como siempre)',
      lista.every((s) => (s.oferta as { id?: string }).id === s.id));
    comprobar('el pedido trae el negocio de recogida en la oferta',
      typeof (de(pedido.id)?.oferta as { businessName?: string })?.businessName === 'string', JSON.stringify(de(pedido.id)?.oferta));
    comprobar('el viaje y el pedido se pueden soltar', de(viaje.id)?.puedeSoltar === true && de(pedido.id)?.puedeSoltar === true);
    comprobar('el mandado con la compra empezada NO, y dice qué hacer',
      de(mandado.id)?.puedeSoltar === false && /compra/.test(de(mandado.id)?.motivoNoSoltar ?? ''), de(mandado.id)?.motivoNoSoltar);
    comprobar('a otro conductor no le aparece nada de Steve', (await abiertos(otro)).length === 0);

    console.log('\n── 2. Lo que no se puede soltar ──');
    let r = await pedir(`/driver/servicios/errand/${mandado.id}/soltar`, 'POST');
    comprobar('soltar la compra empezada → 409 con el motivo', r.status === 409 && /compra/.test(r.body.error ?? ''), JSON.stringify(r));
    r = await pedir(`/driver/servicios/trip/${viaje.id}/soltar`, 'POST', otro);
    comprobar('soltar el viaje de OTRO → 404', r.status === 404, JSON.stringify(r));
    r = await pedir(`/driver/servicios/flete/${viaje.id}/soltar`, 'POST');
    comprobar('un tipo inventado → 400', r.status === 400);
    comprobar('y nada de eso tocó el viaje',
      (await prisma.trip.findUniqueOrThrow({ where: { id: viaje.id } })).driverId === steve.id);

    console.log('\n── 3. Suelta el pedido ──');
    ofertas.length = 0;
    r = await pedir(`/driver/servicios/order/${pedido.id}/soltar`, 'POST');
    comprobar('responde 200', r.status === 200, JSON.stringify(r));
    await esperar(800);
    const po = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
    comprobar('el pedido vuelve a «en preparación», sin repartidor',
      po.status === 'PREPARING' && po.driverId == null && po.driverName == null, `${po.status} ${po.driverId}`);
    comprobar('conserva que el local ya lo tenía listo', po.readyAt != null);
    comprobar('la oferta nueva le llega a OTRO repartidor',
      ofertas.some((o) => o.type === 'order_request' && o.id === pedido.id && o.driverId === otro.id), JSON.stringify(ofertas));
    comprobar('y NO a Steve, que acaba de soltarlo',
      !ofertas.some((o) => o.id === pedido.id && o.driverId === steve.id));
    comprobar('queda constancia en la línea de tiempo',
      (await prisma.orderEvent.count({ where: { orderId: pedido.id, actor: 'conductor', status: 'PREPARING' } })) === 1);
    comprobar('Steve sigue en viaje: le quedan el viaje y el mandado', (await estado(steve.id)) === 'ON_TRIP');
    r = await pedir(`/driver/servicios/order/${pedido.id}/soltar`, 'POST');
    comprobar('soltarlo dos veces → 404 (ya no es suyo)', r.status === 404);

    console.log('\n── 4. Suelta el viaje ──');
    ofertas.length = 0;
    r = await pedir(`/driver/servicios/trip/${viaje.id}/soltar`, 'POST');
    comprobar('responde 200', r.status === 200, JSON.stringify(r));
    await esperar(800);
    const vo = await prisma.trip.findUniqueOrThrow({ where: { id: viaje.id } });
    comprobar('el viaje vuelve a buscar, sin conductor ni hora de llegada',
      vo.status === 'SEARCHING' && vo.driverId == null && vo.arrivedAt == null, `${vo.status} ${vo.driverId}`);
    comprobar('la oferta nueva va a otro, no a Steve',
      ofertas.some((o) => o.type === 'trip_request' && o.id === viaje.id && o.driverId === otro.id)
      && !ofertas.some((o) => o.id === viaje.id && o.driverId === steve.id), JSON.stringify(ofertas));

    console.log('\n── 5. El mandado solo se retoma, y al terminar queda libre ──');
    comprobar('le queda solo el mandado', (await abiertos()).map((s) => s.id).join() === mandado.id);
    await prisma.errand.update({ where: { id: mandado.id }, data: { status: 'DELIVERED' } });
    const { liberarConductorSiNoTieneMas } = await import('../src/lib/liberar-conductor');
    await liberarConductorSiNoTieneMas(steve.id);
    comprobar('sin nada abierto vuelve a EN LÍNEA', (await estado(steve.id)) === 'ONLINE');
    comprobar('y la lista queda vacía', (await abiertos()).length === 0);

    console.log('\n── 6. Soltar lo último lo deja en línea al instante ──');
    await prisma.driver.update({ where: { id: steve.id }, data: { status: 'ON_TRIP' } });
    const m2 = await prisma.errand.create({
      data: {
        requestRef: `NXE2-${m}`, userId: cliente.id, driverId: steve.id, driverName: 'Steve',
        category: 'FOOD', description: 'Otra compra', pickupAddress: 'La Casona',
        dropoffAddress: 'Casa', pickupLat: P.lat, pickupLng: P.lng, status: 'ACCEPTED', acceptedAt: new Date(),
      },
    });
    ofertas.length = 0;
    r = await pedir(`/driver/servicios/errand/${m2.id}/soltar`, 'POST');
    comprobar('soltar un mandado sin empezar → 200', r.status === 200, JSON.stringify(r));
    const e2 = await prisma.errand.findUniqueOrThrow({ where: { id: m2.id } });
    comprobar('vuelve a buscar sin mandadero', e2.status === 'SEARCHING' && e2.driverId == null && e2.driverName == null);
    comprobar('y Steve queda EN LÍNEA', (await estado(steve.id)) === 'ONLINE');
    // Aquí Steve YA está en línea y es el más cercano: es el caso en que la
    // exclusión importa. Sin ella, la búsqueda nueva se la ofrecía a él.
    await esperar(800);
    comprobar('la búsqueda nueva va a Otro aunque Steve esté en línea y más cerca',
      ofertas.some((o) => o.type === 'errand_request' && o.id === m2.id && o.driverId === otro.id)
      && !ofertas.some((o) => o.id === m2.id && o.driverId === steve.id), JSON.stringify(ofertas.filter((o) => o.id === m2.id)));
  } finally {
    await limpiar();
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
