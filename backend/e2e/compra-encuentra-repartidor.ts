/**
 * La compra en un comercio sin pago o no registrado LLEGA a un repartidor.
 *
 * EL REPORTE: «cuando el local no ha pagado o no se ha registrado con nosotros
 * y se hace el pedido de su menú, queda buscando quién lo reciba y nunca llega
 * a ningún repartidor».
 *
 * LA CAUSA: la ficha se geocodificaba sin ciudad y quedaba guardada en otra
 * ciudad; el despacho buscaba alrededor de ESE punto. Ningún E2E comprobaba
 * que la oferta de este camino llegara a alguien.
 *
 * Se siembra un repartidor ONLINE con GPS fresco y se CAPTURA la oferta con
 * `registerSendToDriver` — comprobar solo el estado del mandado pasaría igual
 * con el despacho roto, porque buscar no escribe nada en la base.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/compra-encuentra-repartidor.ts
 */
import { prisma } from '../src/lib/prisma';

let ok = 0;
let fallos = 0;
function comprobar(nombre: string, cond: boolean, detalle?: unknown): void {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallos++; console.log(`  ✗ ${nombre}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

const CERCA_PAMPLONA = { lat: 7.379, lng: -72.652 };
const EN_BOGOTA = { lat: 4.6, lng: -74.08 };
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const { comprarEnComercio } = await import('../src/services/comercio-no-reclamado.service');
  const matching = await import('../src/services/matching.service');
  const errands = await import('../src/services/errand.service');
  const { abrirFichaDeComercio, diagnoseMandado } = await import('../src/services/admin.service');
  const { listarComerciosMalUbicados } = await import('../src/services/ubicacion-comercio.service');
  const { warmMunicipalities } = await import('../src/services/municipality.service');
  await warmMunicipalities();

  const marca = `e2ecompra-${Date.now()}`;
  const tel = (p: string) => `+57${p}${Math.floor(1e7 + Math.random() * 8e7)}`;

  const cliente = await prisma.user.create({ data: { phone: tel('30') } });

  const repartidor = await prisma.driver.create({
    data: {
      name: 'Moto Pamplona', phone: tel('31'),
      documentType: 'CC', documentNumber: `31${Date.now() % 10000000}`,
      isVerified: true, status: 'ONLINE', acceptsErrands: true, acceptsOrders: true,
    },
  });
  await prisma.$executeRaw`
    UPDATE "drivers"
    SET "geo" = ST_SetSRID(ST_MakePoint(${CERCA_PAMPLONA.lng}, ${CERCA_PAMPLONA.lat}), 4326)::geography,
        "lastSeenAt" = now(), "lastLat" = ${CERCA_PAMPLONA.lat}, "lastLng" = ${CERCA_PAMPLONA.lng}
    WHERE "id" = ${repartidor.id}`;

  const ofertas: Array<{ driverId: string; msg: Record<string, unknown> }> = [];
  matching.registerSendToDriver((driverId, msg) => {
    ofertas.push({ driverId, msg: msg as Record<string, unknown> });
    return true;
  });

  const negociosCreados: string[] = [];
  async function ficha(nombre: string, punto: { lat: number; lng: number } | null, citySlug: string | null) {
    const b = await prisma.business.create({
      data: {
        name: `${marca} ${nombre}`, ownerName: 'Sin reclamar', phone: tel('32'),
        address: 'Calle 5 # 3-40', category: 'RESTAURANT', token: `tok-${marca}-${negociosCreados.length}`,
        claimed: false, acceptingOrders: true,
        ...(punto ? { lat: punto.lat, lng: punto.lng } : {}),
        ...(citySlug ? { citySlug } : {}),
      },
    });
    negociosCreados.push(b.id);
    const p = await prisma.product.create({
      data: { businessId: b.id, name: 'Bandeja paisa', price: 25_000, category: 'Platos' },
    });
    return { b, p };
  }

  /** Lo mismo que hace `POST /client/comercios/:id/comprar`. */
  async function comprar(businessId: string, productId: string) {
    const r = await comprarEnComercio(cliente.id, {
      businessId,
      items: [{ productId, quantity: 1 }],
      dropoffAddress: 'Carrera 6 # 8-20',
      dropoffLat: CERCA_PAMPLONA.lat,
      dropoffLng: CERCA_PAMPLONA.lng,
    });
    await matching.startErrandMatchingCycle(r.errand.id, r.ancla.lat, r.ancla.lng);
    await espera(300);
    return r;
  }
  const ofrecido = (errandId: string) => ofertas.some(
    (o) => o.msg['type'] === 'errand_request'
      && (o.msg['errand'] as { id?: string } | undefined)?.id === errandId
      && o.driverId === repartidor.id,
  );

  const mandados: string[] = [];

  console.log('\n[1] Local bien ubicado: la oferta llega');
  {
    const { b, p } = await ficha('Bien ubicado', CERCA_PAMPLONA, 'pamplona');
    const r = await comprar(b.id, p.id);
    mandados.push(r.errand.id);
    comprobar('ancla en el local', r.ancla.origen === 'comercio', r.ancla);
    comprobar('el repartidor de al lado recibe errand_request', ofrecido(r.errand.id), ofertas.map((o) => o.msg['type']));
  }

  console.log('\n[2] El caso del reporte: guardado en Bogotá, pero es de Pamplona');
  {
    ofertas.length = 0;
    const { b, p } = await ficha('Mal geocodificado', EN_BOGOTA, 'pamplona');
    const r = await comprar(b.id, p.id);
    mandados.push(r.errand.id);
    comprobar('NO ancla en el punto de Bogotá: va al centro de su ciudad', r.ancla.origen === 'ciudad', r.ancla);
    comprobar('y la oferta le llega al repartidor de Pamplona', ofrecido(r.errand.id), ofertas.map((o) => o.msg['type']));
    const e = await prisma.errand.findUniqueOrThrow({ where: { id: r.errand.id } });
    comprobar('el mandado no lleva el pin de Bogotá', e.pickupLat == null || Math.abs(e.pickupLat - 4.6) > 1, e.pickupLat);
  }

  console.log('\n[3] Contraprueba: un local de verdad lejos no le ofrece al de Pamplona');
  {
    ofertas.length = 0;
    const { b, p } = await ficha('En Bogotá', EN_BOGOTA, 'bogota');
    const r = await comprar(b.id, p.id);
    mandados.push(r.errand.id);
    comprobar('ancla en el local de Bogotá', r.ancla.origen === 'comercio', r.ancla);
    comprobar('la oferta NO sale para un repartidor a 400 km', !ofrecido(r.errand.id), ofertas.map((o) => o.msg['type']));
  }

  console.log('\n[4] Abrir ficha con ciudad, sin geocodificador: queda en su ciudad y despacha');
  {
    ofertas.length = 0;
    const f = await abrirFichaDeComercio({
      name: `${marca} Ficha nueva`, address: 'Calle 5 # 3-40', category: 'restaurant', city: 'pamplona',
    });
    negociosCreados.push(f.id);
    const b = await prisma.business.findUniqueOrThrow({ where: { id: f.id } });
    comprobar('guarda la ciudad declarada', b.citySlug === 'pamplona', b.citySlug);
    comprobar('sin punto confiable, no inventa coordenadas', b.lat == null && f.ubicada === false, { lat: b.lat, ubicada: f.ubicada });
    const p = await prisma.product.create({ data: { businessId: b.id, name: 'Arepa', price: 6_000, category: 'Platos' } });
    const r = await comprar(b.id, p.id);
    mandados.push(r.errand.id);
    comprobar('y su compra llega al repartidor de Pamplona', ofrecido(r.errand.id), r.ancla);
    let rechazo = '';
    try {
      await abrirFichaDeComercio({ name: `${marca} X`, address: 'Calle 1', category: 'restaurant', city: 'narnia' });
    } catch (e) { rechazo = (e as Error).message; }
    comprobar('una ciudad inventada se rechaza diciendo cuál', /narnia/.test(rechazo), rechazo);
  }

  console.log('\n[5] La lista de ubicación dudosa');
  {
    const dudosos = (await listarComerciosMalUbicados()).filter((d) => d.name.startsWith(marca));
    const motivo = (n: string) => dudosos.find((d) => d.name.endsWith(n))?.motivo;
    comprobar('el de Bogotá que dice ser de Pamplona sale como «lejos de su ciudad»', motivo('Mal geocodificado') === 'lejos-de-su-ciudad', dudosos);
    comprobar('la ficha sin punto sale como «sin punto»', motivo('Ficha nueva') === 'sin-punto');
    comprobar('el bien ubicado no sale', motivo('Bien ubicado') === undefined);
    comprobar('el de Bogotá en Bogotá no sale', motivo('En Bogotá') === undefined);
  }

  console.log('\n[6] Diagnóstico por mandado');
  {
    const ref = (await prisma.errand.findUniqueOrThrow({ where: { id: mandados[1]! } })).requestRef;
    const d = await diagnoseMandado(ref);
    comprobar('encuentra el mandado por su referencia', d?.mandado.ref === ref);
    comprobar('dice en qué ciudad busca', d?.mandado.plaza === 'pamplona', d?.mandado);
    comprobar('y el repartidor sale como «recibiría la oferta»',
      d?.drivers.some((x) => x.id === repartidor.id && x.dispatchable) === true);
  }

  console.log('\n[7] Cuando la búsqueda se rinde, el cliente lo ve y puede reintentar');
  {
    const id = mandados[2]!; // el de Bogotá: nadie cerca
    matching.rendirBusqueda('errand', id);
    await espera(300);
    const dto = await errands.getClientErrandById(cliente.id, id);
    comprobar('el mandado dice «sin repartidor»', dto?.sinRepartidor === true, dto?.status);
    const otroCliente = await prisma.user.create({ data: { phone: tel('33') } });
    comprobar('otro cliente no puede reabrirlo', (await errands.reabrirBusquedaMandado(otroCliente.id, id)) === null);
    const donde = await errands.reabrirBusquedaMandado(cliente.id, id);
    comprobar('el dueño lo reabre', donde !== null, donde);
    comprobar('reabierto ya no dice «sin repartidor»', (await errands.getClientErrandById(cliente.id, id))?.sinRepartidor !== true);
    comprobar('reabrir una búsqueda viva no se permite (no hay dos ciclos)', (await errands.reabrirBusquedaMandado(cliente.id, id)) === null);
    await prisma.user.delete({ where: { id: otroCliente.id } });
  }

  for (const id of mandados) matching.cancelSearchRetry(`errand:${id}`);
  await prisma.errand.deleteMany({ where: { id: { in: mandados } } });
  await prisma.product.deleteMany({ where: { businessId: { in: negociosCreados } } });
  await prisma.business.deleteMany({ where: { id: { in: negociosCreados } } });
  await prisma.driver.delete({ where: { id: repartidor.id } });
  await prisma.user.delete({ where: { id: cliente.id } });

  console.log(`\n${ok} bien · ${fallos} mal`);
  await prisma.$disconnect();
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
