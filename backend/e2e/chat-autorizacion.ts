/**
 * E2E de la autorización del chat del viaje.
 *
 * El usuario reportó «No autorizado.» al abrir el chat desde la app del
 * conductor. `git` dice que ningún commit reciente tocó el chat, así que hace
 * falta saber si el backend autoriza bien o no: esto lo comprueba contra
 * PostgreSQL real, que es donde vive la verdad.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/chat-autorizacion.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

async function esperaError(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return '(no lanzó)';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function main(): Promise<void> {
  const { getTripChat } = await import('../src/services/trip-chat.service');

  const marca = `e2echat-${Date.now()}`;
  const pasajero = await prisma.user.create({
    data: { phone: `+5730${Math.floor(10000000 + Math.random() * 89999999)}`, name: `${marca}-pas` },
  });
  const conductor = await prisma.driver.create({
    data: {
      phone: `+5739${Math.floor(10000000 + Math.random() * 89999999)}`,
      name: `${marca}-con`, status: 'ONLINE', isVerified: true,
    },
  });
  const otroConductor = await prisma.driver.create({
    data: {
      phone: `+5739${Math.floor(10000000 + Math.random() * 89999999)}`,
      name: `${marca}-otro`, status: 'ONLINE', isVerified: true,
    },
  });

  const viaje = await prisma.trip.create({
    data: {
      requestRef: `NXM-${Math.floor(1000 + Math.random() * 8000)}`,
      passengerId: pasajero.id,
      driverId: conductor.id,
      serviceType: 'TAXI',
      status: 'ARRIVED',
      originAddress: 'A', originLat: 7.3754, originLng: -72.6486,
      destAddress: 'B', destLat: 7.3921, destLng: -72.6602,
      estimatedFare: 8000,
    },
  });

  console.log('\n═══ Un viaje con conductor asignado ═══');
  {
    const comoConductor = await getTripChat(viaje.id, conductor.id);
    comprobar('el CONDUCTOR asignado entra al chat', Array.isArray(comoConductor));
    const comoPasajero = await getTripChat(viaje.id, pasajero.id);
    comprobar('el PASAJERO entra al chat', Array.isArray(comoPasajero));
  }

  console.log('\n═══ Quien no es parte del viaje, no entra ═══');
  {
    const msg = await esperaError(() => getTripChat(viaje.id, otroConductor.id));
    comprobar('otro conductor recibe «No autorizado.»', msg === 'No autorizado.', msg);
  }

  console.log('\n═══ Un viaje TODAVÍA SIN conductor ═══');
  {
    const sinConductor = await prisma.trip.create({
      data: {
        requestRef: `NXM-${Math.floor(1000 + Math.random() * 8000)}`,
        passengerId: pasajero.id,
        serviceType: 'TAXI',
        status: 'SEARCHING',
        originAddress: 'A', originLat: 7.3754, originLng: -72.6486,
        destAddress: 'B', destLat: 7.3921, destLng: -72.6602,
        estimatedFare: 8000,
      },
    });
    const msg = await esperaError(() => getTripChat(sinConductor.id, conductor.id));
    comprobar(
      'un conductor NO asignado recibe «No autorizado.»',
      msg === 'No autorizado.',
      msg,
    );
    comprobar(
      'y el pasajero sí puede abrirlo aunque no haya conductor',
      Array.isArray(await getTripChat(sinConductor.id, pasajero.id)),
    );
    await prisma.trip.delete({ where: { id: sinConductor.id } });
  }

  console.log('\n═══ Un id que no existe ═══');
  {
    const msg = await esperaError(() => getTripChat('id-inventado-xyz', conductor.id));
    comprobar('se distingue de «no autorizado»', msg === 'El servicio no existe.', msg);
  }

  await prisma.tripMessage.deleteMany({ where: { tripId: viaje.id } });
  await prisma.trip.deleteMany({ where: { passengerId: pasajero.id } });
  await prisma.driver.deleteMany({ where: { id: { in: [conductor.id, otroConductor.id] } } });
  await prisma.user.delete({ where: { id: pasajero.id } });

  console.log(`\n${fallos === 0 ? '✅ La autorización del chat funciona' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
