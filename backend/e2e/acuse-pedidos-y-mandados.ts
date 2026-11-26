/**
 * El repartidor cierra un PEDIDO o un MANDADO y el servidor le contesta.
 *
 * El fallo que motiva esto: «entregado» viajaba solo por WebSocket, sin acuse.
 * Con el socket caído el mensaje se descartaba en silencio y la app enseñaba su
 * resumen igual: no se liquidaba el domicilio, el cliente seguía viendo «en
 * camino» y el repartidor quedaba ON_TRIP — fuera del despacho. Es el defecto
 * que el viaje urbano corrigió con `POST /driver/trips/:id/status`
 * (ver `cierre-viaje.ts`); aquí se comprueba el mismo arreglo para los otros
 * dos servicios, GOLPEANDO LAS RUTAS POR HTTP (ahí viven la autenticación, la
 * validación del cuerpo y la traducción de cada error a su código).
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/acuse-pedidos-y-mandados.ts
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'net';
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

interface Resp { status: number; body: { success?: boolean; error?: string; code?: string; data?: Record<string, { status?: string }> } }

async function main(): Promise<void> {
  exigirBaseLocal('acuse-pedidos-y-mandados');
  const { placeClientOrder } = await import('../src/services/client.service');
  const { createBusinessProduct, updateBusinessLocation } = await import('../src/services/business.service');
  const driverRoutes = (await import('../src/routes/driver.routes')).default;

  const app = express();
  app.use(express.json());
  app.use('/driver', driverRoutes);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const m = `e2eacuse-${Date.now()}`;
  const negocio = await prisma.business.create({
    data: {
      name: `${m} Local`, ownerName: 'Dueño', category: 'RESTAURANT', address: 'Calle 5 #4-20',
      phone: tel('21'), token: `tok-${m}`, acceptingOrders: true, deliveryFee: 3000, etaMinutes: 20,
    },
  });
  await updateBusinessLocation(negocio.id, P.lat, P.lng);
  const prod = await createBusinessProduct(negocio.id, { name: 'Arepa', price: 9000, category: 'Arepas' } as never) as { id: string };
  const cliente = await prisma.user.create({ data: { name: 'Cliente', phone: tel('22') } });
  const nuevoConductor = (nombre: string, p: string) => prisma.driver.create({
    data: {
      name: nombre, phone: tel(p), documentType: 'CC', documentNumber: `${p}${Date.now() % 1e7}`,
      isVerified: true, status: 'ON_TRIP',
    },
  });
  const repartidor = await nuevoConductor('Moto', '23');
  const ajeno = await nuevoConductor('Otro', '24');
  const token = (d: { id: string; phone: string }) =>
    jwt.sign({ driverId: d.id, phone: d.phone }, JWT_SECRET, { expiresIn: '1h' });
  const tok = token(repartidor);
  const tokAjeno = token(ajeno);

  const limpiar = async (): Promise<void> => {
    const ids = (await prisma.order.findMany({ where: { businessId: negocio.id }, select: { id: true } })).map((o) => o.id);
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { businessId: negocio.id } });
    await prisma.errand.deleteMany({ where: { userId: cliente.id } });
    await prisma.product.deleteMany({ where: { businessId: negocio.id } });
    await prisma.business.deleteMany({ where: { id: negocio.id } });
    await prisma.driverEarning.deleteMany({ where: { driverId: { in: [repartidor.id, ajeno.id] } } });
    await prisma.driver.deleteMany({ where: { id: { in: [repartidor.id, ajeno.id] } } });
    await prisma.user.deleteMany({ where: { id: cliente.id } });
    server.close();
  };

  const post = async (ruta: string, cuerpo: unknown, t: string | null = tok): Promise<Resp> => {
    const r = await fetch(`${base}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: JSON.stringify(cuerpo),
    });
    return { status: r.status, body: await r.json() as Resp['body'] };
  };
  const servicios = async (): Promise<number> => {
    await esperar(350); // `recordCompletedTrip` escribe sin esperar
    const filas = await prisma.driverEarning.findMany({ where: { driverId: repartidor.id } });
    return filas.reduce((s, f) => s + f.tripCount, 0);
  };
  const netoTotal = async (): Promise<number> => {
    const filas = await prisma.driverEarning.findMany({ where: { driverId: repartidor.id } });
    return filas.reduce((s, f) => s + Number(f.netEarning), 0);
  };
  /** La liquidación que la respuesta le da al resumen del repartidor debe ser
   *  la que quedó en su billetera: el resumen y la billetera no pueden discrepar. */
  const liquidacionCuadra = (body: Resp['body'], netoAntes: number, netoDespues: number) => {
    const s = (body.data as Record<string, unknown> | undefined)?.['settlement'] as
      { finalFare?: number; netEarning?: number; commission?: number } | undefined;
    return !!s && (s.finalFare ?? 0) > 0
      && (s.netEarning ?? -1) + (s.commission ?? -1) === s.finalFare
      && Math.abs((s.netEarning ?? 0) - (netoDespues - netoAntes)) < 1;
  };
  const estadoConductor = async () =>
    (await prisma.driver.findUniqueOrThrow({ where: { id: repartidor.id } })).status;
  const enViaje = () => prisma.driver.update({ where: { id: repartidor.id }, data: { status: 'ON_TRIP' } });

  /** Pedido ya aceptado por el local y asignado al repartidor. */
  const nuevoPedido = async () => {
    const p = await placeClientOrder(cliente.id, cliente.phone ?? '', {
      businessId: negocio.id, deliveryAddress: 'Pje. la Curia #6',
      deliveryLat: P.lat + 0.004, deliveryLng: P.lng - 0.003, paymentMethod: 'efectivo',
      items: [{ productId: prod.id, quantity: 1 }],
    } as never);
    return prisma.order.update({
      where: { id: p.id }, data: { driverId: repartidor.id, status: 'DRIVER_TO_PICKUP' },
    });
  };
  const pedidoEnBase = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });

  /** Mandado ya aceptado por el repartidor. */
  const nuevoMandado = () => prisma.errand.create({
    data: {
      requestRef: `MND-${Math.floor(100000 + Math.random() * 899999)}`,
      userId: cliente.id, driverId: repartidor.id, category: 'PHARMACY',
      description: 'Acetaminofén', pickupAddress: 'Droguería', dropoffAddress: 'Casa',
      pickupLat: P.lat, pickupLng: P.lng, serviceFee: 6000, purchaseBudget: 20000,
      status: 'ACCEPTED', deliveryPin: '4821',
    },
  });
  const mandadoEnBase = (id: string) => prisma.errand.findUniqueOrThrow({ where: { id } });

  try {
    console.log('\n── 1. Pedido: quién puede y con qué ──');
    const p1 = await nuevoPedido();
    const ruta1 = `/driver/orders/${p1.id}/status`;
    comprobar('sin sesión no entra (401)', (await post(ruta1, { status: 'at_pickup' }, null)).status === 401);
    const mal = await post(ruta1, { status: 'cancelled' });
    comprobar('un estado que no es del repartidor se rechaza (400)', mal.status === 400, `${mal.status}`);
    const deOtro = await post(ruta1, { status: 'at_pickup' }, tokAjeno);
    comprobar('otro repartidor no lo mueve (404)', deOtro.status === 404, `${deOtro.status}`);
    comprobar('y el pedido no se movió', (await pedidoEnBase(p1.id)).status === 'DRIVER_TO_PICKUP');

    console.log('\n── 2. Pedido: el ciclo entero, con respuesta en cada paso ──');
    const llego = await post(ruta1, { status: 'at_pickup' });
    comprobar('«llegué al local» responde 200 con el pedido', llego.status === 200
      && llego.body.data?.['order']?.status === 'atPickup', JSON.stringify(llego.body).slice(0, 160));
    const sinPin = await post(ruta1, { status: 'in_transit' });
    comprobar('recoger sin el PIN del local: 400 marcado como PIN', sinPin.status === 400
      && sinPin.body.code === 'custody_pin', JSON.stringify(sinPin.body));
    comprobar('y el pedido sigue en el local', (await pedidoEnBase(p1.id)).status === 'AT_PICKUP');
    const recogio = await post(ruta1, { status: 'in_transit', pin: p1.pickupPin });
    comprobar('con el PIN, «recogido» responde 200', recogio.status === 200
      && recogio.body.data?.['order']?.status === 'inTransit', JSON.stringify(recogio.body).slice(0, 160));

    const antes = await servicios();
    const pinMalo = await post(ruta1, { status: 'delivered', pin: '0000' === p1.deliveryPin ? '1111' : '0000' });
    comprobar('entregar con un PIN equivocado: 400', pinMalo.status === 400 && pinMalo.body.code === 'custody_pin');
    comprobar('no entregó ni liquidó nada', (await pedidoEnBase(p1.id)).status === 'IN_TRANSIT'
      && (await servicios()) === antes);
    comprobar('y el repartidor sigue en viaje', (await estadoConductor()) === 'ON_TRIP');

    const netoP1 = await netoTotal();
    const entrego = await post(ruta1, { status: 'delivered', pin: p1.deliveryPin });
    comprobar('con el PIN del cliente, «entregado» responde 200', entrego.status === 200
      && entrego.body.data?.['order']?.status === 'delivered', JSON.stringify(entrego.body).slice(0, 160));
    comprobar('el pedido queda DELIVERED', (await pedidoEnBase(p1.id)).status === 'DELIVERED');
    comprobar('se liquidó UN servicio', (await servicios()) === antes + 1, `${await servicios()} vs ${antes + 1}`);
    comprobar('y la respuesta trae la MISMA liquidación que la billetera (resumen)',
      liquidacionCuadra(entrego.body, netoP1, await netoTotal()), JSON.stringify(entrego.body).slice(0, 220));
    comprobar('y el repartidor vuelve al despacho (ONLINE)', (await estadoConductor()) === 'ONLINE',
      await estadoConductor());

    console.log('\n── 3. Pedido: el reintento de una respuesta que se perdió ──');
    const otraVez = await post(ruta1, { status: 'delivered', pin: p1.deliveryPin });
    comprobar('repetir «entregado» responde 200, no un error', otraVez.status === 200
      && otraVez.body.data?.['order']?.status === 'delivered', JSON.stringify(otraVez.body).slice(0, 160));
    comprobar('y NO liquida dos veces', (await servicios()) === antes + 1, `${await servicios()}`);

    console.log('\n── 4. Pedido: cuatro «entregado» a la vez ──');
    await enViaje();
    const p2 = await nuevoPedido();
    await prisma.order.update({ where: { id: p2.id }, data: { status: 'IN_TRANSIT' } });
    const base4 = await servicios();
    const rafaga = await Promise.all([1, 2, 3, 4].map(() =>
      post(`/driver/orders/${p2.id}/status`, { status: 'delivered', pin: p2.deliveryPin })));
    comprobar('los cuatro reciben 200', rafaga.every((r) => r.status === 200), rafaga.map((r) => r.status).join(','));
    comprobar('y se liquida UNA vez', (await servicios()) === base4 + 1, `${await servicios()} vs ${base4 + 1}`);

    console.log('\n── 5. Pedido que el cliente canceló ──');
    await enViaje();
    const p3 = await nuevoPedido();
    await prisma.order.update({ where: { id: p3.id }, data: { status: 'CANCELLED' } });
    const base5 = await servicios();
    const cancelado = await post(`/driver/orders/${p3.id}/status`, { status: 'delivered', pin: 'no-es' });
    comprobar('responde 409 diciendo que se canceló (no «PIN incorrecto»)', cancelado.status === 409
      && /cancelado/.test(cancelado.body.error ?? ''), JSON.stringify(cancelado.body));
    comprobar('no lo revive ni lo paga', (await pedidoEnBase(p3.id)).status === 'CANCELLED'
      && (await servicios()) === base5);

    console.log('\n── 6. Mandado: quién puede y con qué ──');
    const m1 = await nuevoMandado();
    const rutaM = `/driver/errands/${m1.id}/status`;
    comprobar('sin sesión no entra (401)', (await post(rutaM, { status: 'shopping' }, null)).status === 401);
    const mOtro = await post(rutaM, { status: 'shopping' }, tokAjeno);
    comprobar('otro mandadero no lo mueve (403)', mOtro.status === 403, `${mOtro.status}`);
    const mNo = await post('/driver/errands/no-existe/status', { status: 'shopping' });
    comprobar('un mandado que no existe: 404', mNo.status === 404, `${mNo.status}`);
    const mCancelar = await post(rutaM, { status: 'cancelled' });
    comprobar('por aquí no se puede soltar el mandado (400)', mCancelar.status === 400, `${mCancelar.status}`);
    comprobar('y sigue como estaba', (await mandadoEnBase(m1.id)).status === 'ACCEPTED');

    console.log('\n── 7. Mandado: el ciclo entero ──');
    const comprando = await post(rutaM, { status: 'shopping' });
    comprobar('«estoy comprando» responde 200', comprando.status === 200
      && comprando.body.data?.['errand']?.status === 'shopping', JSON.stringify(comprando.body).slice(0, 160));
    const negativo = await post(rutaM, { status: 'on_the_way', actualCost: -500 });
    comprobar('«voy en camino» responde 200', negativo.status === 200
      && negativo.body.data?.['errand']?.status === 'on_the_way');
    comprobar('un costo negativo no se guarda', (await mandadoEnBase(m1.id)).actualCost == null,
      `${(await mandadoEnBase(m1.id)).actualCost}`);
    await post(rutaM, { status: 'on_the_way', actualCost: 18500 });
    comprobar('el costo real de la compra queda guardado', (await mandadoEnBase(m1.id)).actualCost === 18500);

    const base7 = await servicios();
    const mSinPin = await post(rutaM, { status: 'delivered' });
    comprobar('entregar sin el PIN del cliente: 400 marcado como PIN', mSinPin.status === 400
      && mSinPin.body.code === 'custody_pin', JSON.stringify(mSinPin.body));
    comprobar('no entregó ni liquidó', (await mandadoEnBase(m1.id)).status === 'ON_THE_WAY'
      && (await servicios()) === base7);
    await enViaje();
    const netoM1 = await netoTotal();
    const mEntrego = await post(rutaM, { status: 'delivered', pin: '4821' });
    comprobar('con el PIN, «entregado» responde 200', mEntrego.status === 200
      && mEntrego.body.data?.['errand']?.status === 'delivered', JSON.stringify(mEntrego.body).slice(0, 160));
    comprobar('se liquidó UN servicio', (await servicios()) === base7 + 1, `${await servicios()} vs ${base7 + 1}`);
    comprobar('y la respuesta trae la MISMA liquidación que la billetera (resumen)',
      liquidacionCuadra(mEntrego.body, netoM1, await netoTotal()), JSON.stringify(mEntrego.body).slice(0, 220));
    comprobar('y el mandadero vuelve al despacho (ONLINE)', (await estadoConductor()) === 'ONLINE',
      await estadoConductor());

    const mOtraVez = await post(rutaM, { status: 'delivered' });
    comprobar('repetir «entregado» (aun sin PIN) responde 200', mOtraVez.status === 200
      && mOtraVez.body.data?.['errand']?.status === 'delivered', JSON.stringify(mOtraVez.body).slice(0, 160));
    comprobar('y NO liquida dos veces', (await servicios()) === base7 + 1);

    console.log('\n── 8. Mandado que el cliente canceló ──');
    const m2 = await nuevoMandado();
    await prisma.errand.update({ where: { id: m2.id }, data: { status: 'CANCELLED' } });
    const mCancelado = await post(`/driver/errands/${m2.id}/status`, { status: 'delivered', pin: '4821' });
    comprobar('responde 409 diciendo que se canceló', mCancelado.status === 409
      && /cancelado/.test(mCancelado.body.error ?? ''), JSON.stringify(mCancelado.body));
    comprobar('y no lo revive', (await mandadoEnBase(m2.id)).status === 'CANCELLED');

    console.log('\n── 9. Con otro servicio abierto, entregar el mandado NO lo suelta al despacho ──');
    await enViaje();
    const m3 = await nuevoMandado();
    const p4 = await nuevoPedido(); // el siguiente, ya aceptado (encadenado)
    const r9 = await post(`/driver/errands/${m3.id}/status`, { status: 'delivered', pin: '4821' });
    comprobar('el mandado se entrega', r9.status === 200);
    comprobar('pero sigue ON_TRIP: le queda el pedido', (await estadoConductor()) === 'ON_TRIP',
      await estadoConductor());
    await prisma.order.update({ where: { id: p4.id }, data: { status: 'CANCELLED' } });
  } finally {
    await limpiar();
  }
  console.log(fallos === 0 ? '\nTODO EN VERDE' : `\n${fallos} FALLO(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); process.exit(1); });
