/**
 * E2E: la línea de tiempo se ADAPTA a la forma del pedido.
 *
 * `e2e/trazabilidad-pedido.ts` ya cubre el domicilio urbano. Faltaban las otras
 * tres formas, que son justamente las que motivaron la plantilla: con cinco
 * etiquetas fijas, una encomienda en bus decía «Repartidor recogiendo» durante
 * seis horas y un pedido en mesa prometía un repartidor que no existe.
 *
 * LO QUE SE COMPRUEBA:
 *
 *  1. **En mesa**: cuatro pasos, ninguno de reparto, y la línea LLEGA al
 *     comensal (la rama existía en la plantilla y nadie la consumía: el DTO de
 *     mesa no la traía, o sea código muerto).
 *  2. **Encomienda en taquilla**: tiene el tramo intermunicipal y cierra «en
 *     la taquilla»; NO tiene «en camino hacia ti», porque nadie se la lleva.
 *  3. **Encomienda a la puerta**: añade «llegó a tu ciudad» y el reparto.
 *  4. **El cliente va por ella**: al recogerla en taquilla el pedido se cierra
 *     y la línea CAMBIA de forma sola, porque `lastMile` dejó de ser cierto.
 *  5. **Nunca se inventa una hora** en ninguna de las formas.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/linea-tiempo-formas.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
let ok = 0;
function comprobar(nombre: string, cond: boolean, detalle?: unknown): void {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else {
    fallos++;
    console.log(`  ✗ ${nombre}`, detalle !== undefined ? JSON.stringify(detalle) : '');
  }
}

const tel = (p: string): string =>
  `+57${p}${Math.floor(1000000 + Math.random() * 8999999)}`;

const CUCUTA = {
  slug: 'cucuta', name: 'Cúcuta', department: 'Norte de Santander',
  lat: 7.8939, lng: -72.5078,
};
const BUCARAMANGA = {
  slug: 'bucaramanga', name: 'Bucaramanga', department: 'Santander',
  lat: 7.1193, lng: -73.1227,
};

interface Paso { clave: string; titulo: string; at: string | null; estado: string }
const claves = (pasos: Paso[]): string[] => pasos.map((p) => p.clave);
const paso = (pasos: Paso[], clave: string): Paso | undefined =>
  pasos.find((p) => p.clave === clave);

async function main(): Promise<void> {
  const {
    createBusinessProduct, updateBusinessLocation, updateBusinessShipping,
  } = await import('../src/services/business.service');
  const {
    placeClientOrder, acceptOrderByBusiness, getClientOrderById,
  } = await import('../src/services/client.service');
  const {
    crearPedidoEnMesa, getPedidoEnMesa, marcarServido, guardarMesas,
    asegurarCodigoDeCarta,
  } = await import('../src/services/mesa.service');
  const {
    adjuntarEncomienda, recogerEnTaquilla,
  } = await import('../src/services/encomiendas.service');
  const { createCargoTrip } = await import('../src/services/cargo-trip.service');
  const {
    receiveManifest, dispatchManifest,
  } = await import('../src/services/manifest.service');

  const marca = `e2eltf-${Date.now()}`;

  for (const c of [CUCUTA, BUCARAMANGA]) {
    await prisma.municipality.upsert({
      where: { slug: c.slug },
      update: { lat: c.lat, lng: c.lng, isActive: true },
      create: { ...c, isActive: true },
    });
  }

  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Restaurante`, ownerName: 'Dueña', category: 'RESTAURANT',
      address: 'Av 0 #10-20', phone: tel('31'), token: `tok-${marca}`,
      acceptingOrders: true, deliveryFee: 4000, etaMinutes: 30,
    },
  });
  await updateBusinessLocation(negocio.id, CUCUTA.lat, CUCUTA.lng);

  const plato = await createBusinessProduct(negocio.id, {
    name: 'Bandeja paisa', price: 25000, category: 'Platos',
  } as never);
  const pid = (plato as { id: string }).id;

  const cliente = await prisma.user.create({
    data: { name: 'Marta Ruiz', phone: tel('32') },
  });

  // ═══ 1. El pedido en mesa ════════════════════════════════════════════════
  console.log('\n1. En mesa: cuatro pasos y ningún repartidor');
  await guardarMesas(negocio.id, ['1', '2', '3']);
  const codigo = await asegurarCodigoDeCarta(negocio.id);

  const enMesa = await crearPedidoEnMesa(codigo, {
    mesa: '2',
    items: [{ productId: pid, quantity: 2 }],
  });
  comprobar(
    'el pedido en mesa YA trae su línea de tiempo',
    Array.isArray(enMesa.timeline) && enMesa.timeline.length > 0,
    enMesa.timeline,
  );

  const pasosMesa = (enMesa.timeline ?? []) as Paso[];
  comprobar(
    'y son los del salón, no los de un domicilio',
    JSON.stringify(claves(pasosMesa))
      === JSON.stringify(['realizado', 'confirmado', 'preparando', 'entregado']),
    claves(pasosMesa),
  );
  comprobar(
    'NO promete repartidor a quien está sentado en el local',
    !claves(pasosMesa).includes('recogiendo')
      && !claves(pasosMesa).includes('reparto'),
    claves(pasosMesa),
  );
  comprobar(
    'el último paso se llama «Servido en tu mesa»',
    paso(pasosMesa, 'entregado')?.titulo === 'Servido en tu mesa',
    paso(pasosMesa, 'entregado')?.titulo,
  );
  comprobar(
    'el primer paso lleva su hora real',
    paso(pasosMesa, 'realizado')?.at != null,
  );
  comprobar(
    'y los que no han ocurrido van SIN hora',
    paso(pasosMesa, 'entregado')?.at === null,
    paso(pasosMesa, 'entregado')?.at,
  );

  await acceptOrderByBusiness(negocio.id, enMesa.id, 15);
  const trasAceptar = await getPedidoEnMesa(codigo, enMesa.id);
  const pasosAceptado = (trasAceptar?.timeline ?? []) as Paso[];
  comprobar(
    'la cocina acepta: «preparando» pasa a ser el paso actual, con su hora',
    paso(pasosAceptado, 'preparando')?.estado === 'actual'
      && paso(pasosAceptado, 'preparando')?.at != null,
    paso(pasosAceptado, 'preparando'),
  );
  comprobar(
    'y «confirmado» queda cumplido aunque nadie registrara ese estado',
    paso(pasosAceptado, 'confirmado')?.estado === 'cumplido',
    paso(pasosAceptado, 'confirmado'),
  );

  await marcarServido(negocio.id, enMesa.id);
  const servido = await getPedidoEnMesa(codigo, enMesa.id);
  const pasosServido = (servido?.timeline ?? []) as Paso[];
  comprobar(
    'servido: no queda ningún paso pendiente',
    pasosServido.every((p) => p.estado !== 'pendiente'),
    pasosServido.map((p) => `${p.clave}:${p.estado}`),
  );
  comprobar(
    'y la entrega tiene la hora en que el mesero lo llevó',
    paso(pasosServido, 'entregado')?.at != null,
  );

  // ═══ 2. La encomienda ════════════════════════════════════════════════════
  await updateBusinessShipping(negocio.id, [
    { city: 'bucaramanga', fee: 15000, etaHours: 24 },
  ]);

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

  async function pedirLejos(lastMile: boolean) {
    return placeClientOrder(cliente.id, cliente.phone, {
      businessId: negocio.id,
      deliveryAddress: 'Cabecera, calle 48 #33-12',
      deliveryLat: BUCARAMANGA.lat,
      deliveryLng: BUCARAMANGA.lng,
      ...(lastMile ? { lastMile: true } : {}),
      items: [{ productId: pid, quantity: 1 }],
    } as never);
  }

  /** Sube la caja al bus y la despacha. Devuelve el id del remito. */
  async function subirAlBus(orderId: string): Promise<string> {
    const viaje = await createCargoTrip(empresa.id, {
      originCity: 'cucuta', destCity: 'bucaramanga', plate: 'XYZ123',
    } as never);
    const remito = await adjuntarEncomienda(
      empresa.id, orderId, (viaje as { id: string }).id,
    );
    await dispatchManifest(
      empresa.id, remito.manifestId, { driverId: conductorBus.id } as never,
    );
    return remito.manifestId;
  }

  console.log('\n2. Encomienda en taquilla: con bus, sin repartidor');
  const taquilla = await pedirLejos(false);
  await acceptOrderByBusiness(negocio.id, taquilla.id, 20);
  const remitoT = await subirAlBus(taquilla.id);

  const enBus = await getClientOrderById(cliente.id, taquilla.id);
  const pasosBus = (enBus?.timeline ?? []) as Paso[];
  comprobar(
    'tiene el tramo intermunicipal',
    claves(pasosBus).includes('en_ruta_ciudad'),
    claves(pasosBus),
  );
  comprobar(
    'y NO tiene «en camino hacia ti»: nadie se la lleva a la puerta',
    !claves(pasosBus).includes('reparto')
      && !claves(pasosBus).includes('en_destino'),
    claves(pasosBus),
  );
  comprobar(
    'el tramo del bus es el paso ACTUAL y tiene su hora',
    paso(pasosBus, 'en_ruta_ciudad')?.estado === 'actual'
      && paso(pasosBus, 'en_ruta_ciudad')?.at != null,
    paso(pasosBus, 'en_ruta_ciudad'),
  );
  comprobar(
    'el último paso dice que se entrega EN LA TAQUILLA',
    (paso(pasosBus, 'entregado')?.titulo ?? '').includes('taquilla'),
    paso(pasosBus, 'entregado')?.titulo,
  );

  await receiveManifest(conductorBus.id, remitoT, {
    receivedByName: 'Marta Ruiz', receivedByIdNumber: '1090123456', items: [],
  } as never);
  const recibida = await getClientOrderById(cliente.id, taquilla.id);
  const pasosRecibida = (recibida?.timeline ?? []) as Paso[];
  comprobar(
    'al recibir el remito queda entregada, con hora',
    paso(pasosRecibida, 'entregado')?.at != null
      && pasosRecibida.every((p) => p.estado !== 'pendiente'),
    pasosRecibida.map((p) => `${p.clave}:${p.estado}`),
  );

  console.log('\n3. Encomienda a la puerta: un tramo más');
  const aPuerta = await pedirLejos(true);
  await acceptOrderByBusiness(negocio.id, aPuerta.id, 20);
  const remitoP = await subirAlBus(aPuerta.id);

  const puertaEnBus = await getClientOrderById(cliente.id, aPuerta.id);
  const pasosPuerta = (puertaEnBus?.timeline ?? []) as Paso[];
  comprobar(
    'tiene «llegó a tu ciudad» y el reparto final',
    claves(pasosPuerta).includes('en_destino')
      && claves(pasosPuerta).includes('reparto'),
    claves(pasosPuerta),
  );
  comprobar(
    'los pasos que faltan van sin hora: no se inventa ninguna',
    paso(pasosPuerta, 'en_destino')?.at === null
      && paso(pasosPuerta, 'reparto')?.at === null,
    pasosPuerta.map((p) => `${p.clave}:${p.at}`),
  );

  // El conductor del bus reporta dónde quedó la caja y entrega el remito: eso
  // arranca la última milla.
  await prisma.driver.update({
    where: { id: conductorBus.id },
    data: { lastLat: BUCARAMANGA.lat, lastLng: BUCARAMANGA.lng },
  });
  await receiveManifest(conductorBus.id, remitoP, {
    receivedByName: 'Bodega destino', receivedByIdNumber: '1090123456', items: [],
  } as never);
  await new Promise((r) => setTimeout(r, 1200));

  const enHub = await getClientOrderById(cliente.id, aPuerta.id);
  const pasosHub = (enHub?.timeline ?? []) as Paso[];
  comprobar(
    'al llegar a la ciudad, «llegó a tu ciudad» es el paso actual y con hora',
    paso(pasosHub, 'en_destino')?.estado === 'actual'
      && paso(pasosHub, 'en_destino')?.at != null,
    paso(pasosHub, 'en_destino'),
  );
  comprobar(
    'y el reparto sigue pendiente: todavía no hay quien la lleve',
    paso(pasosHub, 'reparto')?.estado === 'pendiente',
    paso(pasosHub, 'reparto'),
  );

  // ═══ 4. El cliente va por ella ═══════════════════════════════════════════
  console.log('\n4. No aparece repartidor y el cliente la recoge');
  const ajeno = await prisma.user.create({
    data: { name: 'Otro', phone: tel('33') },
  });
  const deOtro = await recogerEnTaquilla(ajeno.id, aPuerta.id);
  comprobar(
    'un pedido ajeno no se puede cerrar',
    deOtro.ok === false,
    deOtro,
  );

  const mio = await recogerEnTaquilla(cliente.id, aPuerta.id);
  comprobar('el dueño sí puede', mio.ok === true, mio);

  const cerrada = await getClientOrderById(cliente.id, aPuerta.id);
  comprobar(
    // El DTO manda el nombre que compara la app (`CustomerOrderStatus.name`),
    // no la etiqueta en español: son dos cosas y confundirlas ya dejó una vez
    // al cliente viendo «Confirmado» con su caja dentro del bus.
    'queda entregado',
    cerrada?.status === 'delivered',
    cerrada?.status,
  );
  const pasosCerrada = (cerrada?.timeline ?? []) as Paso[];
  comprobar(
    'la línea CAMBIA de forma: ya no hay paso de reparto a la puerta',
    !claves(pasosCerrada).includes('reparto'),
    claves(pasosCerrada),
  );
  comprobar(
    'y el cierre dice «en la taquilla», que es lo que de verdad pasó',
    (paso(pasosCerrada, 'entregado')?.titulo ?? '').includes('taquilla'),
    paso(pasosCerrada, 'entregado')?.titulo,
  );
  comprobar(
    'no queda ningún paso pendiente',
    pasosCerrada.every((p) => p.estado !== 'pendiente'),
    pasosCerrada.map((p) => `${p.clave}:${p.estado}`),
  );

  const repetida = await recogerEnTaquilla(cliente.id, aPuerta.id);
  comprobar(
    'tocar dos veces no la cierra dos veces',
    repetida.ok === false,
    repetida,
  );

  await prisma.$disconnect();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Comprobaciones: ${ok} en verde, ${fallos} en rojo`);
  if (fallos > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
