/**
 * Comodidades, condiciones del tiquete y la nota de la empresa, contra
 * PostgreSQL real.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *  · Que el baño del chip salga del PLANO guardado y no de lo que marcaron —
 *    son dos columnas distintas de la misma fila, y la prueba unitaria solo
 *    sabe de la función.
 *  · Que la nota de la empresa se promedie de las filas de DOS tablas
 *    (`seat_bookings` y `intercity_bookings`), que es lo que ninguna unitaria
 *    puede montar.
 *  · Y el defecto que esta tanda corrige: `rateIntercityBooking` guardaba la
 *    estrella y NO llegaba ni al conductor ni a la empresa. Aquí se comprueba
 *    con la fila delante.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/condiciones-y-nota.ts
 */
import { prisma } from '../src/lib/prisma';
import {
  publishPooledTrip,
  bookSeats,
  searchPooledTrips,
  getClientBookings,
  rateSeatBooking,
} from '../src/services/intercity-pool.service';
import { updateOperatorProfile, getOperatorProfile } from '../src/services/operator.service';
import { rateIntercityBooking } from '../src/services/intercity.service';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

const sufijo = () => Math.floor(10000 + Math.random() * 89999);

async function main() {
  const op = await prisma.operator.create({
    data: {
      legalName: 'Transportes del Norte E2E', nit: `NIT-${Date.now()}`,
      type: 'INTERCITY', status: 'ACTIVE', isVerified: true,
      contactPhone: `+5730011${sufijo()}`, city: 'pamplona',
    },
  });
  const driver = await prisma.driver.create({
    data: {
      name: 'Conductor Bus', phone: `+5730022${sufijo()}`,
      isVerified: true, status: 'ONLINE', operatorId: op.id,
    },
  });
  const ana = await prisma.user.create({
    data: { name: 'Ana', phone: `+5730033${sufijo()}` },
  });
  const beto = await prisma.user.create({
    data: { name: 'Beto', phone: `+5730044${sufijo()}` },
  });

  const manana = new Date(Date.now() + 24 * 3600 * 1000);
  const base = {
    origin: 'pamplona' as const, destination: 'cucuta' as const,
    vehicleDescription: 'Bus Marcopolo', departureTime: manana.toISOString(),
    totalSeats: 1, farePerSeat: 40000,
  };

  // ── 1. El baño sale del plano, no de lo que marquen ─────────────────────
  console.log('\n[1] Comodidades: el baño lo pone el plano de sillas');
  const conBano = await publishPooledTrip(
    driver.id, driver.name, driver.phone,
    {
      ...base,
      seatType: 'BUS',
      seatConfig: { izquierda: 2, derecha: 2, filas: 9, fondoCorrido: 4, bano: 'derecha' },
      // Se marca «bano» a mano A PROPÓSITO: tiene que dar igual.
      amenities: ['aire', 'usb', 'bano'],
    },
    { operatorId: op.id, licensedOperator: true },
  );
  check(conBano.amenities?.includes('bano') === true,
    'con baño dibujado, el chip aparece', conBano.amenities);
  check(conBano.amenities?.includes('aire') === true,
    'y las declaradas también', conBano.amenities);

  const sinBano = await publishPooledTrip(
    driver.id, driver.name, driver.phone,
    {
      ...base,
      seatType: 'BUSETA',
      seatConfig: { izquierda: 2, derecha: 1, filas: 6, fondoCorrido: 4 },
      // Aquí está la mentira que no puede salir: el plano NO tiene baño.
      amenities: ['aire', 'bano'],
    },
    { operatorId: op.id, licensedOperator: true },
  );
  check(sinBano.amenities?.includes('bano') === false,
    'sin baño en el plano NO se anuncia, aunque lo marquen',
    sinBano.amenities);

  const guardadas = await prisma.pooledTrip.findUnique({
    where: { id: sinBano.id }, select: { amenities: true },
  });
  check(
    Array.isArray(guardadas?.amenities) &&
      !(guardadas!.amenities as string[]).includes('bano'),
    'y ni siquiera se guarda en la base',
    guardadas?.amenities,
  );

  // ── 2. Condiciones del tiquete ──────────────────────────────────────────
  console.log('\n[2] Condiciones del tiquete');
  const antes = await searchPooledTrips({ origin: 'pamplona', destination: 'cucuta' });
  const previa = antes.find((t) => t.id === conBano.id);
  check(previa?.operatorPolicies === undefined,
    'sin publicarlas, la salida no trae ninguna', previa?.operatorPolicies);

  await updateOperatorProfile(op.id, {
    policies: {
      equipajePiezas: 2, equipajeKg: 20,
      mascotas: 'transportin', menores: 'con_autorizacion',
      cancelacionHoras: 4,
    },
  });
  const conPol = (await searchPooledTrips({ origin: 'pamplona', destination: 'cucuta' }))
    .find((t) => t.id === conBano.id);
  check((conPol?.operatorPolicies?.length ?? 0) === 4,
    'publicadas, viajan REDACTADAS con la salida', conPol?.operatorPolicies);
  check(
    conPol?.operatorPolicies?.some((l) => /se acuerda con la empresa/i.test(l)) === true,
    'y la de cancelación NO promete devolver el dinero',
    conPol?.operatorPolicies,
  );

  const perfil = await getOperatorProfile(op.id);
  check((perfil?.policyLines?.length ?? 0) === 4,
    'el portal recibe el MISMO texto que ve el pasajero', perfil?.policyLines);

  let rechazo = '';
  try {
    await updateOperatorProfile(op.id, { policies: { equipajeKg: 900 } });
  } catch (e) { rechazo = e instanceof Error ? e.message : ''; }
  check(/100/.test(rechazo), 'un cero de más en el equipaje se rechaza', rechazo);

  // ── 3. La nota de la empresa ────────────────────────────────────────────
  console.log('\n[3] Calificación de la empresa');
  const opAntes = await prisma.operator.findUnique({
    where: { id: op.id }, select: { rating: true, ratingCount: true },
  });
  check(opAntes?.rating === null && opAntes?.ratingCount === 0,
    'nace SIN nota: nada de un 5,0 de fábrica', opAntes);

  const reserva = await bookSeats(ana.id, 'Ana', ana.phone, conBano.id, {
    seatsBooked: 1, seats: [1],
  });
  const bookingAna = reserva.bookings?.[0] ?? (await prisma.seatBooking.findFirst({
    where: { tripId: conBano.id, userId: ana.id },
  }));
  const bookingAnaId = (bookingAna as { id: string }).id;

  let motivo = '';
  try {
    await rateSeatBooking(ana.id, bookingAnaId, 5);
  } catch (e) { motivo = e instanceof Error ? e.message : ''; }
  check(/termine el viaje/i.test(motivo),
    'no se puede calificar una salida que aún no ha salido', motivo);

  await prisma.pooledTrip.update({
    where: { id: conBano.id }, data: { status: 'COMPLETED' },
  });
  await rateSeatBooking(ana.id, bookingAnaId, 4, 'Puntual, buen bus');

  const tras1 = await prisma.operator.findUnique({
    where: { id: op.id }, select: { rating: true, ratingCount: true },
  });
  check(tras1?.rating === 4 && tras1?.ratingCount === 1,
    'la estrella llega a la EMPRESA', tras1);

  const cond1 = await prisma.driver.findUnique({
    where: { id: driver.id }, select: { rating: true, ratingCount: true },
  });
  check(cond1?.rating === 4,
    'y también al conductor: una salida de bus es un servicio suyo', cond1);

  // Ajena
  let ajena = '';
  try {
    await rateSeatBooking(beto.id, bookingAnaId, 1);
  } catch (e) { ajena = e instanceof Error ? e.message : ''; }
  check(/no encontrada/i.test(ajena), 'nadie califica la reserva de otro', ajena);

  // Corregible
  await rateSeatBooking(ana.id, bookingAnaId, 5);
  const tras2 = await prisma.operator.findUnique({
    where: { id: op.id }, select: { rating: true, ratingCount: true },
  });
  check(tras2?.rating === 5 && tras2?.ratingCount === 1,
    'corregir la nota NO suma una calificación nueva', tras2);

  // ── 4. El defecto: la estrella del intermunicipal no llegaba a nadie ────
  console.log('\n[4] El viaje intermunicipal también cuenta');
  const booking = await prisma.intercityBooking.create({
    data: {
      requestRef: `E2E-${Date.now()}`,
      userId: beto.id, driverId: driver.id, operatorId: op.id,
      origin: 'pamplona', destination: 'cucuta',
      departureTime: new Date(), seats: 'ONE',
      offeredFare: 30000, finalFare: 30000,
      status: 'COMPLETED', completedAt: new Date(),
    },
  });
  await rateIntercityBooking(beto.id, booking.id, 3, 'Se demoró');

  const tras3 = await prisma.operator.findUnique({
    where: { id: op.id }, select: { rating: true, ratingCount: true },
  });
  check(tras3?.ratingCount === 2, 'la empresa promedia sus DOS servicios', tras3);
  check(tras3?.rating === 4, 'y el promedio es el de las dos estrellas (5 y 3)', tras3);

  const cond2 = await prisma.driver.findUnique({
    where: { id: driver.id }, select: { rating: true, ratingCount: true },
  });
  check(cond2?.ratingCount === 2,
    'el conductor también: antes esta estrella se perdía', cond2);

  // ── 5. Todo llega a «Mis reservas» ──────────────────────────────────────
  console.log('\n[5] Lo que ve el pasajero en sus reservas');
  const mias = await getClientBookings(ana.id);
  const suya = mias.find((t) => t.id === conBano.id);
  check(suya?.operatorName === 'Transportes del Norte E2E',
    'con el nombre de la empresa', suya?.operatorName);
  // 4 y no 5: en el paso 4 la empresa recibió su segunda calificación (un 3
  // del viaje intermunicipal), y la nota es UNA sola para todos sus servicios.
  check(suya?.operatorRating === 4, 'su nota, ya promediada con la otra',
    suya?.operatorRating);
  check((suya?.operatorPolicies?.length ?? 0) === 4, 'sus condiciones', suya?.operatorPolicies);
  check(suya?.myBooking.rating === 5, 'y la calificación que ella dejó', suya?.myBooking.rating);

  // ── Limpieza ────────────────────────────────────────────────────────────
  await prisma.seatAssignment.deleteMany({ where: { trip: { operatorId: op.id } } });
  await prisma.seatBooking.deleteMany({ where: { trip: { operatorId: op.id } } });
  await prisma.pooledTrip.deleteMany({ where: { operatorId: op.id } });
  await prisma.intercityBooking.deleteMany({ where: { operatorId: op.id } });
  await prisma.user.deleteMany({ where: { id: { in: [ana.id, beto.id] } } });
  await prisma.driver.delete({ where: { id: driver.id } });
  await prisma.operator.delete({ where: { id: op.id } });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Comprobaciones: ${ok} en verde, ${fallos} en rojo`);
  await prisma.$disconnect();
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('\nERROR:', e);
  await prisma.$disconnect();
  process.exit(2);
});
