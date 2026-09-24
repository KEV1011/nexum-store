/**
 * La encomienda viaja en la bodega del bus de pasajeros, contra PostgreSQL real.
 *
 * Es el caso que una cooperativa intermunicipal mira con más interés que el
 * pasaje: el bus ya va, la bodega va vacía y el costo del viaje ya está
 * hundido, así que cada caja es margen casi puro.
 *
 * Lo que solo se ve ejecutando: que subir la caja a la salida CREE el remito
 * con su consecutivo, que la comprobación de ruta impida meterla en el bus
 * equivocado, y que arrancar el bus mueva el pedido del cliente a «en tránsito
 * intermunicipal». Cada pieza compila perfectamente por separado mientras la
 * cadena está rota.
 */
import { prisma } from '../src/lib/prisma';
import { publishPooledTrip, departPooledTrip } from '../src/services/intercity-pool.service';
import {
  adjuntarEncomiendaASalida,
  listarEncomiendasDeSalida,
  soltarEncomienda,
} from '../src/services/encomiendas.service';

let fallos = 0;
let ok = 0;

function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

async function motivoDe(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return ''; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

async function main() {
  const suf = Math.floor(10000 + Math.random() * 89999);

  const op = await prisma.operator.create({
    data: {
      legalName: 'Cooperativa del Bus', nit: `NIT-${Date.now()}`,
      type: 'INTERCITY', status: 'ACTIVE', isVerified: true,
      contactName: 'Gerente', contactPhone: '+573001112233', city: 'cucuta',
    },
  });
  const driver = await prisma.driver.create({
    data: {
      name: 'Conductor Bus', phone: `+5730055${suf}`,
      isVerified: true, status: 'ONLINE', operatorId: op.id,
      lastLat: 7.8939, lastLng: -72.5078,
    },
  });
  const user = await prisma.user.create({
    data: { name: 'Compradora', phone: `+5730066${suf}` },
  });
  const negocio = await prisma.business.create({
    data: {
      name: 'Mayorista Alejandría', category: 'OTHER',
      address: 'Av 6 #8-56', token: `tok${suf}`, citySlug: 'cucuta',
    },
  });
  const producto = await prisma.product.create({
    data: { businessId: negocio.id, name: 'Camiseta', price: 12000 },
  });

  /** Un pedido intermunicipal listo para subir a un despacho. */
  async function pedido(destino: string) {
    return prisma.order.create({
      data: {
        orderRef: `ORD-${Math.floor(100000 + Math.random() * 899999)}`,
        userId: user.id, businessId: negocio.id, status: 'PREPARING',
        deliveryAddress: 'Terminal de destino',
        subtotal: 36000, deliveryFee: 0, total: 36000,
        isIntercity: true, originCitySlug: 'cucuta', destCitySlug: destino,
        lines: { create: [{ productId: producto.id, productName: 'Camiseta', quantity: 3, unitPrice: 12000, subtotal: 36000 }] },
      },
    });
  }

  const manana = new Date(Date.now() + 24 * 3600 * 1000);
  const baseSalida = {
    vehicleDescription: 'Bus Marcopolo', departureTime: manana.toISOString(),
    totalSeats: 1, farePerSeat: 45000, seatType: 'BUS' as const,
    seatConfig: { izquierda: 2, derecha: 2, filas: 10, fondoCorrido: 4 },
  };

  // ── 1. Subir la caja a la bodega del bus ────────────────────────────────
  console.log('\n[1] Salida Cúcuta → Bucaramanga, con una encomienda en la bodega');
  const salida = await publishPooledTrip(driver.id, driver.name, driver.phone, {
    ...baseSalida, origin: 'cucuta', destination: 'bucaramanga',
  } as never, { operatorId: op.id, licensedOperator: true });

  const caja = await pedido('bucaramanga');
  const remito = await adjuntarEncomiendaASalida(op.id, caja.id, salida.id);
  console.log(`    remito ${remito.code} · ${remito.bultos} bultos`);
  check(/^REM-\d{4}$/.test(remito.code), 'se crea el remito con su consecutivo', remito.code);
  check(remito.bultos === 3, 'los bultos salen de las líneas del pedido', remito.bultos);

  const enBodega = await listarEncomiendasDeSalida(op.id, salida.id);
  check(enBodega.length === 1, 'la salida la lista en su bodega', enBodega.length);
  check(enBodega[0]?.clientCity === 'bucaramanga', 'con la ciudad de destino', enBodega[0]?.clientCity);

  // ── 2. La ruta equivocada se rechaza ────────────────────────────────────
  console.log('\n[2] Meter en ese bus una caja que va a Bogotá');
  const cajaBogota = await pedido('bogota');
  const m2 = await motivoDe(() => adjuntarEncomiendaASalida(op.id, cajaBogota.id, salida.id));
  console.log(`    respondió: "${m2}"`);
  check(
    /bucaramanga/i.test(m2) && /bogota/i.test(m2),
    'se rechaza diciendo a dónde va el bus y a dónde la caja',
    m2,
  );

  // ── 3. La misma caja no va en dos buses ─────────────────────────────────
  console.log('\n[3] Subir la misma caja a otra salida');
  const salida2 = await publishPooledTrip(driver.id, driver.name, driver.phone, {
    ...baseSalida, origin: 'cucuta', destination: 'bucaramanga',
  } as never, { operatorId: op.id, licensedOperator: true });
  const m3 = await motivoDe(() => adjuntarEncomiendaASalida(op.id, caja.id, salida2.id));
  console.log(`    respondió: "${m3}"`);
  check(m3 !== '', 'una caja no puede ir en dos buses a la vez', m3);

  // ── 4. La bodega de otra empresa no se toca ─────────────────────────────
  console.log('\n[4] Otra empresa intenta usar esa salida');
  const otraOp = await prisma.operator.create({
    data: {
      legalName: 'Cooperativa Vecina', nit: `NIT-V${Date.now()}`,
      type: 'INTERCITY', status: 'ACTIVE', isVerified: true,
      contactName: 'Otro', contactPhone: '+573004445566', city: 'cucuta',
    },
  });
  const cajaOtra = await pedido('bucaramanga');
  const m4 = await motivoDe(() => adjuntarEncomiendaASalida(otraOp.id, cajaOtra.id, salida.id));
  console.log(`    respondió: "${m4}"`);
  check(/no existe o no es de tu empresa/i.test(m4), 'la salida ajena se rechaza', m4);

  // ── 5. El bus arranca: la caja entra en tránsito ────────────────────────
  console.log('\n[5] El bus sale');
  await departPooledTrip(driver.id, salida.id);
  const trasSalir = await prisma.order.findUnique({
    where: { id: caja.id }, select: { status: true },
  });
  console.log(`    el pedido del cliente quedó en ${trasSalir?.status}`);
  check(
    trasSalir?.status === 'IN_INTERCITY_TRANSIT',
    'el pedido pasa a «en tránsito intermunicipal», no se queda en preparando',
    trasSalir?.status,
  );

  // ── 6. Con el bus en ruta la bodega está cerrada ────────────────────────
  console.log('\n[6] Subir o bajar carga con el bus ya en carretera');
  const tarde = await pedido('bucaramanga');
  const m6 = await motivoDe(() => adjuntarEncomiendaASalida(op.id, tarde.id, salida.id));
  console.log(`    subir: "${m6}"`);
  check(/ya salió|no admite/i.test(m6), 'no se puede subir más carga', m6);

  const m6b = await motivoDe(() => soltarEncomienda(op.id, caja.id));
  console.log(`    bajar: "${m6b}"`);
  check(m6b !== '', 'ni bajar la que ya va dentro', m6b);

  // ── 7. El pasajero ve dónde va el bus ───────────────────────────────────
  console.log('\n[7] Posición del bus para quien compró el pasaje');
  const { getPooledTripById } = await import('../src/services/intercity-pool.service');
  const enCurso = await getPooledTripById(salida.id);
  console.log(`    driverLat=${enCurso?.driverLat} driverLng=${enCurso?.driverLng}`);
  check(
    enCurso?.driverLat != null && enCurso?.driverLng != null,
    'con la salida EN CURSO se expone la posición del bus',
    { lat: enCurso?.driverLat, lng: enCurso?.driverLng },
  );

  const sinSalir = await getPooledTripById(salida2.id);
  check(
    sinSalir?.driverLat == null,
    'antes de arrancar NO se expone: el conductor está en su casa, no en el bus',
    { lat: sinSalir?.driverLat },
  );

  // ── 8. El rastro admite la salida ───────────────────────────────────────
  console.log('\n[8] Rastro GPS de la salida');
  const { recordTrackPoint } = await import('../src/services/track.service');
  await recordTrackPoint(driver.id, 7.9, -72.51, { kind: 'pooled', id: salida.id, operatorId: op.id });
  const puntos = await prisma.driverTrackPoint.count({
    where: { serviceKind: 'pooled', serviceId: salida.id },
  });
  console.log(`    ${puntos} punto(s) grabado(s)`);
  check(puntos > 0, 'la salida deja recorrido, como los otros cuatro servicios', puntos);

  // ── Limpieza ────────────────────────────────────────────────────────────
  await prisma.driverTrackPoint.deleteMany({ where: { driverId: driver.id } });
  await prisma.freightManifestItem.deleteMany({ where: { manifest: { operatorId: { in: [op.id, otraOp.id] } } } });
  await prisma.freightManifest.deleteMany({ where: { operatorId: { in: [op.id, otraOp.id] } } });
  await prisma.orderLine.deleteMany({ where: { order: { businessId: negocio.id } } });
  await prisma.order.deleteMany({ where: { businessId: negocio.id } });
  await prisma.product.deleteMany({ where: { businessId: negocio.id } });
  await prisma.business.delete({ where: { id: negocio.id } });
  await prisma.seatAssignment.deleteMany({ where: { trip: { driverId: driver.id } } });
  await prisma.seatBooking.deleteMany({ where: { trip: { driverId: driver.id } } });
  await prisma.pooledTrip.deleteMany({ where: { driverId: driver.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.driver.delete({ where: { id: driver.id } });
  await prisma.operator.deleteMany({ where: { id: { in: [op.id, otraOp.id] } } });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Comprobaciones: ${ok} en verde, ${fallos} en rojo`);
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch((e) => { console.error('\nERROR:', e); process.exit(2); });
