/**
 * E2E de la pieza 4: el pedido intermunicipal viaja en el despacho de una
 * empresa y se cierra con el acta de la taquilla.
 *
 * Lo que de verdad prueba, y que solo se ve contra una base real:
 *
 *   1. Que un pedido a otra ciudad YA NO se le ofrece a un repartidor urbano
 *      —el hueco que abrió la pieza 2: una moto de Cúcuta llevando la caja a
 *      Bucaramanga—.
 *   2. Que el pedido se convierte en un REMITO con sus bultos conciliables, sin
 *      tabla nueva.
 *   3. Que no se puede subir dos veces (el índice único es la toma atómica).
 *   4. Que no sube al bus que va a otra ciudad.
 *   5. Que despachar lo pone en tránsito y recibir el remito lo ENTREGA.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/encomienda-en-despacho.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

async function rechaza(nombre: string, fn: () => Promise<unknown>, patron: RegExp): Promise<void> {
  try {
    await fn();
    comprobar(nombre, false, 'no lanzó');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    comprobar(nombre, patron.test(msg), `mensaje: ${msg}`);
  }
}

const tel = (p: string) => `+57${p}${Math.floor(10000000 + Math.random() * 89999999)}`;

const CIUDADES = [
  { slug: 'cucuta', name: 'Cúcuta', department: 'Norte de Santander', lat: 7.8939, lng: -72.5078 },
  { slug: 'bucaramanga', name: 'Bucaramanga', department: 'Santander', lat: 7.1193, lng: -73.1227 },
  { slug: 'bogota', name: 'Bogotá', department: 'Cundinamarca', lat: 4.711, lng: -74.0721 },
];

async function main(): Promise<void> {
  const {
    createBusinessProduct, updateBusinessLocation, updateBusinessShipping,
  } = await import('../src/services/business.service');
  const { placeClientOrder, acceptOrderByBusiness } = await import('../src/services/client.service');
  const {
    listarEncomiendasPendientes, adjuntarEncomienda, soltarEncomienda,
  } = await import('../src/services/encomiendas.service');
  const { createCargoTrip, setCargoTripStatus } = await import('../src/services/cargo-trip.service');
  const matching = await import('../src/services/matching.service');
  const { receiveManifest, dispatchManifest } = await import('../src/services/manifest.service');

  const marca = `e2eenc-${Date.now()}`;

  for (const c of CIUDADES) {
    await prisma.municipality.upsert({
      where: { slug: c.slug },
      update: { lat: c.lat, lng: c.lng, isActive: true },
      create: { ...c, isActive: true },
    });
  }

  // ── Montaje: empresa intermunicipal + comercio mayorista en Cúcuta ─────────
  const empresa = await prisma.operator.create({
    data: {
      legalName: `${marca} Transportes`, nit: `900${Date.now() % 1000000}`,
      type: 'INTERCITY', status: 'ACTIVE', isVerified: true,
      contactName: 'Gerente', contactPhone: tel('30'),
    },
  });

  const conductor = await prisma.driver.create({
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
  await updateBusinessLocation(negocio.id, CIUDADES[0].lat, CIUDADES[0].lng);
  await updateBusinessShipping(negocio.id, [
    { city: 'bucaramanga', fee: 15000, etaHours: 24 },
  ]);

  const producto = await createBusinessProduct(negocio.id, {
    name: 'Caja de camisetas', price: 200000, category: 'Ropa',
  } as never);
  const pid = (producto as { id: string }).id;

  const cliente = await prisma.user.create({
    data: { name: 'Marta Ruiz', phone: tel('32') },
  });

  async function nuevoPedido() {
    const p = await placeClientOrder(cliente.id, cliente.phone, {
      businessId: negocio.id,
      deliveryAddress: 'Cabecera, calle 48 #33-12',
      deliveryLat: CIUDADES[1].lat,
      deliveryLng: CIUDADES[1].lng,
      items: [{ productId: pid, quantity: 3 }],
    } as never);
    return p.id;
  }

  console.log('\n── El hueco que abrió la pieza 2 ──');

  // Hay que SEMBRAR un repartidor en línea y CAPTURAR la oferta. Comprobar solo
  // el estado del pedido no prueba nada: `startOrderMatchingCycle` no escribe
  // en la base hasta que alguien acepta, así que sin conductor cerca el pedido
  // se queda en PREPARING con la guarda y sin ella. Es el mismo falso positivo
  // que ya apareció en la concurrencia de las reservas.
  const repartidor = await prisma.driver.create({
    data: {
      name: 'Moto Cúcuta', phone: tel('36'),
      documentType: 'CC', documentNumber: `20${Date.now() % 10000000}`,
      isVerified: true, status: 'ONLINE', acceptsOrders: true,
    },
  });
  await prisma.$executeRaw`
    UPDATE "drivers"
    SET "geo" = ST_SetSRID(ST_MakePoint(${CIUDADES[0].lng}, ${CIUDADES[0].lat}), 4326)::geography,
        "lastSeenAt" = now(), "lastLat" = ${CIUDADES[0].lat}, "lastLng" = ${CIUDADES[0].lng}
    WHERE "id" = ${repartidor.id}`;

  const ofertas: Array<Record<string, unknown>> = [];
  matching.registerSendToDriver((_id, msg) => {
    ofertas.push(msg as Record<string, unknown>);
    return true;
  });

  const pedidoId = await nuevoPedido();
  await acceptOrderByBusiness(negocio.id, pedidoId, 25);
  await new Promise((r) => setTimeout(r, 800));

  const trasAceptar = await prisma.order.findUniqueOrThrow({ where: { id: pedidoId } });
  comprobar('un pedido a otra ciudad NO se le ofrece a un repartidor urbano',
    !ofertas.some((o) => o['type'] === 'order_request'),
    `ofertas: ${JSON.stringify(ofertas.map((o) => o['type']))}`);
  comprobar('y se queda esperando bus, sin conductor urbano asignado',
    trasAceptar.status === 'PREPARING' && trasAceptar.driverId === null,
    `status=${trasAceptar.status} driver=${trasAceptar.driverId}`);

  // Contraprueba: un pedido LOCAL con el mismo repartidor sembrado SÍ recibe
  // oferta. Sin esto, la comprobación de arriba pasaría también si el despacho
  // estuviera roto para todo.
  ofertas.length = 0;
  const localId = (await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id,
    deliveryAddress: 'La Playa, Cúcuta',
    deliveryLat: CIUDADES[0].lat + 0.01,
    deliveryLng: CIUDADES[0].lng + 0.01,
    items: [{ productId: pid, quantity: 1 }],
  } as never)).id;
  await acceptOrderByBusiness(negocio.id, localId, 20);
  await new Promise((r) => setTimeout(r, 800));
  comprobar('un pedido LOCAL sí recibe oferta (el despacho urbano funciona)',
    ofertas.some((o) => o['type'] === 'order_request'),
    `ofertas: ${JSON.stringify(ofertas.map((o) => o['type']))}`);

  console.log('\n── El tablero de encomiendas ──');

  const tablero = await listarEncomiendasPendientes({ origen: 'cucuta', destino: 'bucaramanga' });
  const mia = tablero.find((e) => e.orderId === pedidoId);
  comprobar('la encomienda aparece esperando bus', mia != null);
  comprobar('el tablero dice quién manda, a quién y cuántos bultos',
    mia?.businessName.includes(marca) === true && mia?.clientName === 'Marta Ruiz'
      && mia?.bultos === 3 && mia?.intercityFee === 15000,
    JSON.stringify(mia));

  const otraRuta = await listarEncomiendasPendientes({ origen: 'bogota' });
  comprobar('no se le enseña a la empresa que sale de otra ciudad',
    !otraRuta.some((e) => e.orderId === pedidoId));

  console.log('\n── Subirla al despacho ──');

  const viaje = await createCargoTrip(empresa.id, {
    originCity: 'cucuta', destCity: 'bucaramanga',
  } as never);
  const viajeId = (viaje as { id: string }).id;

  // Un bus que va a OTRA ciudad no la puede llevar: el destinatario se
  // enteraría un día después y en la ciudad equivocada.
  const viajeMalo = await createCargoTrip(empresa.id, {
    originCity: 'cucuta', destCity: 'bogota',
  } as never);
  await rechaza('NO sube al bus que va a otra ciudad',
    () => adjuntarEncomienda(empresa.id, pedidoId, (viajeMalo as { id: string }).id),
    /va a bogota/i);

  const remito = await adjuntarEncomienda(empresa.id, pedidoId, viajeId);
  comprobar('se crea el remito con su consecutivo y sus bultos',
    /^REM-\d{4}$/.test(remito.code) && remito.bultos === 3,
    `${remito.code} / ${remito.bultos}`);

  const enBD = await prisma.freightManifest.findUniqueOrThrow({
    where: { id: remito.manifestId },
    include: { items: true },
  });
  comprobar('el remito lleva la referencia del pedido y la ciudad del cliente',
    enBD.reference === trasAceptar.orderRef && enBD.clientCity === 'bucaramanga',
    `${enBD.reference} / ${enBD.clientCity}`);
  comprobar('un renglón por producto, conciliable',
    enBD.items.length === 1 && enBD.items[0]!.measure === 3,
    JSON.stringify(enBD.items.map((i) => i.measure)));

  await rechaza('no se sube dos veces (índice único = toma atómica)',
    () => adjuntarEncomienda(empresa.id, pedidoId, viajeId),
    /ya va en otro despacho|acaba de subirse/i);

  const trasSubir = await listarEncomiendasPendientes({ origen: 'cucuta' });
  comprobar('sale del tablero al subirla',
    !trasSubir.some((e) => e.orderId === pedidoId));

  console.log('\n── Bajarla mientras el bus no salga ──');

  await soltarEncomienda(empresa.id, pedidoId);
  const devuelta = await listarEncomiendasPendientes({ origen: 'cucuta' });
  comprobar('al bajarla vuelve al tablero',
    devuelta.some((e) => e.orderId === pedidoId));
  comprobar('el remito se borra, no queda un documento vacío',
    (await prisma.freightManifest.findUnique({ where: { id: remito.manifestId } })) === null);

  const remito2 = await adjuntarEncomienda(empresa.id, pedidoId, viajeId);

  console.log('\n── El bus sale ──');

  await setCargoTripStatus(empresa.id, viajeId, 'dispatched');
  const enRuta = await prisma.order.findUniqueOrThrow({ where: { id: pedidoId } });
  comprobar('despachar pone el pedido en tránsito INTERMUNICIPAL',
    enRuta.status === 'IN_INTERCITY_TRANSIT', enRuta.status);

  await rechaza('con el bus ya en ruta no se puede bajar',
    () => soltarEncomienda(empresa.id, pedidoId),
    /ya salió o ya se facturó/i);

  const otroPedido = await nuevoPedido();
  await acceptOrderByBusiness(negocio.id, otroPedido, 20);
  await rechaza('un despacho ya salido no admite más carga',
    () => adjuntarEncomienda(empresa.id, otroPedido, viajeId),
    /ya salió o ya se facturó/i);

  console.log('\n── La taquilla: el acta cierra la entrega ──');

  // Despachar el REMITO es lo que le asigna conductor y placa; es la acción con
  // la que la caja sale de la bodega.
  await dispatchManifest(empresa.id, remito2.manifestId, { driverId: conductor.id });
  const trasRemito = await prisma.order.findUniqueOrThrow({ where: { id: pedidoId } });
  comprobar('despachar el remito también deja el pedido en tránsito',
    trasRemito.status === 'IN_INTERCITY_TRANSIT', trasRemito.status);

  // Los bultos no reportados se dan por conformes: así está diseñada la
  // conciliación, y exigir tocar los tres uno por uno en la taquilla
  // garantizaría que nadie lo use.
  await receiveManifest(conductor.id, remito2.manifestId, {
    receivedByName: 'Marta Ruiz',
    receivedByIdNumber: '1090123456',
    items: [],
  });

  const entregado = await prisma.order.findUniqueOrThrow({ where: { id: pedidoId } });
  comprobar('recibir el remito ENTREGA el pedido',
    entregado.status === 'DELIVERED' && entregado.deliveredAt !== null,
    `${entregado.status} / ${entregado.deliveredAt}`);

  const actaEnBD = await prisma.freightManifest.findUniqueOrThrow({
    where: { id: remito2.manifestId },
  });
  comprobar('queda constancia de quién recibió y con qué documento',
    actaEnBD.receivedByName === 'Marta Ruiz' && actaEnBD.receivedByIdNumber === '1090123456',
    `${actaEnBD.receivedByName} / ${actaEnBD.receivedByIdNumber}`);

  console.log('\n── Con faltantes se entrega igual, y la novedad queda ──');

  const viaje2 = await createCargoTrip(empresa.id, {
    originCity: 'cucuta', destCity: 'bucaramanga',
  } as never);
  const remito3 = await adjuntarEncomienda(
    empresa.id, otroPedido, (viaje2 as { id: string }).id,
  );
  await dispatchManifest(empresa.id, remito3.manifestId, { driverId: conductor.id });
  await receiveManifest(conductor.id, remito3.manifestId, {
    receivedByName: 'Portería',
    items: [{ position: 1, status: 'SHORT', receivedMeasure: 2, note: 'Llegaron 2 de 3' }],
  });
  const conFaltante = await prisma.order.findUniqueOrThrow({ where: { id: otroPedido } });
  const remitoFaltante = await prisma.freightManifest.findUniqueOrThrow({
    where: { id: remito3.manifestId },
  });
  // Negarle la entrega a quien SÍ recibió dos de tres sería peor; la
  // constancia es lo que sostiene el reclamo.
  comprobar('con faltantes el pedido se entrega y la discrepancia queda anotada',
    conFaltante.status === 'DELIVERED' && remitoFaltante.discrepancyCount > 0,
    `${conFaltante.status} / disc=${remitoFaltante.discrepancyCount}`);

  console.log('\n── Guardas de pertenencia ──');

  const vecina = await prisma.operator.create({
    data: {
      legalName: `${marca} Vecina`, nit: `901${Date.now() % 1000000}`,
      type: 'INTERCITY', status: 'ACTIVE', isVerified: true,
      contactName: 'Otro', contactPhone: tel('33'),
    },
  });
  const tercerPedido = await nuevoPedido();
  await acceptOrderByBusiness(negocio.id, tercerPedido, 20);
  await rechaza('la empresa vecina no puede subir carga a un despacho ajeno',
    () => adjuntarEncomienda(vecina.id, tercerPedido, viajeId),
    /no es de tu empresa/i);

  // ── Limpieza ───────────────────────────────────────────────────────────────
  await prisma.freightManifestItem.deleteMany({
    where: { manifest: { operatorId: { in: [empresa.id, vecina.id] } } },
  });
  await prisma.freightManifest.deleteMany({
    where: { operatorId: { in: [empresa.id, vecina.id] } },
  });
  await prisma.cargoTrip.deleteMany({ where: { operatorId: { in: [empresa.id, vecina.id] } } });
  await prisma.orderLine.deleteMany({ where: { order: { businessId: negocio.id } } });
  await prisma.order.deleteMany({ where: { businessId: negocio.id } });
  await prisma.product.deleteMany({ where: { businessId: negocio.id } });
  await prisma.business.delete({ where: { id: negocio.id } });
  await prisma.operator.deleteMany({ where: { id: { in: [empresa.id, vecina.id] } } });
  await prisma.driver.deleteMany({ where: { id: { in: [conductor.id, repartidor.id] } } });
  await prisma.user.delete({ where: { id: cliente.id } });

  console.log(fallos === 0 ? '\nTODO EN VERDE' : `\n${fallos} FALLOS`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
