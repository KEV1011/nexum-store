/**
 * E2E de la silla numerada del intermunicipal, contra PostgreSQL real.
 *
 * Lo que se prueba, por orden de gravedad:
 *
 *  1. **DOS PERSONAS NO PUEDEN LLEVARSE LA MISMA SILLA.** Es la razón de ser
 *     de la tabla `seat_assignments` y de su índice único. La comprobación en
 *     código no basta: entre mirar y escribir hay milisegundos. Aquí se golpea
 *     el índice DIRECTAMENTE, porque dos llamadas seguidas al servicio no
 *     prueban nada —la segunda ya ve la escritura de la primera— y ese falso
 *     verde ya se documentó en el E2E de reservas de taxi.
 *  2. **Cancelar devuelve la silla al mapa.** Si no, el cupo se libera y la
 *     silla no: la salida diría «quedan 3» y no se podría comprar ninguna.
 *  3. **Los puestos los dice el vehículo, no el formulario.** Una van con 20
 *     puestos declarados vendería ocho sillas que no existen.
 *  4. **Las salidas SIN numerar siguen funcionando igual.** Es lo que hay hoy
 *     publicado y no se puede romper.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/sillas-numeradas.ts
 */
import { prisma } from '../src/lib/prisma';
import {
  publishPooledTrip,
  bookSeats,
  cancelSeatBooking,
  getPooledTripById,
  PooledTripError,
} from '../src/services/intercity-pool.service';
import { plantillaDe } from '../src/lib/mapa-asientos';

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

const tel = () => `+5730${Math.floor(10000000 + Math.random() * 89999999)}`;

async function nuevoUsuario(nombre: string) {
  return prisma.user.create({ data: { name: nombre, phone: tel() } });
}

async function main(): Promise<void> {
  console.log('\n═══ E2E: sillas numeradas del intermunicipal ═══\n');

  const conductor = await prisma.driver.create({
    data: { phone: tel(), name: 'Chofer Buseta', status: 'ONLINE', isVerified: true },
  });
  const ana = await nuevoUsuario('Ana');
  const beto = await nuevoUsuario('Beto');

  const manana = new Date(Date.now() + 26 * 3600_000);

  // ── 1. Publicar con vehículo ──────────────────────────────────────────
  console.log('1. La empresa publica con buseta');
  const salida = await publishPooledTrip(
    conductor.id,
    conductor.name,
    conductor.phone,
    {
      origin: 'pamplona',
      destination: 'cucuta',
      departureTime: manana.toISOString(),
      // A propósito un número ABSURDO: lo debe ignorar y usar el del mapa.
      totalSeats: 40,
      farePerSeat: 25000,
      vehicleDescription: 'Buseta Chevrolet • ABC 123',
      seatType: 'BUSETA',
      seatRows: 5,
    },
    { licensedOperator: true },
  );

  const esperadas = plantillaDe('BUSETA', 5).sillas;
  comprobar(
    'los puestos salen del VEHÍCULO, no del formulario',
    salida.totalSeats === esperadas,
    `totalSeats=${salida.totalSeats} esperado=${esperadas}`,
  );
  comprobar('viene el mapa de sillas', Boolean(salida.seatMap), 'sin seatMap');
  comprobar(
    'y todas empiezan libres',
    salida.seatMap?.libres === esperadas && salida.seatMap?.ocupadas.length === 0,
    JSON.stringify({ libres: salida.seatMap?.libres, ocupadas: salida.seatMap?.ocupadas }),
  );
  comprobar(
    'el mapa dibuja al conductor y la puerta',
    salida.seatMap!.filas[0]!.some((c) => c.tipo === 'conductor') &&
      salida.seatMap!.filas[0]!.some((c) => c.tipo === 'puerta'),
  );

  await rechaza(
    'un PARTICULAR no puede publicar una buseta con sillas',
    () =>
      publishPooledTrip(conductor.id, conductor.name, conductor.phone, {
        origin: 'pamplona', destination: 'chitaga',
        departureTime: new Date(Date.now() + 40 * 3600_000).toISOString(),
        totalSeats: 1, farePerSeat: 20000, vehicleDescription: 'Buseta pirata',
        seatType: 'BUSETA',
      }),
    /habilitadas/i,
  );

  // ── 2. Reservar sillas concretas ──────────────────────────────────────
  console.log('\n2. Ana toma las sillas 3 y 4');
  const r1 = await bookSeats(ana.id, 'Ana', ana.phone, salida.id, {
    seatsBooked: 2,
    seats: [3, 4],
  });
  comprobar('la reserva queda confirmada', r1.booking.status === 'confirmed');
  comprobar('con dos puestos', r1.booking.seatsBooked === 2, String(r1.booking.seatsBooked));

  const enBd = await prisma.seatAssignment.findMany({
    where: { tripId: salida.id },
    orderBy: { seatNumber: 'asc' },
  });
  comprobar(
    'y en la base quedan las DOS sillas',
    enBd.map((a) => a.seatNumber).join(',') === '3,4',
    enBd.map((a) => a.seatNumber).join(','),
  );

  const tras = await getPooledTripById(salida.id);
  comprobar(
    'el mapa las marca ocupadas',
    tras!.seatMap!.filas.flat().filter((c) => c.tipo === 'silla' && c.ocupada).length === 2,
  );
  comprobar('y descuenta las libres', tras!.seatMap!.libres === esperadas - 2);

  // ── 3. Lo que no se deja ──────────────────────────────────────────────
  console.log('\n3. Lo que se rechaza, diciendo por qué');
  await rechaza(
    'una silla ya vendida',
    () => bookSeats(beto.id, 'Beto', beto.phone, salida.id, { seatsBooked: 1, seats: [3] }),
    /tomada/i,
  );
  await rechaza(
    'una silla que no existe en ese vehículo',
    () => bookSeats(beto.id, 'Beto', beto.phone, salida.id, { seatsBooked: 1, seats: [99] }),
    /no existe/i,
  );
  await rechaza(
    'reservar sin elegir silla en una salida numerada',
    () => bookSeats(beto.id, 'Beto', beto.phone, salida.id, { seatsBooked: 1 }),
    /al menos una/i,
  );
  await rechaza(
    'la misma silla repetida en el mismo pedido',
    () => bookSeats(beto.id, 'Beto', beto.phone, salida.id, { seatsBooked: 2, seats: [7, 7] }),
    /repetida/i,
  );

  comprobar(
    'y ninguno de esos intentos dejó basura',
    (await prisma.seatAssignment.count({ where: { tripId: salida.id } })) === 2,
  );

  // ── 4. LA GARANTÍA: el índice único ───────────────────────────────────
  //
  // Se golpea la base directamente. Dos llamadas seguidas al servicio NO
  // prueban esto: la segunda ya ve la escritura de la primera y pasaría
  // igual con la guarda quitada. Lo que de verdad protege cuando Render
  // levanta dos instancias es el índice.
  console.log('\n4. La garantía contra la doble venta (índice único)');
  let choco = false;
  try {
    await prisma.seatAssignment.create({
      data: { tripId: salida.id, seatNumber: 3, bookingId: r1.booking.id },
    });
  } catch (e) {
    choco = String(e).includes('P2002') || /unique/i.test(String(e));
  }
  comprobar('la base RECHAZA una segunda fila para la misma silla', choco);

  comprobar(
    'pero la misma silla en OTRA salida sí se puede',
    await (async () => {
      const otra = await publishPooledTrip(conductor.id, conductor.name, conductor.phone, {
        origin: 'pamplona', destination: 'cucuta',
        departureTime: new Date(Date.now() + 50 * 3600_000).toISOString(),
        totalSeats: 1, farePerSeat: 25000, vehicleDescription: 'Van • XYZ 789',
        seatType: 'VAN',
      }, { licensedOperator: true });
      const r = await bookSeats(beto.id, 'Beto', beto.phone, otra.id, {
        seatsBooked: 1, seats: [3],
      });
      return r.booking.status === 'confirmed';
    })(),
  );

  // ── 5. Cancelar devuelve la silla ─────────────────────────────────────
  console.log('\n5. Cancelar devuelve la silla al mapa');
  await cancelSeatBooking(ana.id, r1.booking.id);
  const libres = await getPooledTripById(salida.id);
  comprobar(
    'las asignaciones desaparecen',
    (await prisma.seatAssignment.count({ where: { tripId: salida.id } })) === 0,
  );
  comprobar('el mapa vuelve a estar entero', libres!.seatMap!.libres === esperadas);
  comprobar(
    'y ahora otro SÍ puede tomar la 3',
    (await bookSeats(beto.id, 'Beto', beto.phone, salida.id, { seatsBooked: 1, seats: [3] }))
      .booking.status === 'confirmed',
  );

  // ── 6. Compatibilidad: salidas sin numerar ────────────────────────────
  console.log('\n6. Una salida SIN vehículo declarado sigue igual que siempre');
  const vieja = await publishPooledTrip(conductor.id, conductor.name, conductor.phone, {
    origin: 'pamplona', destination: 'chitaga',
    departureTime: new Date(Date.now() + 30 * 3600_000).toISOString(),
    totalSeats: 4, farePerSeat: 8000, vehicleDescription: 'Automóvil • QQQ 111',
  });
  comprobar('respeta los puestos del formulario', vieja.totalSeats === 4, String(vieja.totalSeats));
  comprobar('y NO trae mapa', vieja.seatMap === undefined);

  const sinSilla = await bookSeats(ana.id, 'Ana', ana.phone, vieja.id, { seatsBooked: 2 });
  comprobar('se reserva por cantidad, sin pedir silla', sinSilla.booking.seatsBooked === 2);
  comprobar(
    'y no crea asignaciones',
    (await prisma.seatAssignment.count({ where: { tripId: vieja.id } })) === 0,
  );

  await prisma.$disconnect();
  console.log(`\n${fallos === 0 ? '✓ TODO EN VERDE' : `✗ ${fallos} FALLO(S)`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
