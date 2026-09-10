/**
 * E2E de la calificación del conductor.
 *
 * Las unitarias ya fijan la aritmética del promedio (lib/reputacion). Aquí se
 * comprueba lo que de verdad importa: que la nota del pasajero **llegue** al
 * conductor y que un conductor sin calificar **no enseñe un número que nadie le
 * dio** — que es lo que pasaba, con un 5,0 de fábrica idéntico para todos, en
 * la cifra que alguien mira antes de subirse al carro de un desconocido.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/calificacion-conductor.ts
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
    comprobar(nombre, patron.test(msg), msg);
  }
}

const tel = (p: string) => `+57${p}${Math.floor(10000000 + Math.random() * 89999999)}`;

async function main(): Promise<void> {
  const { rateClientTrip, rateTripPassenger, getClientTripSnapshot } =
    await import('../src/services/client.service');
  const { getDriverProStatus } = await import('../src/services/pro.service');
  const { fichaFromDriver, DRIVER_CARD_SELECT } = await import('../src/lib/driver-card');

  const marca = `e2ecal-${Date.now()}`;

  const conductor = await prisma.driver.create({
    data: { name: `${marca} Nelson`, phone: tel('31'), isVerified: true },
  });
  const pasajero = await prisma.user.create({
    data: { name: 'Pasajera', phone: tel('30') },
  });

  const crearViaje = async (estado: 'COMPLETED' | 'IN_PROGRESS' = 'COMPLETED') =>
    prisma.trip.create({
      data: {
        requestRef: `VJ-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
        passengerId: pasajero.id,
        driverId: conductor.id,
        status: estado,
        serviceType: 'TAXI',
        originAddress: 'Calle 5 #3-40',
        originLat: 7.3754, originLng: -72.6486,
        destAddress: 'Carrera 8 #12-20',
        destLat: 7.38, destLng: -72.65,
        estimatedFare: 9000, distanceKm: 2.4, etaMinutes: 8,
      },
    });

  // ── 1. Un conductor nuevo no tiene nota ────────────────────────────────────
  console.log('\n1. El conductor recién registrado');
  {
    const enBd = await prisma.driver.findUniqueOrThrow({ where: { id: conductor.id } });
    comprobar('NO nace con 5,0', enBd.rating === null, String(enBd.rating));
    comprobar('y con el conteo en cero', enBd.ratingCount === 0);

    // La ficha que ve el pasajero: sin nota, el campo no viaja y la app dice
    // «Nuevo». Antes viajaba un 5,0 y se pintaba la estrella.
    const d = await prisma.driver.findUniqueOrThrow({
      where: { id: conductor.id },
      select: DRIVER_CARD_SELECT,
    });
    const ficha = fichaFromDriver(d, null);
    comprobar('la ficha del pasajero NO trae nota inventada',
      ficha.driverRating === undefined, String(ficha.driverRating));
  }

  // ── 2. La nota del pasajero llega al conductor ─────────────────────────────
  console.log('\n2. El pasajero califica');
  {
    const v = await crearViaje();
    await rateClientTrip(pasajero.id, v.id, 4, '  Muy amable, buen carro  ');

    const enBd = await prisma.driver.findUniqueOrThrow({ where: { id: conductor.id } });
    comprobar('la nota llega al conductor', enBd.rating === 4, String(enBd.rating));
    comprobar('y queda contada', enBd.ratingCount === 1, String(enBd.ratingCount));

    const viaje = await prisma.trip.findUniqueOrThrow({ where: { id: v.id } });
    comprobar('el comentario se guarda recortado',
      viaje.ratingComment === 'Muy amable, buen carro', String(viaje.ratingComment));

    const ficha = fichaFromDriver(
      await prisma.driver.findUniqueOrThrow({
        where: { id: conductor.id }, select: DRIVER_CARD_SELECT,
      }), null);
    comprobar('y ya viaja en la ficha del pasajero', ficha.driverRating === 4);
  }

  // ── 3. El promedio se RECALCULA, no se suma encima ─────────────────────────
  console.log('\n3. El promedio');
  {
    const v2 = await crearViaje();
    await rateClientTrip(pasajero.id, v2.id, 2, null);
    const dos = await prisma.driver.findUniqueOrThrow({ where: { id: conductor.id } });
    comprobar('con dos notas, el promedio de las dos',
      dos.rating === 3 && dos.ratingCount === 2, `${dos.rating} / ${dos.ratingCount}`);

    // Corregirse: la nota se reemplaza y el promedio se rehace de las filas.
    await rateClientTrip(pasajero.id, v2.id, 5, null);
    const corregido = await prisma.driver.findUniqueOrThrow({ where: { id: conductor.id } });
    comprobar('corregir una estrella recalcula, no acumula',
      corregido.rating === 4.5 && corregido.ratingCount === 2,
      `${corregido.rating} / ${corregido.ratingCount}`);
  }

  // ── 4. Los rechazos ────────────────────────────────────────────────────────
  console.log('\n4. Lo que no se puede calificar');
  {
    const enCurso = await crearViaje('IN_PROGRESS');
    await rechaza('un viaje que aún no termina',
      () => rateClientTrip(pasajero.id, enCurso.id, 5, null), /ya terminó/);

    const v = await crearViaje();
    await rechaza('seis estrellas',
      () => rateClientTrip(pasajero.id, v.id, 6, null), /1 a 5/);
    await rechaza('media estrella',
      () => rateClientTrip(pasajero.id, v.id, 4.5, null), /entero/);

    const otro = await prisma.user.create({ data: { name: 'Otro', phone: tel('32') } });
    await rechaza('el viaje de otra persona',
      () => rateClientTrip(otro.id, v.id, 5, null), /no existe/);
    await prisma.user.delete({ where: { id: otro.id } });
  }

  // ── 5. Nexum Pro deja de apoyarse en el 5,0 de fábrica ─────────────────────
  console.log('\n5. Nexum Pro');
  {
    const nuevo = await prisma.driver.create({
      data: {
        name: `${marca} SinNota`, phone: tel('33'), isVerified: true,
        // Servicios de sobra para Plata, pero sin una sola calificación.
        totalTrips: 300,
      },
    });
    const estado = await getDriverProStatus(nuevo.id);
    comprobar('sin calificaciones la nota va nula, no en 5,0',
      estado.rating === null, String(estado.rating));
    comprobar('y NO se le concede un nivel que exige estrellas',
      estado.level === 'BRONCE', estado.level);
    await prisma.driver.delete({ where: { id: nuevo.id } });
  }

  // ── 5b. El conductor califica al PASAJERO ──────────────────────────────────
  console.log('\n5b. La otra dirección: el conductor califica');
  {
    const antes = await prisma.user.findUniqueOrThrow({ where: { id: pasajero.id } });
    comprobar('el pasajero tampoco nace con 5,0', antes.rating === null, String(antes.rating));

    const v = await crearViaje();
    await rateTripPassenger(conductor.id, v.id, 5);
    const despues = await prisma.user.findUniqueOrThrow({ where: { id: pasajero.id } });
    comprobar('la nota del conductor llega al pasajero',
      despues.rating === 5 && despues.ratingCount === 1,
      `${despues.rating} / ${despues.ratingCount}`);

    const v2 = await crearViaje();
    await rateTripPassenger(conductor.id, v2.id, 3);
    const dos = await prisma.user.findUniqueOrThrow({ where: { id: pasajero.id } });
    comprobar('y se promedia', dos.rating === 4, String(dos.rating));

    const enCurso = await crearViaje('IN_PROGRESS');
    await rechaza('no puede calificar un viaje sin terminar',
      () => rateTripPassenger(conductor.id, enCurso.id, 5), /ya terminó/);

    const ajeno = await prisma.driver.create({
      data: { name: `${marca} Ajeno`, phone: tel('34') },
    });
    await rechaza('ni el viaje de otro conductor',
      () => rateTripPassenger(ajeno.id, v.id, 1), /no existe/);
    await prisma.driver.delete({ where: { id: ajeno.id } });
  }

  // ── 6. La nota viaja en el DTO del viaje ───────────────────────────────────
  console.log('\n6. Lo que ve la app durante el viaje');
  {
    const v = await crearViaje();
    const dto = await getClientTripSnapshot(v.id, pasajero.id);
    comprobar('el DTO del viaje trae la nota real del conductor',
      dto?.driverRating === 4.5, String(dto?.driverRating));
  }

  // Limpieza.
  await prisma.trip.deleteMany({ where: { driverId: conductor.id } });
  await prisma.driver.delete({ where: { id: conductor.id } });
  await prisma.user.delete({ where: { id: pasajero.id } });

  console.log(
    `\n${fallos === 0
      ? '✅ La nota del conductor es la que le dieron, y sin votos no hay número'
      : `❌ ${fallos} fallo(s)`}\n`,
  );
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
