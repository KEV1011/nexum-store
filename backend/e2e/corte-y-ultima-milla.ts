/**
 * E2E de las piezas 3 y 5 de la encomienda: la hora de corte y la última milla.
 *
 * Lo que se prueba, por orden de gravedad:
 *
 *  1. **El cobro.** Al abrir el envío entre ciudades se le empezó a cobrar al
 *     cliente el domicilio urbano ADEMÁS del flete, y en un envío a otra ciudad
 *     nadie hace un domicilio: el comercio deja la caja en la terminal y el
 *     cliente la recoge. Se cobraba un servicio inexistente. Aquí se comprueba
 *     que ya no, y —contraprueba— que el pedido local NO perdió el suyo.
 *  2. **La promesa.** Pasada la hora de corte, la fecha se corre al despacho
 *     siguiente. Prometer «12 horas» a las cinco de la tarde, con el bus de las
 *     cuatro ya ido, es mentira.
 *  3. **La última milla llega a un repartidor DE DESTINO**, anclada donde quedó
 *     la caja y no donde está el comercio, que está en otra ciudad. La
 *     contraprueba es la que vale: el repartidor de ORIGEN no la recibe.
 *  4. Los dos bloqueantes que la habrían dejado muerta al nacer: que el
 *     repartidor pueda ACEPTAR un pedido que espera en destino, y que no se le
 *     pida el PIN de recogida que solo tiene el comercio de origen.
 *  5. Sin última milla, recibir en taquilla sigue cerrando el pedido (pieza 4
 *     sin regresión).
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/corte-y-ultima-milla.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const tel = (p: string) => `+57${p}${Math.floor(1000000 + Math.random() * 8999999)}`;

const CUCUTA = { slug: 'cucuta', name: 'Cúcuta', department: 'Norte de Santander', lat: 7.8939, lng: -72.5078 };
const BUCARAMANGA = { slug: 'bucaramanga', name: 'Bucaramanga', department: 'Santander', lat: 7.1193, lng: -73.1227 };

/** Un instante de hora colombiana expresado en UTC. */
const enColombia = (iso: string) => new Date(`${iso}-05:00`);

async function main(): Promise<void> {
  const {
    createBusinessProduct, updateBusinessLocation, updateBusinessShipping,
  } = await import('../src/services/business.service');
  const {
    placeClientOrder, acceptOrderByBusiness, acceptClientOrder, updateOrderStatusByDriver,
  } = await import('../src/services/client.service');
  const { adjuntarEncomienda } = await import('../src/services/encomiendas.service');
  const { createCargoTrip } = await import('../src/services/cargo-trip.service');
  const { receiveManifest, dispatchManifest } = await import('../src/services/manifest.service');
  const matching = await import('../src/services/matching.service');
  const { estimaLlegada } = await import('../src/lib/corte-bodega');

  const marca = `e2ecm-${Date.now()}`;

  for (const c of [CUCUTA, BUCARAMANGA]) {
    await prisma.municipality.upsert({
      where: { slug: c.slug },
      update: { lat: c.lat, lng: c.lng, isActive: true },
      create: { ...c, isActive: true },
    });
  }

  const empresa = await prisma.operator.create({
    data: {
      legalName: `${marca} Transportes`, nit: `901${Date.now() % 1000000}`,
      type: 'INTERCITY', status: 'ACTIVE', isVerified: true,
      contactName: 'Gerente', contactPhone: tel('30'),
    },
  });

  const conductorBus = await prisma.driver.create({
    data: {
      name: 'Nelson Parra', phone: tel('35'),
      documentType: 'CC', documentNumber: `10${Date.now() % 10000000}`,
      operatorId: empresa.id, isVerified: true,
    },
  });

  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Mayorista`, ownerName: 'Dueño', category: 'OTHER',
      address: 'Av 0 #10-20', phone: tel('31'), token: `tok-${marca}`,
      acceptingOrders: true, deliveryFee: 4000, etaMinutes: 40,
    },
  });
  await updateBusinessLocation(negocio.id, CUCUTA.lat, CUCUTA.lng);

  const producto = await createBusinessProduct(negocio.id, {
    name: 'Caja de camisetas', price: 200000, category: 'Ropa',
  } as never);
  const pid = (producto as { id: string }).id;

  const cliente = await prisma.user.create({
    data: { name: 'Marta Ruiz', phone: tel('32') },
  });

  async function pedir(opts: { lejos: boolean; lastMile?: boolean; sinCoords?: boolean }) {
    return placeClientOrder(cliente.id, cliente.phone, {
      businessId: negocio.id,
      deliveryAddress: opts.lejos ? 'Cabecera, calle 48 #33-12' : 'Av 0 #11-30, Cúcuta',
      ...(opts.sinCoords
        ? {}
        : {
            deliveryLat: opts.lejos ? BUCARAMANGA.lat : CUCUTA.lat,
            deliveryLng: opts.lejos ? BUCARAMANGA.lng : CUCUTA.lng,
          }),
      ...(opts.lastMile ? { lastMile: true } : {}),
      items: [{ productId: pid, quantity: 3 }],
    } as never);
  }

  // ═══ 1. El cobro ═════════════════════════════════════════════════════════
  console.log('\n1. Lo que se cobra por mover la caja');
  await updateBusinessShipping(negocio.id, [
    { city: 'bucaramanga', fee: 15000, etaHours: 24 },
  ]);

  const local = await pedir({ lejos: false });
  comprobar(
    'pedido local: cobra su domicilio, sin flete',
    local.deliveryFee === 4000 && local.total === 600000 + 4000,
    `domicilio=${local.deliveryFee} total=${local.total}`,
  );

  const taquilla = await pedir({ lejos: true });
  comprobar(
    'a otra ciudad y recoge en taquilla: NO se cobra domicilio',
    taquilla.deliveryFee === 0,
    `domicilio=${taquilla.deliveryFee}`,
  );
  comprobar(
    'y el total es solo productos + flete',
    taquilla.total === 600000 + 15000,
    `total=${taquilla.total}`,
  );

  const aPuerta = await pedir({ lejos: true, lastMile: true });
  comprobar(
    'a otra ciudad y hasta la puerta: sí se cobra, y paga al de destino',
    aPuerta.deliveryFee === 4000 && aPuerta.total === 600000 + 15000 + 4000,
    `domicilio=${aPuerta.deliveryFee} total=${aPuerta.total}`,
  );

  const sinPunto = await pedir({ lejos: true, lastMile: true, sinCoords: true });
  // Sin coordenadas no hay plaza, así que el pedido es LOCAL: es la regla de la
  // pieza 2 y sigue mandando. Lo que importa aquí es que pedir última milla no
  // la activa por su cuenta.
  comprobar(
    'pedir última milla sin coordenadas no la activa',
    sinPunto.lastMile !== true,
    `lastMile=${sinPunto.lastMile}`,
  );

  // ═══ 2. La promesa ═══════════════════════════════════════════════════════
  console.log('\n2. La fecha prometida respeta la hora de corte');

  const sinCorte = await pedir({ lejos: true });
  comprobar(
    'sin corte declarado hay promesa, contada desde ahora',
    !!sinCorte.promisedAt &&
      Math.abs(new Date(sinCorte.promisedAt).getTime() - (Date.now() + 24 * 3_600_000)) < 120_000,
    String(sinCorte.promisedAt),
  );
  comprobar('un pedido local no promete fecha de bus', local.promisedAt == null);

  await updateBusinessShipping(negocio.id, [
    { city: 'bucaramanga', fee: 15000, etaHours: 24, cutoff: '16:00' },
  ]);
  const conCorte = await pedir({ lejos: true });
  const guardado = await prisma.order.findUnique({
    where: { id: conCorte.id },
    select: { promisedAt: true },
  });
  const esperado = estimaLlegada(new Date(), '16:00', 24, []);
  comprobar(
    'con corte, la promesa es la del próximo despacho + las horas',
    guardado?.promisedAt?.toISOString() === esperado.toISOString(),
    `guardado=${guardado?.promisedAt?.toISOString()} esperado=${esperado.toISOString()}`,
  );
  // La regla pura ya se prueba en su archivo; aquí solo interesa que el
  // checkout la esté usando de verdad y no calculando por su cuenta.
  const antesDelCorte = estimaLlegada(enColombia('2026-09-17T15:00:00'), '16:00', 24, []);
  const despuesDelCorte = estimaLlegada(enColombia('2026-09-17T17:00:00'), '16:00', 24, []);
  comprobar(
    'pasado el corte la promesa se corre un día entero',
    despuesDelCorte.getTime() - antesDelCorte.getTime() === 24 * 3_600_000,
  );

  // ═══ 3. La última milla ══════════════════════════════════════════════════
  console.log('\n3. La caja llega a destino y sale un repartidor de ALLÁ');

  // Dos repartidores: uno en la ciudad del comercio y otro en la de destino.
  // El de origen es la contraprueba — si la oferta se anclara al comercio, le
  // llegaría a él, que está a 200 km de donde está la caja.
  async function sembrarRepartidor(nombre: string, punto: { lat: number; lng: number }) {
    const d = await prisma.driver.create({
      data: {
        name: nombre, phone: tel('36'),
        documentType: 'CC', documentNumber: `2${Date.now() % 100000000}`,
        isVerified: true, status: 'ONLINE', acceptsOrders: true,
      },
    });
    await prisma.$executeRaw`
      UPDATE "drivers"
      SET "geo" = ST_SetSRID(ST_MakePoint(${punto.lng}, ${punto.lat}), 4326)::geography,
          "lastSeenAt" = now(), "lastLat" = ${punto.lat}, "lastLng" = ${punto.lng}
      WHERE "id" = ${d.id}`;
    return d;
  }

  // Todo lo que hubiera ONLINE de corridas anteriores roba la oferta: el
  // despacho ofrece de a uno y espera quince segundos por candidato.
  await prisma.driver.updateMany({ where: { status: 'ONLINE' }, data: { status: 'OFFLINE' } });
  const motoOrigen = await sembrarRepartidor('Moto Cúcuta', CUCUTA);
  const motoDestino = await sembrarRepartidor('Moto Bucaramanga', BUCARAMANGA);

  const ofertas: Array<{ driverId: string; orderId: string }> = [];
  matching.registerSendToDriver((driverId: string, msg: Record<string, unknown>) => {
    if (msg['type'] === 'order_request') {
      // El mensaje lleva el pedido en `order`, no en `data`.
      const d = msg['order'] as { id?: string } | undefined;
      ofertas.push({ driverId, orderId: d?.id ?? '' });
    }
    return true;
  });

  // El pedido a puerta recorre su ciclo hasta llegar a destino.
  await acceptOrderByBusiness(negocio.id, aPuerta.id, 30);
  const viaje = await createCargoTrip(empresa.id, {
    originCity: 'cucuta', destCity: 'bucaramanga', plate: 'XYZ123',
  } as never);
  const remito = await adjuntarEncomienda(empresa.id, aPuerta.id, (viaje as { id: string }).id);
  await dispatchManifest(empresa.id, remito.manifestId, { driverId: conductorBus.id } as never);

  const enBus = await prisma.order.findUnique({
    where: { id: aPuerta.id }, select: { status: true },
  });
  comprobar('va en el bus', enBus?.status === 'IN_INTERCITY_TRANSIT', String(enBus?.status));

  // El conductor del bus reporta su posición: es el punto donde queda la caja.
  await prisma.driver.update({
    where: { id: conductorBus.id },
    data: { lastLat: BUCARAMANGA.lat, lastLng: BUCARAMANGA.lng },
  });

  ofertas.length = 0;
  await receiveManifest(conductorBus.id, remito.manifestId, { receivedByName: 'Marta Ruiz', receivedByIdNumber: '1090123456', items: [] } as never);
  await new Promise((r) => setTimeout(r, 1500));

  const enHub = await prisma.order.findUnique({
    where: { id: aPuerta.id },
    select: { status: true, hubLat: true, hubLng: true, hubAt: true, driverId: true },
  });
  comprobar(
    'NO se cierra: queda esperando repartidor en destino',
    enHub?.status === 'AT_DESTINATION_HUB',
    String(enHub?.status),
  );
  comprobar(
    'y se sella dónde quedó la caja, con la posición real del conductor',
    Math.abs((enHub?.hubLat ?? 0) - BUCARAMANGA.lat) < 0.001 && enHub?.hubAt != null,
    `hub=${enHub?.hubLat},${enHub?.hubLng}`,
  );

  comprobar(
    'la oferta le llega al repartidor de DESTINO',
    ofertas.some((o) => o.driverId === motoDestino.id && o.orderId === aPuerta.id),
    JSON.stringify(ofertas),
  );
  // LA CONTRAPRUEBA: si se anclara al comercio, esta sería la única que
  // llegaría. Se exige que HAYA ofertas además de que ninguna sea suya — con
  // la lista vacía la comprobación pasaría también si el despacho no hubiera
  // salido en absoluto, que es el falso positivo de siempre.
  comprobar(
    'y NO al de origen, que está a 200 km de la caja',
    ofertas.length > 0 && !ofertas.some((o) => o.driverId === motoOrigen.id),
    JSON.stringify(ofertas),
  );

  // ═══ 4. Los dos bloqueantes ══════════════════════════════════════════════
  console.log('\n4. Que el repartidor pueda de verdad hacer su trabajo');

  const tomado = await acceptClientOrder(
    aPuerta.id, motoDestino.name, motoDestino.phone, motoDestino.id,
  );
  comprobar(
    'puede ACEPTAR un pedido que espera en destino',
    tomado != null,
    'acceptClientOrder devolvió null: la última milla estaría muerta',
  );

  let recogioSinPin = false;
  try {
    await updateOrderStatusByDriver(aPuerta.id, motoDestino.id, 'in_transit');
    recogioSinPin = true;
  } catch (e) {
    recogioSinPin = false;
    console.log('    (motivo:', e instanceof Error ? e.message : e, ')');
  }
  comprobar(
    'recoge en la taquilla SIN el PIN que solo tiene el comercio de origen',
    recogioSinPin,
    'se le pidió un PIN que nadie en destino puede darle',
  );

  // El PIN de la puerta, que es el que protege al cliente, sí se sigue pidiendo.
  let exigioPinDeEntrega = false;
  try {
    await updateOrderStatusByDriver(aPuerta.id, motoDestino.id, 'delivered');
  } catch {
    exigioPinDeEntrega = true;
  }
  comprobar('pero el PIN de ENTREGA se sigue exigiendo', exigioPinDeEntrega);

  const conPin = await prisma.order.findUnique({
    where: { id: aPuerta.id }, select: { deliveryPin: true },
  });
  await updateOrderStatusByDriver(
    aPuerta.id, motoDestino.id, 'delivered', conPin?.deliveryPin ?? undefined,
  );
  const cerrado = await prisma.order.findUnique({
    where: { id: aPuerta.id }, select: { status: true, deliveredAt: true },
  });
  comprobar(
    'y con el PIN correcto se cierra entregado',
    cerrado?.status === 'DELIVERED' && cerrado.deliveredAt != null,
    String(cerrado?.status),
  );

  // ═══ 5. Sin regresión en la pieza 4 ══════════════════════════════════════
  console.log('\n5. Sin última milla, la taquilla sigue cerrando el pedido');

  await acceptOrderByBusiness(negocio.id, taquilla.id, 30);
  const viaje2 = await createCargoTrip(empresa.id, {
    originCity: 'cucuta', destCity: 'bucaramanga', plate: 'XYZ124',
  } as never);
  const remito2 = await adjuntarEncomienda(empresa.id, taquilla.id, (viaje2 as { id: string }).id);
  await dispatchManifest(empresa.id, remito2.manifestId, { driverId: conductorBus.id } as never);
  await receiveManifest(conductorBus.id, remito2.manifestId, { receivedByName: 'Marta Ruiz', receivedByIdNumber: '1090123456', items: [] } as never);

  const cerradoEnTaquilla = await prisma.order.findUnique({
    where: { id: taquilla.id }, select: { status: true },
  });
  comprobar(
    'recibir el remito lo entrega, como en la pieza 4',
    cerradoEnTaquilla?.status === 'DELIVERED',
    String(cerradoEnTaquilla?.status),
  );

  // ═══ 6. El conductor sin posición ════════════════════════════════════════
  console.log('\n6. Si el conductor no reportó posición, no se cuelga el pedido');

  const otro = await pedir({ lejos: true, lastMile: true });
  await acceptOrderByBusiness(negocio.id, otro.id, 30);
  const viaje3 = await createCargoTrip(empresa.id, {
    originCity: 'cucuta', destCity: 'bucaramanga', plate: 'XYZ125',
  } as never);
  const remito3 = await adjuntarEncomienda(empresa.id, otro.id, (viaje3 as { id: string }).id);

  const sinGps = await prisma.driver.create({
    data: {
      name: 'Bus sin GPS', phone: tel('37'),
      documentType: 'CC', documentNumber: `3${Date.now() % 100000000}`,
      operatorId: empresa.id, isVerified: true,
    },
  });
  await dispatchManifest(empresa.id, remito3.manifestId, { driverId: sinGps.id } as never);
  await receiveManifest(sinGps.id, remito3.manifestId, { receivedByName: 'Marta Ruiz', receivedByIdNumber: '1090123456', items: [] } as never);

  const caida = await prisma.order.findUnique({
    where: { id: otro.id }, select: { status: true },
  });
  comprobar(
    'se cierra en taquilla en vez de quedarse colgado esperando',
    caida?.status === 'DELIVERED',
    String(caida?.status),
  );

  await prisma.$disconnect();
  console.log(`\n${fallos === 0 ? '✓ TODO EN VERDE' : `✗ ${fallos} FALLO(S)`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
