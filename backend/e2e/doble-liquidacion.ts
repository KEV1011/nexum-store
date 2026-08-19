/**
 * E2E contra PostgreSQL real: ¿se puede liquidar dos veces el mismo servicio?
 *
 * `recordCompletedTrip` hace `increment` sobre el acumulado del día del
 * conductor, así que no es idempotente ni puede serlo. Si la transición a
 * COMPLETED/DELIVERED no está guardada, un segundo mensaje —doble toque,
 * reconexión del WebSocket que reenvía, reintento tras un `ack` perdido— le
 * paga el mismo servicio dos veces.
 *
 * Se ejecuta contra una base REAL (no entra en `npm test`, que no tiene BD):
 *   DATABASE_URL=postgresql://... npx tsx e2e/doble-liquidacion.ts
 */
import { prisma } from '../src/lib/prisma';
import {
  updateClientTripStatus, updateOrderStatusByDriver, acceptClientOrder,
} from '../src/services/client.service';
import { updateErrandStatus, acceptClientErrand } from '../src/services/errand.service';
import { getOrCreateReferralCode, redeemReferral } from '../src/services/promo.service';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle: string): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

function hoy(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function ganancia(driverId: string): Promise<{ bruto: number; viajes: number }> {
  const e = await prisma.driverEarning.findUnique({
    where: { driverId_date: { driverId, date: hoy() } },
  });
  return { bruto: e?.grossFare ?? 0, viajes: e?.tripCount ?? 0 };
}

/** `recordCompletedTrip` escribe sin await (fire-and-forget). */
const respirar = (): Promise<void> => new Promise((r) => setTimeout(r, 400));

async function main(): Promise<void> {
  console.log('\n═══ Doble liquidación: viaje urbano, pedido y mandado ═══\n');

  const driver = await prisma.driver.create({
    data: {
      phone: `+5730000${Math.floor(10000 + Math.random() * 89999)}`,
      name: 'Conductor Auditoría',
      status: 'ON_TRIP',
      isVerified: true,
    },
  });
  const user = await prisma.user.create({
    data: { phone: `+5731111${Math.floor(10000 + Math.random() * 89999)}`, name: 'Cliente Auditoría' },
  });

  // ── 1. VIAJE URBANO ────────────────────────────────────────────────────────
  console.log('1. Viaje urbano');
  const trip = await prisma.trip.create({
    data: {
      requestRef: `AUD-${Date.now()}`,
      passengerId: user.id,
      driverId: driver.id,
      serviceType: 'TAXI',
      status: 'IN_PROGRESS',
      originAddress: 'A', destAddress: 'B',
      originLat: 7.3754, originLng: -72.6486,
      destLat: 7.3821, destLng: -72.6512,
      estimatedFare: 10000, distanceKm: 5, etaMinutes: 15,
    },
  });

  const antes = await ganancia(driver.id);
  await updateClientTripStatus(trip.id, 'completed');
  await respirar();
  const tras1 = await ganancia(driver.id);
  const pagoUnico = tras1.bruto - antes.bruto;
  comprobar('la primera vez liquida', pagoUnico > 0, `no se pagó nada (${pagoUnico})`);

  await updateClientTripStatus(trip.id, 'completed');
  await respirar();
  const tras2 = await ganancia(driver.id);
  comprobar(
    'la SEGUNDA vez no vuelve a pagar',
    tras2.bruto === tras1.bruto && tras2.viajes === tras1.viajes,
    `pagó otra vez: ${tras1.bruto} → ${tras2.bruto} (viajes ${tras1.viajes} → ${tras2.viajes})`,
  );

  const tripFinal = await prisma.trip.findUnique({ where: { id: trip.id } });
  comprobar('el viaje queda COMPLETED', tripFinal?.status === 'COMPLETED', `${tripFinal?.status}`);

  // Un "completado" tardío no debe revivir un viaje CANCELADO ni pagarlo.
  const cancelado = await prisma.trip.create({
    data: {
      requestRef: `AUD-C-${Date.now()}`,
      passengerId: user.id, driverId: driver.id,
      serviceType: 'TAXI', status: 'CANCELLED',
      originAddress: 'A', destAddress: 'B',
      originLat: 7.3754, originLng: -72.6486, destLat: 7.38, destLng: -72.65,
      estimatedFare: 9000, distanceKm: 4, etaMinutes: 12,
    },
  });
  const antesCancel = await ganancia(driver.id);
  await updateClientTripStatus(cancelado.id, 'completed');
  await respirar();
  const trasCancel = await ganancia(driver.id);
  const vuelto = await prisma.trip.findUnique({ where: { id: cancelado.id } });
  comprobar('un cancelado NO revive', vuelto?.status === 'CANCELLED', `quedó ${vuelto?.status}`);
  comprobar('un cancelado NO se paga', trasCancel.bruto === antesCancel.bruto,
    `${antesCancel.bruto} → ${trasCancel.bruto}`);

  // ── 2. PEDIDO ──────────────────────────────────────────────────────────────
  console.log('\n2. Pedido a un negocio');
  const biz = await prisma.business.create({
    data: {
      name: 'Negocio Auditoría', ownerName: 'Dueño', phone: `+5732222${Math.floor(10000 + Math.random() * 89999)}`,
      address: 'Calle 1', category: 'RESTAURANT', token: `aud-${Date.now()}`,
    },
  });
  const order = await prisma.order.create({
    data: {
      orderRef: `AUDO-${Date.now()}`,
      businessId: biz.id, userId: user.id, driverId: driver.id,
      status: 'IN_TRANSIT',
      deliveryAddress: 'Calle 2', subtotal: 30000, deliveryFee: 6000, total: 36000,
      deliveryPin: '1234',
    },
  });

  const antesPed = await ganancia(driver.id);
  await updateOrderStatusByDriver(order.id, driver.id, 'delivered', '1234');
  await respirar();
  const tras1Ped = await ganancia(driver.id);
  comprobar('la primera entrega liquida', tras1Ped.bruto > antesPed.bruto,
    `no se pagó (${antesPed.bruto} → ${tras1Ped.bruto})`);

  await updateOrderStatusByDriver(order.id, driver.id, 'delivered', '1234');
  await respirar();
  const tras2Ped = await ganancia(driver.id);
  comprobar(
    'la SEGUNDA entrega no vuelve a pagar',
    tras2Ped.bruto === tras1Ped.bruto,
    `pagó otra vez: ${tras1Ped.bruto} → ${tras2Ped.bruto}`,
  );

  // ── 3. MANDADO ─────────────────────────────────────────────────────────────
  console.log('\n3. Mandado');
  const errand = await prisma.errand.create({
    data: {
      requestRef: `AUDE-${Date.now()}`,
      userId: user.id, driverId: driver.id,
      category: 'GROCERIES', description: 'Auditoría',
      pickupAddress: 'A', dropoffAddress: 'B',
      serviceFee: 8000, status: 'ON_THE_WAY',
      deliveryPin: '5678', updatedAt: new Date(),
    },
  });

  const antesMan = await ganancia(driver.id);
  await updateErrandStatus(errand.id, 'delivered', undefined, '5678');
  await respirar();
  const tras1Man = await ganancia(driver.id);
  comprobar('la primera entrega liquida', tras1Man.bruto > antesMan.bruto,
    `no se pagó (${antesMan.bruto} → ${tras1Man.bruto})`);

  const segundo = await updateErrandStatus(errand.id, 'delivered', undefined, '5678');
  await respirar();
  const tras2Man = await ganancia(driver.id);
  comprobar('la SEGUNDA entrega no vuelve a pagar', tras2Man.bruto === tras1Man.bruto,
    `pagó otra vez: ${tras1Man.bruto} → ${tras2Man.bruto}`);
  comprobar('y lo dice devolviendo null', segundo === null, `devolvió ${segundo === null ? 'null' : 'un DTO'}`);

  // ── 4. CONCURRENCIA REAL: dos mensajes a la vez ────────────────────────────
  console.log('\n4. Dos "completado" simultáneos (la carrera de verdad)');
  const trip2 = await prisma.trip.create({
    data: {
      requestRef: `AUD-R-${Date.now()}`,
      passengerId: user.id, driverId: driver.id,
      serviceType: 'TAXI', status: 'IN_PROGRESS',
      originAddress: 'A', destAddress: 'B',
      originLat: 7.3754, originLng: -72.6486, destLat: 7.38, destLng: -72.65,
      estimatedFare: 12000, distanceKm: 6, etaMinutes: 18,
    },
  });
  const antesR = await ganancia(driver.id);
  // Sin await entre medias: las dos salen a la vez, que es lo que pasa con un
  // doble toque o una reconexión que reenvía.
  await Promise.all([
    updateClientTripStatus(trip2.id, 'completed'),
    updateClientTripStatus(trip2.id, 'completed'),
  ]);
  await respirar();
  const trasR = await ganancia(driver.id);
  comprobar(
    'dos a la vez liquidan UNA sola',
    trasR.viajes === antesR.viajes + 1,
    `se contaron ${trasR.viajes - antesR.viajes} liquidaciones`,
  );


  // ── 5. DOS CONDUCTORES ACEPTAN EL MISMO SERVICIO ───────────────────────────
  console.log('\n5. Dos conductores aceptan a la vez');
  const driver2 = await prisma.driver.create({
    data: {
      phone: `+5730000${Math.floor(10000 + Math.random() * 89999)}`,
      name: 'Conductor Rival', status: 'ONLINE', isVerified: true,
    },
  });

  const mandadoLibre = await prisma.errand.create({
    data: {
      requestRef: `AUDE2-${Date.now()}`, userId: user.id,
      category: 'GROCERIES', description: 'Carrera de aceptación',
      pickupAddress: 'A', dropoffAddress: 'B',
      serviceFee: 8000, status: 'SEARCHING',
      deliveryPin: '9999', updatedAt: new Date(),
    },
  });
  const [a1, a2] = await Promise.all([
    acceptClientErrand(mandadoLibre.id, 'Conductor Auditoría', driver.phone, driver.id),
    acceptClientErrand(mandadoLibre.id, 'Conductor Rival', driver2.phone, driver2.id),
  ]);
  const ganadores = [a1, a2].filter((x) => x !== null).length;
  comprobar('solo UNO se lleva el mandado', ganadores === 1, `lo aceptaron ${ganadores}`);

  const pedidoLibre = await prisma.order.create({
    data: {
      orderRef: `AUDO2-${Date.now()}`, businessId: biz.id, userId: user.id,
      status: 'PREPARING',
      deliveryAddress: 'Calle 2', subtotal: 20000, deliveryFee: 5000, total: 25000,
      deliveryPin: '4321',
    },
  });
  const [b1, b2] = await Promise.all([
    acceptClientOrder(pedidoLibre.id, 'Conductor Auditoría', driver.phone, driver.id),
    acceptClientOrder(pedidoLibre.id, 'Conductor Rival', driver2.phone, driver2.id),
  ]);
  const ganadoresP = [b1, b2].filter((x) => x !== null).length;
  comprobar('solo UNO se lleva el pedido', ganadoresP === 1, `lo aceptaron ${ganadoresP}`);

  // ── 6. REFERIDO CANJEADO DOS VECES ─────────────────────────────────────────
  console.log('\n6. Doble canje de un código de referido');
  const invita = await prisma.user.create({
    data: { phone: `+5734444${Math.floor(10000 + Math.random() * 89999)}`, name: 'Quien invita' },
  });
  const codigo = await getOrCreateReferralCode(invita.id);
  const invitado = await prisma.user.create({
    data: { phone: `+5735555${Math.floor(10000 + Math.random() * 89999)}`, name: 'Invitado' },
  });
  const canjes = await Promise.allSettled([
    redeemReferral(invitado.id, codigo),
    redeemReferral(invitado.id, codigo),
  ]);
  const ok = canjes.filter((c) => c.status === 'fulfilled').length;
  comprobar('solo UN canje prospera', ok === 1, `prosperaron ${ok}`);
  const cupones = await prisma.promoRedemption.count({ where: { userId: invitado.id } }).catch(() => -1);
  if (cupones >= 0) {
    comprobar('no se regalan cupones de más', cupones <= 1, `${cupones} cupones`);
  }

  console.log(`\n${fallos === 0 ? '✓ TODO EN VERDE' : `✗ ${fallos} COMPROBACIONES FALLIDAS`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('ERROR:', e);
  await prisma.$disconnect();
  process.exit(1);
});
