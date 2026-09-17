/**
 * E2E del envío entre ciudades — el cimiento del modelo de encomienda en bus.
 *
 * Lo que comprueba no es la aritmética (eso lo fijan las unitarias de
 * `lib/destinos-envio`), sino las tres formas en que esto cobraría mal contra
 * una base de verdad:
 *
 *   1. Que un pedido de la MISMA ciudad no pague flete por accidente.
 *   2. Que un pedido SIN coordenadas de entrega se trate como local, y no se le
 *      cuele un flete porque no se supo dónde vive el cliente.
 *   3. Que el precio y la ciudad queden SELLADOS: si el comercio se muda o
 *      cambia su tarifa mañana, el pedido de hoy no puede cambiar.
 *
 * Y de paso, que el relleno de la migración funcione sobre filas anteriores.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/envio-intermunicipal.ts
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

// Plazas reales y bien separadas: a más de 40 km unas de otras, así que
// `plazaDeCoordenadas` resuelve cada punto sin ambigüedad.
const CIUDADES = [
  { slug: 'cucuta', name: 'Cúcuta', department: 'Norte de Santander', lat: 7.8939, lng: -72.5078 },
  { slug: 'bucaramanga', name: 'Bucaramanga', department: 'Santander', lat: 7.1193, lng: -73.1227 },
  { slug: 'bogota', name: 'Bogotá', department: 'Cundinamarca', lat: 4.711, lng: -74.0721 },
  // Existe como plaza pero NO se declara como destino: es la que prueba el
  // rechazo. A 60 km de Cúcuta, así que no se confunde con ella.
  { slug: 'pamplona', name: 'Pamplona', department: 'Norte de Santander', lat: 7.3754, lng: -72.6486 },
];

async function main(): Promise<void> {
  const {
    createBusinessProduct, getBusinessPublicById,
    updateBusinessLocation, updateBusinessShipping,
  } = await import('../src/services/business.service');
  const { placeClientOrder } = await import('../src/services/client.service');

  const marca = `e2eenv-${Date.now()}`;

  // Las plazas tienen que existir ANTES de la primera llamada que resuelva
  // coordenadas: el resolutor cachea la tabla de municipios.
  for (const c of CIUDADES) {
    await prisma.municipality.upsert({
      where: { slug: c.slug },
      update: { lat: c.lat, lng: c.lng, isActive: true },
      create: { ...c, isActive: true },
    });
  }

  console.log('\n── El comercio sabe dónde está ──');

  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Mayorista`,
      ownerName: 'Dueño',
      category: 'OTHER',
      address: 'Av 0 #10-20',
      phone: tel('31'),
      token: `tok-${marca}`,
      acceptingOrders: true,
      deliveryFee: 4000,
      etaMinutes: 40,
      // Nace SIN plaza, como los comercios que ya estaban registrados.
      lat: null,
      lng: null,
    },
  });

  comprobar('nace sin plaza', negocio.citySlug === null, String(negocio.citySlug));

  // Fijar el punto en el mapa es la vía por la que un comercio ya registrado
  // consigue ciudad.
  await updateBusinessLocation(negocio.id, CIUDADES[0].lat, CIUDADES[0].lng);
  const conPlaza = await prisma.business.findUniqueOrThrow({ where: { id: negocio.id } });
  comprobar('al fijar el punto queda sellada la plaza',
    conPlaza.citySlug === 'cucuta', String(conPlaza.citySlug));

  console.log('\n── Declarar destinos ──');

  await rechaza('rechaza su propia ciudad como destino',
    () => updateBusinessShipping(negocio.id, [{ city: 'cucuta', fee: 10000, etaHours: 24 }]),
    /tu propia ciudad/i);

  await rechaza('rechaza un municipio que no existe',
    () => updateBusinessShipping(negocio.id, [{ city: 'ciudad-inventada', fee: 10000, etaHours: 24 }]),
    /No conocemos/i);

  await rechaza('rechaza el cero de más',
    () => updateBusinessShipping(negocio.id, [{ city: 'bogota', fee: 99_000_000, etaHours: 24 }]),
    /cero/i);

  await rechaza('rechaza la ciudad repetida',
    () => updateBusinessShipping(negocio.id, [
      { city: 'bogota', fee: 20000, etaHours: 24 },
      { city: 'bogota', fee: 30000, etaHours: 48 },
    ]),
    /repetida/i);

  const guardados = await updateBusinessShipping(negocio.id, [
    { city: 'bucaramanga', fee: 15000, etaHours: 24 },
    { city: 'bogota', fee: 28000, etaHours: 48 },
  ]);
  comprobar('guarda los dos destinos', guardados.length === 2, JSON.stringify(guardados));

  const vitrina = await getBusinessPublicById(negocio.id);
  comprobar('la vitrina publica la plaza y los destinos',
    vitrina.citySlug === 'cucuta' && vitrina.shipsTo?.length === 2,
    `${vitrina.citySlug} / ${JSON.stringify(vitrina.shipsTo)}`);

  console.log('\n── Comprar ──');

  const producto = await createBusinessProduct(negocio.id, {
    name: 'Caja de camisetas', price: 200000, category: 'Ropa',
  } as never);
  const pid = (producto as { id: string }).id;

  const cliente = await prisma.user.create({
    data: { name: 'Cliente', phone: tel('32') },
  });

  // (1) Misma ciudad: entrega normal, sin flete.
  const local = await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id,
    deliveryAddress: 'Barrio La Playa',
    deliveryLat: CIUDADES[0].lat + 0.01,
    deliveryLng: CIUDADES[0].lng + 0.01,
    items: [{ productId: pid, quantity: 1 }],
  } as never);
  const localBD = await prisma.order.findUniqueOrThrow({ where: { id: local.id } });
  comprobar('en la misma ciudad NO es intermunicipal', localBD.isIntercity === false);
  comprobar('en la misma ciudad no se cobra flete',
    localBD.intercityFee === null && localBD.total === 200000 + 4000, String(localBD.total));
  comprobar('el tiempo prometido es el del local',
    localBD.etaMinutes === 40, String(localBD.etaMinutes));

  // (2) Otra ciudad DECLARADA: flete sellado; el domicilio NO se cobra porque
  //     la recoge en la taquilla de destino.
  const lejos = await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id,
    deliveryAddress: 'Cabecera, Bucaramanga',
    deliveryLat: CIUDADES[1].lat,
    deliveryLng: CIUDADES[1].lng,
    items: [{ productId: pid, quantity: 1 }],
  } as never);
  const lejosBD = await prisma.order.findUniqueOrThrow({ where: { id: lejos.id } });
  comprobar('a otra ciudad SÍ es intermunicipal', lejosBD.isIntercity === true);
  comprobar('sella las dos plazas',
    lejosBD.originCitySlug === 'cucuta' && lejosBD.destCitySlug === 'bucaramanga',
    `${lejosBD.originCitySlug} → ${lejosBD.destCitySlug}`);
  // CORREGIDO en la pieza 5: esta comprobación afirmaba que se cobraba el
  // flete «APARTE del domicilio», y eso era el defecto — en un envío a otra
  // ciudad nadie hace un domicilio urbano: el comercio deja la caja en la
  // terminal y el cliente la recoge en la taquilla de destino. Se le estaba
  // cobrando un servicio que no existía. El domicilio solo se cobra si pide
  // que se la lleven a la puerta (`lastMile`), y entonces paga al repartidor
  // de DESTINO. La regla vive en lib/ultima-milla.ts.
  comprobar('cobra el flete declarado y NO el domicilio (recoge en taquilla)',
    lejosBD.intercityFee === 15000 && lejosBD.deliveryFee === 0,
    `flete=${lejosBD.intercityFee} domicilio=${lejosBD.deliveryFee}`);
  comprobar('el total suma producto + flete, sin domicilio',
    lejosBD.total === 200000 + 15000, String(lejosBD.total));
  comprobar('promete las horas que declaró el comercio, no 40 minutos',
    lejosBD.etaMinutes === 24 * 60, String(lejosBD.etaMinutes));

  // (3) Ciudad que EXISTE pero el comercio no declaró: se rechaza diciendo a
  // dónde sí despacha. Un «no disponible» a secas dejaría al cliente sin saber
  // si el problema es su dirección, la tienda o la ciudad.
  await rechaza('a una ciudad no declarada no deja comprar, y dice a cuáles sí',
    () => placeClientOrder(cliente.id, cliente.phone, {
      businessId: negocio.id,
      deliveryAddress: 'Centro, Pamplona',
      deliveryLat: CIUDADES[3].lat,
      deliveryLng: CIUDADES[3].lng,
      items: [{ productId: pid, quantity: 1 }],
    } as never),
    /despacha a: .*bucaramanga/i);

  const bogota = await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id,
    deliveryAddress: 'Chapinero',
    deliveryLat: CIUDADES[2].lat,
    deliveryLng: CIUDADES[2].lng,
    items: [{ productId: pid, quantity: 1 }],
  } as never);
  const bogotaBD = await prisma.order.findUniqueOrThrow({ where: { id: bogota.id } });
  comprobar('el segundo destino declarado también cobra lo suyo',
    bogotaBD.intercityFee === 28000 && bogotaBD.etaMinutes === 48 * 60,
    `${bogotaBD.intercityFee} / ${bogotaBD.etaMinutes}`);

  // (4) LA REGLA QUE MÁS IMPORTA: sin coordenadas de entrega, es local.
  const sinCoords = await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id,
    deliveryAddress: 'Una dirección escrita a mano',
    items: [{ productId: pid, quantity: 1 }],
  } as never);
  const sinCoordsBD = await prisma.order.findUniqueOrThrow({ where: { id: sinCoords.id } });
  comprobar('sin coordenadas de entrega el pedido es LOCAL y no paga flete',
    sinCoordsBD.isIntercity === false && sinCoordsBD.intercityFee === null
      && sinCoordsBD.destCitySlug === null,
    `inter=${sinCoordsBD.isIntercity} flete=${sinCoordsBD.intercityFee}`);

  console.log('\n── Lo sellado no se reescribe ──');

  // El comercio se muda a Bucaramanga y sube su tarifa.
  await updateBusinessLocation(negocio.id, CIUDADES[1].lat, CIUDADES[1].lng);
  await updateBusinessShipping(negocio.id, [{ city: 'bogota', fee: 99000, etaHours: 72 }]);

  const trasMudanza = await prisma.order.findUniqueOrThrow({ where: { id: lejosBD.id } });
  comprobar('el pedido de ayer conserva su plaza de origen',
    trasMudanza.originCitySlug === 'cucuta', String(trasMudanza.originCitySlug));
  const bogotaTras = await prisma.order.findUniqueOrThrow({ where: { id: bogotaBD.id } });
  comprobar('y su precio: la tarifa nueva no reescribe lo cobrado',
    bogotaTras.intercityFee === 28000, String(bogotaTras.intercityFee));

  const mudado = await prisma.business.findUniqueOrThrow({ where: { id: negocio.id } });
  comprobar('el comercio sí cambió de plaza',
    mudado.citySlug === 'bucaramanga', String(mudado.citySlug));

  console.log('\n── El relleno de la migración ──');

  // Una fila anterior a estas columnas: tiene coordenadas y no tiene plaza.
  const viejo = await prisma.business.create({
    data: {
      name: `${marca} Antiguo`, ownerName: 'X', category: 'OTHER',
      address: 'Vieja', phone: tel('33'), token: `tok-${marca}-old`,
      lat: CIUDADES[2].lat, lng: CIUDADES[2].lng,
    },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE "businesses" SET "citySlug" = NULL WHERE id = $1`, viejo.id,
  );
  // El MISMO UPDATE que corre la migración.
  await prisma.$executeRawUnsafe(`
    UPDATE "businesses" b SET "citySlug" = (
      SELECT m."slug" FROM "municipalities" m
      WHERE m."isActive" AND 2 * 6371 * asin(sqrt(
        power(sin(radians(m."lat" - b."lat") / 2), 2)
        + cos(radians(b."lat")) * cos(radians(m."lat"))
          * power(sin(radians(m."lng" - b."lng") / 2), 2))) <= 40
      ORDER BY 2 * 6371 * asin(sqrt(
        power(sin(radians(m."lat" - b."lat") / 2), 2)
        + cos(radians(b."lat")) * cos(radians(m."lat"))
          * power(sin(radians(m."lng" - b."lng") / 2), 2))) ASC
      LIMIT 1)
    WHERE b."lat" IS NOT NULL AND b."lng" IS NOT NULL AND b."citySlug" IS NULL`);
  const rellenado = await prisma.business.findUniqueOrThrow({ where: { id: viejo.id } });
  comprobar('el relleno le pone plaza a un comercio anterior',
    rellenado.citySlug === 'bogota', String(rellenado.citySlug));

  // Un punto en mitad del mar no pertenece a ninguna plaza: NULL, no una
  // ciudad cualquiera.
  const enElMar = await prisma.business.create({
    data: {
      name: `${marca} Mar`, ownerName: 'X', category: 'OTHER',
      address: 'Alta mar', phone: tel('34'), token: `tok-${marca}-mar`,
      lat: 12.5, lng: -80.0,
    },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE "businesses" SET "citySlug" = NULL WHERE id = $1`, enElMar.id,
  );
  await prisma.$executeRawUnsafe(`
    UPDATE "businesses" b SET "citySlug" = (
      SELECT m."slug" FROM "municipalities" m
      WHERE m."isActive" AND 2 * 6371 * asin(sqrt(
        power(sin(radians(m."lat" - b."lat") / 2), 2)
        + cos(radians(b."lat")) * cos(radians(m."lat"))
          * power(sin(radians(m."lng" - b."lng") / 2), 2))) <= 40
      ORDER BY 1 ASC LIMIT 1)
    WHERE b."lat" IS NOT NULL AND b."lng" IS NOT NULL AND b."citySlug" IS NULL`);
  const mar = await prisma.business.findUniqueOrThrow({ where: { id: enElMar.id } });
  comprobar('lo que cae lejos de toda plaza queda en NULL, no en una ciudad cualquiera',
    mar.citySlug === null, String(mar.citySlug));

  // ── Limpieza ───────────────────────────────────────────────────────────────
  await prisma.orderLine.deleteMany({ where: { order: { businessId: negocio.id } } });
  await prisma.order.deleteMany({ where: { businessId: negocio.id } });
  await prisma.product.deleteMany({ where: { businessId: negocio.id } });
  await prisma.business.deleteMany({ where: { name: { startsWith: marca } } });
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
