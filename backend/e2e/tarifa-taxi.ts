/**
 * E2E del selector de categorías y de la tarifa del taxi.
 *
 * Comprueba contra PostgreSQL real las tres cosas que sostienen el arranque con
 * la empresa de taxis:
 *
 *   1. El pasajero ve las categorías con precio, ETA y cuántos vehículos hay,
 *      y no ve un taxi disponible cuando lo único conectado es una moto.
 *   2. El precio lo pone el SERVIDOR: si la app pide una carrera de $1, se
 *      guarda la tarifa real, no la del teléfono.
 *   3. Lo que se cotiza es lo que se cobra: un taxi liquida con la tarifa del
 *      decreto, no con la fórmula genérica, y a la tarifa regulada no se le
 *      aplica multiplicador por demanda.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/tarifa-taxi.ts
 */
import { prisma } from '../src/lib/prisma';

// La tarifa del decreto se carga ANTES de importar nada que la lea.
process.env['TAXI_BANDERAZO_COP'] = '4800';
process.env['TAXI_POR_KM_COP'] = '1200';
process.env['TAXI_CARRERA_MINIMA_COP'] = '7000';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

// Centro de Pamplona y un destino a ~2,5 km.
const ORIGEN = { lat: 7.3754, lng: -72.6486 };
const DESTINO = { lat: 7.3921, lng: -72.6602 };

async function ubicar(driverId: string, lat: number, lng: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "drivers"
    SET "geo" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        "lastSeenAt" = now(), "lastLat" = ${lat}, "lastLng" = ${lng}
    WHERE "id" = ${driverId}`;
}

async function crearConductor(
  nombre: string,
  tipo: 'TAXI' | 'PARTICULAR' | 'MOTO',
  pos: { lat: number; lng: number },
): Promise<string> {
  const d = await prisma.driver.create({
    data: {
      phone: `+5739${Math.floor(10000000 + Math.random() * 89999999)}`,
      name: nombre,
      status: 'ONLINE',
      isVerified: true,
      acceptsTrips: true,
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: d.id, type: tipo, isActive: true,
      brand: 'Prueba', model: tipo, plate: `E2E${Math.floor(100 + Math.random() * 899)}`,
      year: 2020, color: 'Blanco',
    },
  });
  await ubicar(d.id, pos.lat, pos.lng);
  return d.id;
}

async function main(): Promise<void> {
  const { getTripOptions } = await import('../src/services/trip-options.service');
  const { requestClientTrip, updateClientTripStatus } = await import('../src/services/client.service');
  const { tablaTarifas, precioCategoria } = await import('../src/lib/tarifa-categoria');

  const marca = `e2etax-${Date.now()}`;
  const creados: string[] = [];

  const cliente = await prisma.user.create({
    data: { phone: `+5730${Math.floor(10000000 + Math.random() * 89999999)}`, name: marca },
  });

  console.log('\n═══ 1. Sin nadie conectado ═══');
  {
    const o = await getTripOptions(ORIGEN.lat, ORIGEN.lng, DESTINO.lat, DESTINO.lng);
    const taxi = o.opciones.find((x) => x.categoria === 'TAXI')!;
    comprobar('se devuelven las tres categorías', o.opciones.length === 3, `${o.opciones.length}`);
    comprobar('el taxi sale con precio aunque no haya ninguno', taxi.fare > 0, `${taxi.fare}`);
    comprobar('...pero marcado como NO disponible', taxi.disponible === false);
    comprobar('sin vehículo cerca no se inventa un ETA', taxi.etaMinutes === null, `${taxi.etaMinutes}`);
    comprobar(
      'nadie se marca como "la más barata" si no hay ninguna disponible',
      o.opciones.every((x) => !x.cheapest),
    );
  }

  console.log('\n═══ 2. Solo hay una moto conectada ═══');
  {
    creados.push(await crearConductor(`${marca}-moto`, 'MOTO', { lat: 7.3760, lng: -72.6490 }));
    const o = await getTripOptions(ORIGEN.lat, ORIGEN.lng, DESTINO.lat, DESTINO.lng);
    const taxi = o.opciones.find((x) => x.categoria === 'TAXI')!;
    const moto = o.opciones.find((x) => x.categoria === 'MOTO')!;
    comprobar('la moto aparece disponible', moto.disponible && moto.availableNearby === 1);
    comprobar('la moto trae ETA real', (moto.etaMinutes ?? 0) > 0, `${moto.etaMinutes}`);
    comprobar(
      'el taxi NO se marca disponible por haber una moto cerca',
      taxi.disponible === false,
      'una moto no atiende una carrera de taxi',
    );
    comprobar(
      'con una sola opción disponible no se marca "la más barata"',
      o.opciones.every((x) => !x.cheapest),
    );
  }

  console.log('\n═══ 3. Con taxi y particular conectados ═══');
  {
    creados.push(await crearConductor(`${marca}-taxi`, 'TAXI', { lat: 7.3770, lng: -72.6500 }));
    creados.push(await crearConductor(`${marca}-part`, 'PARTICULAR', { lat: 7.3800, lng: -72.6520 }));
    const o = await getTripOptions(ORIGEN.lat, ORIGEN.lng, DESTINO.lat, DESTINO.lng);
    const taxi = o.opciones.find((x) => x.categoria === 'TAXI')!;
    const moto = o.opciones.find((x) => x.categoria === 'MOTO')!;

    comprobar('el taxi ya aparece disponible', taxi.disponible && taxi.availableNearby === 1);
    comprobar('el taxi cobra por decreto', taxi.regulada === true);
    comprobar('las tres tienen precio distinto de cero', o.opciones.every((x) => x.fare > 0));
    comprobar('la moto es la más barata de las disponibles', moto.cheapest === true);
    comprobar(
      'el taxi más cercano está más lejos que la moto ⇒ mayor ETA',
      (taxi.etaMinutes ?? 0) >= (moto.etaMinutes ?? 0),
      `taxi ${taxi.etaMinutes} vs moto ${moto.etaMinutes}`,
    );

    const esperado = precioCategoria(tablaTarifas().TAXI, o.distanceKm, o.durationMinutes).fare;
    comprobar('el precio del taxi es el del decreto', taxi.fare === esperado, `${taxi.fare} ≠ ${esperado}`);
    comprobar('el precio del taxi es múltiplo de 50', taxi.fare % 50 === 0, `${taxi.fare}`);
  }

  console.log('\n═══ 4. El precio lo pone el servidor, no el teléfono ═══');
  let tripId = '';
  {
    const viaje = await requestClientTrip(cliente.id, {
      serviceType: 'taxi',
      originAddress: 'Parque principal',
      destinationAddress: 'Terminal',
      originLat: ORIGEN.lat, originLng: ORIGEN.lng,
      destLat: DESTINO.lat, destLng: DESTINO.lng,
      // Lo que mandaría una petición modificada:
      estimatedFare: 1,
      distanceKm: 0.1,
      etaMinutes: 1,
    });
    tripId = viaje.id;
    const guardado = await prisma.trip.findUnique({
      where: { id: viaje.id },
      select: { estimatedFare: true, distanceKm: true, etaMinutes: true, surgeMultiplier: true },
    });
    comprobar(
      'la tarifa de $1 del cliente NO se guarda',
      (guardado?.estimatedFare ?? 0) > 1000,
      `se guardó ${guardado?.estimatedFare}`,
    );
    comprobar(
      'la distancia de 0,1 km del cliente NO se guarda',
      (guardado?.distanceKm ?? 0) > 0.5,
      `se guardó ${guardado?.distanceKm}`,
    );
    comprobar(
      'a un taxi nunca se le sella multiplicador por demanda',
      (guardado?.surgeMultiplier ?? 1) === 1,
      `${guardado?.surgeMultiplier}`,
    );
  }

  console.log('\n═══ 5. Lo que se cotiza es lo que se cobra ═══');
  {
    const antes = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { estimatedFare: true, distanceKm: true, etaMinutes: true },
    });
    const conductor = creados[1]!; // el taxi
    await prisma.trip.update({ where: { id: tripId }, data: { driverId: conductor, status: 'IN_PROGRESS' } });
    await updateClientTripStatus(tripId, 'completed');

    const cerrado = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { finalFare: true, netEarning: true, commission: true, status: true },
    });
    comprobar('el viaje quedó COMPLETED', cerrado?.status === 'COMPLETED');
    comprobar(
      'se cobró exactamente lo cotizado',
      cerrado?.finalFare === antes?.estimatedFare,
      `cotizado ${antes?.estimatedFare} · cobrado ${cerrado?.finalFare}`,
    );

    // La prueba de que ya NO se usa la fórmula genérica: con el decreto cargado
    // (banderazo 4.800 / km 1.200 / mínimo 7.000) los dos números difieren.
    const { calcFare } = await import('../src/lib/fare');
    const generica = calcFare(antes?.distanceKm ?? 0, antes?.etaMinutes ?? 0).grossFare;
    comprobar(
      'y NO con la fórmula genérica de la plataforma',
      cerrado?.finalFare !== generica,
      `ambas dieron ${generica}: la liquidación sigue ignorando la categoría`,
    );

    const suma = (cerrado?.netEarning ?? 0) + (cerrado?.commission ?? 0);
    comprobar('neto + comisión = bruto', suma === cerrado?.finalFare, `${suma} ≠ ${cerrado?.finalFare}`);
  }

  console.log('\n═══ 6. Un conductor sin GPS fresco no cuenta ═══');
  {
    await prisma.$executeRaw`
      UPDATE "drivers" SET "lastSeenAt" = now() - INTERVAL '10 minutes'
      WHERE "id" = ${creados[1]!}`;
    const o = await getTripOptions(ORIGEN.lat, ORIGEN.lng, DESTINO.lat, DESTINO.lng);
    const taxi = o.opciones.find((x) => x.categoria === 'TAXI')!;
    comprobar(
      'el taxi con GPS viejo desaparece de disponibles',
      taxi.disponible === false,
      'prometería un taxi que el despacho no le ofrecería a nadie',
    );
  }

  // Limpieza
  await prisma.trip.deleteMany({ where: { passengerId: cliente.id } });
  await prisma.driverEarning.deleteMany({ where: { driverId: { in: creados } } });
  await prisma.vehicle.deleteMany({ where: { driverId: { in: creados } } });
  await prisma.driver.deleteMany({ where: { id: { in: creados } } });
  await prisma.user.delete({ where: { id: cliente.id } });

  console.log(`\n${fallos === 0 ? '✅ Todo en verde' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
