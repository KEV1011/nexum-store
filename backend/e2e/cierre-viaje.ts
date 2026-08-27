/**
 * E2E del cierre del viaje y del rescate de los que se quedaron a medias.
 *
 * El fallo que motiva esto: la app cerraba el viaje mandando un mensaje por
 * WebSocket sin acuse de recibo. Con el socket caído el mensaje se descartaba en
 * silencio y la app enseñaba el resumen igual — el pasajero se quedaba "en
 * trayecto" para siempre, no se liquidaba nada y el conductor quedaba ON_TRIP,
 * o sea, fuera del despacho sin enterarse.
 *
 * Aquí se comprueba lo que sostiene el arreglo: que cerrar por HTTP liquida y
 * libera de verdad, que nadie puede cerrar el viaje de otro, que un segundo
 * cierre no paga dos veces, y que el barrido devuelve al ruedo a quien se quedó
 * colgado sin tocar a quien sí está trabajando.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/cierre-viaje.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}
async function motivoDelFallo(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return '(no lanzó)'; } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const tel = (p: string) => `+57${p}${Math.floor(10000000 + Math.random() * 89999999)}`;

async function main(): Promise<void> {
  const { driverUpdateTripStatus } = await import('../src/services/client.service');
  const { liberarConductoresColgados, contarViajesColgados } =
    await import('../src/services/dispatch-recovery.service');

  const marca = `e2ecierre-${Date.now()}`;
  const cliente = await prisma.user.create({
    data: { phone: tel('30'), name: marca },
  });
  const conductor = await prisma.driver.create({
    data: { phone: tel('39'), name: `${marca}-con`, status: 'ON_TRIP', isVerified: true },
  });
  const ajeno = await prisma.driver.create({
    data: { phone: tel('39'), name: `${marca}-ajeno`, status: 'ONLINE', isVerified: true },
  });

  const nuevoViaje = () => prisma.trip.create({
    data: {
      requestRef: `NXM-${Math.floor(100000 + Math.random() * 899999)}`,
      passengerId: cliente.id,
      driverId: conductor.id,
      serviceType: 'PARTICULAR',
      status: 'IN_PROGRESS',
      originAddress: 'Parque', originLat: 7.3754, originLng: -72.6486,
      destAddress: 'Terminal', destLat: 7.3921, destLng: -72.6602,
      estimatedFare: 9000, distanceKm: 3.2, etaMinutes: 11,
    },
  });

  console.log('\n═══ Cerrar por HTTP liquida y libera ═══');
  {
    const viaje = await nuevoViaje();
    const { trip, settlement } = await driverUpdateTripStatus(
      conductor.id, viaje.id, 'completed',
    );

    comprobar('el viaje queda COMPLETED', trip.status === 'completed', trip.status);
    comprobar('con tarifa final sellada', (settlement?.finalFare ?? 0) > 0,
      JSON.stringify(settlement));
    comprobar('y con neto y comisión', (settlement?.netEarning ?? 0) > 0 &&
      (settlement?.commission ?? 0) > 0, JSON.stringify(settlement));
    comprobar(
      'la comisión es la diferencia exacta, no una cuenta aparte',
      Math.abs((settlement!.finalFare - settlement!.netEarning) - settlement!.commission) < 1,
      `${settlement!.finalFare} - ${settlement!.netEarning} ≠ ${settlement!.commission}`,
    );

    const d = await prisma.driver.findUnique({ where: { id: conductor.id } });
    comprobar('el conductor vuelve a ONLINE (vuelve al despacho)',
      d?.status === 'ONLINE', String(d?.status));

    const ganancia = await prisma.driverEarning.findFirst({
      where: { driverId: conductor.id },
      orderBy: { createdAt: 'desc' },
    });
    comprobar('la ganancia queda registrada en su billetera', ganancia != null);
  }

  console.log('\n═══ Nadie cierra el viaje de otro ═══');
  {
    await prisma.driver.update({ where: { id: conductor.id }, data: { status: 'ON_TRIP' } });
    const viaje = await nuevoViaje();
    const motivo = await motivoDelFallo(() =>
      driverUpdateTripStatus(ajeno.id, viaje.id, 'completed'));
    comprobar('el conductor ajeno es rechazado', motivo.includes('no está asignado'), motivo);

    const sigue = await prisma.trip.findUnique({ where: { id: viaje.id } });
    comprobar('y el viaje sigue en curso', sigue?.status === 'IN_PROGRESS', String(sigue?.status));
  }

  console.log('\n═══ Un segundo cierre no paga dos veces ═══');
  {
    const viaje = await nuevoViaje();
    await driverUpdateTripStatus(conductor.id, viaje.id, 'completed');
    const antes = await prisma.driverEarning.count({ where: { driverId: conductor.id } });

    // Un doble toque, un reintento tras un acuse perdido: llega dos veces.
    await driverUpdateTripStatus(conductor.id, viaje.id, 'completed');
    const despues = await prisma.driverEarning.count({ where: { driverId: conductor.id } });

    comprobar('la ganancia no se duplica', antes === despues, `${antes} → ${despues}`);
  }

  console.log('\n═══ El barrido devuelve al ruedo a quien se quedó colgado ═══');
  {
    const viejo = new Date(Date.now() - 90 * 60 * 1000);
    const colgado = await prisma.driver.create({
      data: {
        phone: tel('39'), name: `${marca}-colgado`,
        status: 'ON_TRIP', isVerified: true, lastSeenAt: viejo,
      },
    });
    // Conduciendo de verdad: reportó hace un minuto. No se le puede tocar.
    const trabajando = await prisma.driver.create({
      data: {
        phone: tel('39'), name: `${marca}-trabajando`,
        status: 'ON_TRIP', isVerified: true, lastSeenAt: new Date(Date.now() - 60 * 1000),
      },
    });
    const viajeColgado = await prisma.trip.create({
      data: {
        requestRef: `NXM-${Math.floor(100000 + Math.random() * 899999)}`,
        passengerId: cliente.id, driverId: colgado.id,
        serviceType: 'PARTICULAR', status: 'IN_PROGRESS',
        originAddress: 'Parque', originLat: 7.3754, originLng: -72.6486,
        destAddress: 'Terminal', destLat: 7.3921, destLng: -72.6602,
        estimatedFare: 9000, distanceKm: 3.2, etaMinutes: 11,
        createdAt: viejo, updatedAt: viejo,
      },
    });

    const liberados = await liberarConductoresColgados();
    comprobar('libera al menos a uno', liberados >= 1, String(liberados));

    const c = await prisma.driver.findUnique({ where: { id: colgado.id } });
    comprobar('el colgado deja de estar ON_TRIP', c?.status === 'OFFLINE', String(c?.status));

    const t = await prisma.driver.findUnique({ where: { id: trabajando.id } });
    comprobar('al que SÍ está conduciendo no se le toca',
      t?.status === 'ON_TRIP', String(t?.status));

    // Lo que nunca hay que hacer: dar por terminado lo que no se sabe. Cerrar
    // paga una tarifa que quizá no se ganó; cancelar niega un servicio que
    // quizá sí se prestó. El viaje se queda como está y lo resuelve un humano.
    const v = await prisma.trip.findUnique({ where: { id: viajeColgado.id } });
    comprobar('el viaje NO se cierra ni se cancela solo',
      v?.status === 'IN_PROGRESS', String(v?.status));
    comprobar('y no se le inventa una tarifa final', v?.finalFare == null, String(v?.finalFare));

    const conteo = await contarViajesColgados();
    comprobar('queda contado para que el admin lo vea', conteo.total >= 1,
      JSON.stringify(conteo));

    await prisma.trip.deleteMany({ where: { driverId: colgado.id } });
    await prisma.driver.deleteMany({ where: { id: { in: [colgado.id, trabajando.id] } } });
  }

  // Limpieza.
  await prisma.driverEarning.deleteMany({ where: { driverId: conductor.id } });
  await prisma.trip.deleteMany({ where: { passengerId: cliente.id } });
  await prisma.driver.deleteMany({ where: { id: { in: [conductor.id, ajeno.id] } } });
  await prisma.user.delete({ where: { id: cliente.id } });

  console.log(`\n${fallos === 0 ? '✅ El cierre del viaje aguanta' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
