/**
 * E2E del camino completo del taxi: cotizar → pedir → que le llegue A UN TAXI.
 *
 * El E2E anterior (tarifa-taxi.ts) prueba el precio. Este prueba lo otro que
 * tiene que ser cierto para la empresa que se presenta: que un viaje pedido
 * como TAXI se le ofrezca a un taxi y NO a la moto o al particular que estén
 * más cerca. Es la diferencia entre "la app tiene un botón de taxi" y "la app
 * despacha taxis".
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/taxi-extremo-a-extremo.ts
 */
import { prisma } from '../src/lib/prisma';

process.env['TAXI_BANDERAZO_COP'] = '4800';
process.env['TAXI_POR_KM_COP'] = '1200';
process.env['TAXI_CARRERA_MINIMA_COP'] = '7000';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

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
  nombre: string, tipo: 'TAXI' | 'PARTICULAR' | 'MOTO',
  pos: { lat: number; lng: number },
): Promise<string> {
  const d = await prisma.driver.create({
    data: {
      phone: `+5739${Math.floor(10000000 + Math.random() * 89999999)}`,
      name: nombre, status: 'ONLINE', isVerified: true, acceptsTrips: true,
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: d.id, type: tipo, isActive: true,
      brand: 'Prueba', model: tipo, plate: `X${Math.floor(1000 + Math.random() * 8999)}`,
      year: 2020, color: 'Blanco',
    },
  });
  await ubicar(d.id, pos.lat, pos.lng);
  return d.id;
}

async function main(): Promise<void> {
  const matching = await import('../src/services/matching.service');
  const { requestClientTrip } = await import('../src/services/client.service');

  const marca = `e2ee2e-${Date.now()}`;
  const creados: string[] = [];

  // La moto y el particular, MÁS CERCA que el taxi: si el filtro por tipo de
  // vehículo no funcionara, la oferta se iría a uno de ellos.
  creados.push(await crearConductor(`${marca}-moto`, 'MOTO', { lat: 7.3755, lng: -72.6487 }));
  creados.push(await crearConductor(`${marca}-part`, 'PARTICULAR', { lat: 7.3756, lng: -72.6488 }));
  const idTaxi = await crearConductor(`${marca}-taxi`, 'TAXI', { lat: 7.3790, lng: -72.6520 });
  creados.push(idTaxi);

  const cliente = await prisma.user.create({
    data: { phone: `+5730${Math.floor(10000000 + Math.random() * 89999999)}`, name: marca },
  });

  // Se captura a quién se le ofrece el viaje, sin WebSocket real.
  const ofertas: Array<{ driverId: string; tipo: string }> = [];
  matching.registerSendToDriver((driverId, msg) => {
    ofertas.push({ driverId, tipo: (msg as { type?: string }).type ?? '?' });
    return true;
  });

  console.log('\n═══ Un viaje pedido como TAXI se le ofrece a un taxi ═══');
  const viaje = await requestClientTrip(cliente.id, {
    serviceType: 'taxi',
    originAddress: 'Parque principal',
    destinationAddress: 'Terminal',
    originLat: ORIGEN.lat, originLng: ORIGEN.lng,
    destLat: DESTINO.lat, destLng: DESTINO.lng,
  });

  // El ciclo de emparejamiento arranca en segundo plano.
  await new Promise((r) => setTimeout(r, 600));

  const guardado = await prisma.trip.findUnique({
    where: { id: viaje.id },
    select: { serviceType: true, estimatedFare: true },
  });
  comprobar('el viaje queda registrado como TAXI', guardado?.serviceType === 'TAXI',
    `${guardado?.serviceType}`);
  comprobar('con la tarifa del decreto', (guardado?.estimatedFare ?? 0) >= 7000,
    `${guardado?.estimatedFare}`);

  const deViaje = ofertas.filter((o) => o.tipo === 'trip_request');
  comprobar('se ofreció a alguien', deViaje.length > 0, 'nadie recibió la oferta');
  comprobar(
    'y ese alguien es EL TAXI, no la moto ni el particular que estaban más cerca',
    deViaje.length > 0 && deViaje[0]!.driverId === idTaxi,
    `se ofreció a ${deViaje[0]?.driverId}`,
  );

  // El ícono del mapa NO se elige por el servicio, sino por el vehículo real
  // asignado: `driverVehicleType` es lo único que hace que el pasajero vea el
  // taxi amarillo visto desde arriba y no el carro oscuro genérico. Si el DTO
  // llega sin ese campo, el mapa cae al respaldo y dibuja un particular en un
  // viaje de taxi — que es exactamente lo que se reportó.
  console.log('\n═══ Aceptado: el pasajero recibe el TIPO de vehículo ═══');
  {
    const { getClientTripSnapshot } = await import('../src/services/client.service');
    const aceptado = await matching.onDriverAccept(viaje.id, idTaxi);
    comprobar('el taxi puede aceptar la oferta', aceptado, 'onDriverAccept devolvió false');
    const dto = await getClientTripSnapshot(viaje.id);
    comprobar(
      'el DTO trae driverVehicleType = TAXI (ícono amarillo cenital)',
      dto?.driverVehicleType === 'TAXI',
      `llegó ${dto?.driverVehicleType ?? 'sin tipo'}`,
    );
    comprobar('y la placa del vehículo, para la ficha del conductor',
      !!dto?.vehiclePlate, 'sin placa');
  }

  // Limpieza (se cancela el viaje para cortar el ciclo de reintentos).
  matching.cancelSearchRetry(`trip:${viaje.id}`);
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
