/**
 * E2E de las paradas en el viaje urbano.
 *
 * Lo que hay que demostrar no es que se guarden —eso es una columna— sino que
 * COBREN: si añadir paradas no encarece el viaje, el pasajero mete tres desvíos
 * y el conductor conduce de más por el mismo dinero. Y que el conductor las vea
 * ANTES de aceptar, porque después ya no puede rechazar.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/paradas-viaje.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}
async function esperaError(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return '(no lanzó)'; } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const ORIGEN = { lat: 7.3754, lng: -72.6486 };
const DESTINO = { lat: 7.3921, lng: -72.6602 };
// Un desvío claro hacia el oeste: obliga a rodear.
const DESVIO = { lat: 7.3800, lng: -72.6750 };

async function main(): Promise<void> {
  const { requestClientTrip, getClientTripSnapshot } = await import('../src/services/client.service');
  const matching = await import('../src/services/matching.service');

  const marca = `e2epar-${Date.now()}`;
  const cliente = await prisma.user.create({
    data: { phone: `+5730${Math.floor(10000000 + Math.random() * 89999999)}`, name: marca },
  });

  const pedir = (stops?: { name: string; lat?: number; lng?: number; order: number }[]) =>
    requestClientTrip(cliente.id, {
      serviceType: 'particular',
      originAddress: 'Parque principal',
      destinationAddress: 'Terminal',
      originLat: ORIGEN.lat, originLng: ORIGEN.lng,
      destLat: DESTINO.lat, destLng: DESTINO.lng,
      estimatedFare: 0, distanceKm: 0, etaMinutes: 0,
      ...(stops ? { stops } : {}),
    });

  console.log('\n═══ El desvío se cobra ═══');
  const directo = await pedir();
  const conParada = await pedir([{ name: 'Farmacia', ...DESVIO, order: 0 }]);

  comprobar('el viaje directo tiene precio', directo.estimatedFare > 0, `${directo.estimatedFare}`);
  comprobar(
    'con parada el trayecto es MÁS LARGO',
    conParada.distanceKm > directo.distanceKm,
    `${conParada.distanceKm} km vs ${directo.distanceKm} km`,
  );
  comprobar(
    'y por tanto MÁS CARO',
    conParada.estimatedFare > directo.estimatedFare,
    `${conParada.estimatedFare} vs ${directo.estimatedFare}`,
  );

  console.log('\n═══ Una parada sin coordenadas no inventa kilómetros ═══');
  const sinCoords = await pedir([{ name: 'Donde mi tía', order: 0 }]);
  comprobar(
    'se guarda pero no altera la distancia',
    Math.abs(sinCoords.distanceKm - directo.distanceKm) < 0.05,
    `${sinCoords.distanceKm} vs ${directo.distanceKm}`,
  );
  comprobar('y el nombre queda registrado',
    sinCoords.stops?.[0]?.name === 'Donde mi tía', JSON.stringify(sinCoords.stops));

  console.log('\n═══ El conductor las ve ANTES de aceptar ═══');
  {
    const snap = await getClientTripSnapshot(conParada.id);
    comprobar('el DTO del viaje las lleva', (snap?.stops?.length ?? 0) === 1,
      JSON.stringify(snap?.stops));

    // Y la OFERTA de verdad: se pone un conductor cerca y se captura el
    // mensaje que le llega. Comprobar solo el DTO del cliente no diría nada
    // sobre lo que ve quien tiene que decidir si acepta.
    const d = await prisma.driver.create({
      data: {
        phone: `+5739${Math.floor(10000000 + Math.random() * 89999999)}`,
        name: `${marca}-con`, status: 'ONLINE', isVerified: true, acceptsTrips: true,
      },
    });
    await prisma.vehicle.create({
      data: {
        driverId: d.id, type: 'PARTICULAR', isActive: true,
        brand: 'Prueba', model: 'X', plate: `Z${Math.floor(1000 + Math.random() * 8999)}`,
        year: 2020, color: 'Blanco',
      },
    });
    await prisma.$executeRaw`
      UPDATE "drivers"
      SET "geo" = ST_SetSRID(ST_MakePoint(${ORIGEN.lng}, ${ORIGEN.lat}), 4326)::geography,
          "lastSeenAt" = now(), "lastLat" = ${ORIGEN.lat}, "lastLng" = ${ORIGEN.lng}
      WHERE "id" = ${d.id}`;

    const recibido: Array<Record<string, unknown>> = [];
    matching.registerSendToDriver((_id, msg) => {
      recibido.push(msg as Record<string, unknown>);
      return true;
    });

    const conDesvio = await pedir([{ name: 'Farmacia', ...DESVIO, order: 0 }]);
    await new Promise((r) => setTimeout(r, 700));

    const oferta = recibido.find((m) => m['type'] === 'trip_request');
    const viaje = oferta?.['trip'] as { stops?: { name: string }[] } | undefined;
    comprobar('llegó la oferta al conductor', !!oferta, 'ninguna');
    comprobar(
      'y trae las paradas',
      viaje?.stops?.[0]?.name === 'Farmacia',
      JSON.stringify(viaje?.stops),
    );

    matching.cancelSearchRetry(`trip:${conDesvio.id}`);
    await prisma.trip.deleteMany({ where: { driverId: d.id } });
    await prisma.vehicle.deleteMany({ where: { driverId: d.id } });
    await prisma.driver.delete({ where: { id: d.id } });
  }

  console.log('\n═══ Lo que NO se acepta ═══');
  {
    const sinNombre = await esperaError(() => pedir([{ name: '   ', order: 0 }]));
    comprobar('una parada sin nombre se rechaza',
      sinNombre.includes('nombre'), sinNombre);

    const demasiadas = await esperaError(() =>
      pedir(Array.from({ length: 7 }, (_, i) => ({ name: `P${i}`, order: i }))));
    comprobar('más de seis paradas se rechazan',
      demasiadas.includes('Máximo'), demasiadas);
  }

  console.log('\n═══ Un viaje sin paradas sigue igual que siempre ═══');
  comprobar('no aparece el campo si no se pidieron', directo.stops === undefined,
    JSON.stringify(directo.stops));

  // Limpieza.
  for (const t of [directo, conParada, sinCoords]) {
    matching.cancelSearchRetry(`trip:${t.id}`);
  }
  await prisma.trip.deleteMany({ where: { passengerId: cliente.id } });
  await prisma.user.delete({ where: { id: cliente.id } });

  console.log(`\n${fallos === 0 ? '✅ Las paradas se cobran y se ven' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
