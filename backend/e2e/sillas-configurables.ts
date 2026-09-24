/**
 * El vehículo real de la empresa, contra PostgreSQL real.
 *
 * Lo que prueba y no se puede probar de otra forma: que el mapa que se DIBUJA
 * y la validación que ACEPTA la reserva salgan de la misma configuración. Si
 * cada uno usara la suya, el pasajero tocaría la silla 40 de su bus de 40 y el
 * servidor le diría que no existe — o peor al revés, y dos personas acabarían
 * con la misma silla. Ninguna prueba unitaria ve eso: hacen falta la fila
 * guardada y la transacción de reserva.
 */
import { prisma } from '../src/lib/prisma';
import {
  publishPooledTrip,
  bookSeats,
  getPooledTripById,
} from '../src/services/intercity-pool.service';

let fallos = 0;
let ok = 0;

function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

async function main() {
  const op = await prisma.operator.create({
    data: {
      legalName: 'Cootracarmen de Prueba', nit: `NIT-${Date.now()}`,
      type: 'INTERCITY', status: 'ACTIVE', isVerified: true,
      contactName: 'Gerente', contactPhone: '+573001112233', city: 'pamplona',
    },
  });
  const driver = await prisma.driver.create({
    data: {
      name: 'Conductor Bus', phone: `+5730022${Math.floor(10000 + Math.random() * 89999)}`,
      isVerified: true, status: 'ONLINE', operatorId: op.id,
    },
  });
  const user = await prisma.user.create({
    data: { name: 'Pasajera', phone: `+5730033${Math.floor(10000 + Math.random() * 89999)}` },
  });
  // Un SEGUNDO pasajero, y no es un detalle: con el mismo usuario el servicio
  // rechaza por «ya tienes una reserva en este viaje» ANTES de mirar la silla,
  // así que las dos comprobaciones de abajo pasaban por el motivo equivocado.
  const otro = await prisma.user.create({
    data: { name: 'Otro', phone: `+5730044${Math.floor(10000 + Math.random() * 89999)}` },
  });

  const manana = new Date(Date.now() + 24 * 3600 * 1000);
  const base = {
    origin: 'pamplona', destination: 'cucuta',
    vehicleDescription: 'Bus Marcopolo', departureTime: manana.toISOString(),
    totalSeats: 1, farePerSeat: 40000,
  };

  // ── 1. Un bus de 40, que con el molde fijo era imposible ────────────────
  console.log('\n[1] Bus de 40 puestos (2+2, 10 filas, fondo corrido de 4)');
  const bus40 = await publishPooledTrip(driver.id, driver.name, driver.phone, {
    ...base, seatType: 'BUS',
    seatConfig: { izquierda: 2, derecha: 2, filas: 10, fondoCorrido: 4 },
  } as never, { operatorId: op.id, licensedOperator: true });

  console.log(`    la salida quedó con ${bus40.totalSeats} puestos`);
  check(bus40.totalSeats === 40, 'la salida tiene exactamente 40 puestos', bus40.totalSeats);
  check(bus40.seatMap?.sillas === 40, 'el mapa dibuja 40 sillas', bus40.seatMap?.sillas);

  const guardado = await prisma.pooledTrip.findUnique({
    where: { id: bus40.id }, select: { seatConfig: true, totalSeats: true },
  });
  check(
    guardado?.seatConfig != null,
    'la configuración queda sellada en la salida (no se recalcula cada vez)',
    guardado?.seatConfig,
  );

  // ── 2. La silla 40 se puede comprar ─────────────────────────────────────
  console.log('\n[2] Comprar la silla 40 — la que antes «no existía»');
  const reserva = await bookSeats(user.id, 'Pasajera', user.phone, bus40.id, {
    seatsBooked: 1, seats: [40],
  } as never);
  check(reserva != null, 'la silla 40 se reserva sin problema');

  const trasReserva = await getPooledTripById(bus40.id, true);
  check(
    trasReserva?.seatMap?.ocupadas.includes(40) === true,
    'el mapa la muestra ocupada, así que nadie más la ve libre',
    trasReserva?.seatMap?.ocupadas,
  );
  check(
    trasReserva?.seatMap?.libres === 39,
    'quedan 39 libres, contadas de las ocupadas y no de un contador',
    trasReserva?.seatMap?.libres,
  );

  // ── 3. La 41 no existe y se rechaza diciendo por qué ────────────────────
  console.log('\n[3] Pedir la silla 41, que ese bus no tiene');
  let motivo41 = '';
  try {
    await bookSeats(otro.id, 'Otro', otro.phone, bus40.id, {
      seatsBooked: 1, seats: [41],
    } as never);
  } catch (e) {
    motivo41 = e instanceof Error ? e.message : String(e);
  }
  console.log(`    respondió: "${motivo41}"`);
  check(/41/.test(motivo41), 'se rechaza y dice CUÁL silla no existe', motivo41);

  // ── 4. La misma silla dos veces no se vende ─────────────────────────────
  console.log('\n[4] Otra persona pide la 40, ya vendida');
  let motivo40 = '';
  try {
    await bookSeats(otro.id, 'Otro', otro.phone, bus40.id, {
      seatsBooked: 1, seats: [40],
    } as never);
  } catch (e) {
    motivo40 = e instanceof Error ? e.message : String(e);
  }
  console.log(`    respondió: "${motivo40}"`);
  check(/40/.test(motivo40) && /tomada|ocupad/i.test(motivo40),
    'la silla vendida no se vuelve a vender, y dice cuál', motivo40);

  // ── 5. Una buseta de 19, la otra capacidad que era imposible ────────────
  console.log('\n[5] Buseta de 19 puestos');
  const buseta19 = await publishPooledTrip(driver.id, driver.name, driver.phone, {
    ...base, seatType: 'BUSETA',
    seatConfig: { izquierda: 2, derecha: 2, filas: 5, fondoCorrido: 4, frenteIzquierda: 1 },
  } as never, { operatorId: op.id, licensedOperator: true });
  console.log(`    quedó con ${buseta19.totalSeats} puestos`);
  check(buseta19.totalSeats === 19, 'la buseta tiene exactamente 19', buseta19.totalSeats);

  // ── 6. Una salida SIN configuración sigue igual que siempre ─────────────
  console.log('\n[6] Salida publicada sin declarar distribución (como las de antes)');
  const conMolde = await publishPooledTrip(driver.id, driver.name, driver.phone, {
    ...base, seatType: 'BUS',
  } as never, { operatorId: op.id, licensedOperator: true });
  console.log(`    quedó con ${conMolde.totalSeats} puestos`);
  check(conMolde.totalSeats === 38, 'usa el molde de siempre: 38', conMolde.totalSeats);

  const crudoMolde = await prisma.pooledTrip.findUnique({
    where: { id: conMolde.id }, select: { seatConfig: true },
  });
  check(crudoMolde?.seatConfig == null, 'y no se le inventa una configuración', crudoMolde?.seatConfig);

  // ── Limpieza ────────────────────────────────────────────────────────────
  await prisma.seatAssignment.deleteMany({ where: { trip: { driverId: driver.id } } });
  await prisma.seatBooking.deleteMany({ where: { trip: { driverId: driver.id } } });
  await prisma.pooledTrip.deleteMany({ where: { driverId: driver.id } });
  await prisma.user.deleteMany({ where: { id: { in: [user.id, otro.id] } } });
  await prisma.driver.delete({ where: { id: driver.id } });
  await prisma.operator.delete({ where: { id: op.id } });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Comprobaciones: ${ok} en verde, ${fallos} en rojo`);
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch((e) => { console.error('\nERROR:', e); process.exit(2); });
