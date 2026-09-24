/**
 * Quién viaja, cómo se paga, y ver las salidas sin buscar — contra PostgreSQL
 * real.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *  · Que `searchPooledTrips` SIN origen ni destino devuelva salidas de rutas
 *    distintas. Era el bloqueo del reporte: la app abría fija en
 *    Pamplona → Cúcuta y una salida Cúcuta → Bogotá existía mientras el
 *    pasajero leía «no hay viajes». La unitaria no puede montar dos rutas.
 *  · Que los pasajeros se GUARDEN en la fila y vuelvan por el DTO y por el
 *    manifiesto de la empresa: son tres saltos distintos sobre la misma
 *    columna JSON.
 *  · Que el texto del cobro viaje desde `operators.paymentInfo` hasta la
 *    tarjeta de la búsqueda, redactado por el servidor.
 *  · Y el guard que de verdad importa: la cuenta de pasajeros se valida
 *    contra los puestos REALES, no contra lo que mande el cliente.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/pasajeros-y-cobro.ts
 */
import { prisma } from '../src/lib/prisma';
import {
  publishPooledTrip,
  bookSeats,
  searchPooledTrips,
  getOperatorPooledTrips,
} from '../src/services/intercity-pool.service';
import { updateOperatorProfile, getOperatorProfile } from '../src/services/operator.service';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

async function rechaza(fn: () => Promise<unknown>, patron: RegExp, msg: string) {
  try {
    await fn();
    check(false, msg, 'no lanzó');
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    check(patron.test(m), msg, m);
  }
}

const sufijo = () => Math.floor(10000 + Math.random() * 89999);

const PAS = (n: number) => ({
  tipoDoc: 'CC', documento: `10901234${n}0`, nombre: `Pasajero ${n}`,
});

async function main() {
  const op = await prisma.operator.create({
    data: {
      legalName: 'Transportes Planilla E2E', nit: `NIT-${Date.now()}`,
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
  // Un usuario POR rechazo. Compartiéndolos, el primer intento que (mal) pasa
  // deja al siguiente chocando contra «ya tienes una reserva», y el motivo del
  // rojo deja de ser el que se estaba comprobando.
  const cobayas = await Promise.all(
    [0, 1, 2].map((i) =>
      prisma.user.create({ data: { name: `Cobaya ${i}`, phone: `+573005${i}${sufijo()}` } }),
    ),
  );

  const manana = new Date(Date.now() + 24 * 3600 * 1000);

  // ── 1. Ver todas las salidas sin buscar ─────────────────────────────────
  console.log('\n[1] El buscador abre mostrándolo TODO');
  const pamCuc = await publishPooledTrip(driver.id, driver.name, driver.phone, {
    origin: 'pamplona', destination: 'cucuta',
    vehicleDescription: 'Van Sprinter', departureTime: manana.toISOString(),
    totalSeats: 7, farePerSeat: 22000,
  }, { operatorId: op.id, licensedOperator: true });

  const cucBog = await publishPooledTrip(driver.id, driver.name, driver.phone, {
    origin: 'cucuta', destination: 'bogota',
    vehicleDescription: 'Bus Marcopolo', departureTime: manana.toISOString(),
    totalSeats: 6, farePerSeat: 90000,
  }, { operatorId: op.id, licensedOperator: true });

  const todas = await searchPooledTrips({});
  const ids = todas.map((t) => t.id);
  check(ids.includes(pamCuc.id), 'sin filtro sale la de Pamplona → Cúcuta');
  check(
    ids.includes(cucBog.id),
    'y TAMBIÉN la de Cúcuta → Bogotá, que con el filtro fijo era invisible',
  );

  const soloUna = await searchPooledTrips({ origin: 'cucuta', destination: 'bogota' });
  check(
    soloUna.some((t) => t.id === cucBog.id) && !soloUna.some((t) => t.id === pamCuc.id),
    'con filtro sigue filtrando: no se rompió la búsqueda',
  );

  // ── 2. Cómo cobra la empresa ────────────────────────────────────────────
  console.log('\n[2] El cobro lo declara la empresa y lo redacta el servidor');

  const sinDeclarar = (await searchPooledTrips({ origin: 'pamplona' }))
    .find((t) => t.id === pamCuc.id);
  check(
    (sinDeclarar?.operatorPayment ?? []).some((l) => /no ha publicado/i.test(l)),
    'sin declarar, la salida DICE que se acuerde con la empresa',
    sinDeclarar?.operatorPayment,
  );

  await rechaza(
    () => updateOperatorProfile(op.id, { paymentInfo: { medios: ['transferencia'] } }),
    /a qué cuenta/,
    'transferencia SIN cuenta se rechaza diciendo por qué',
  );

  await updateOperatorProfile(op.id, {
    paymentInfo: { medios: ['efectivo', 'transferencia'], detalle: 'Nequi 300 123 4567' },
  });

  const perfil = await getOperatorProfile(op.id);
  check(
    (perfil.paymentLines ?? []).some((l) => /Nequi 300 123 4567/.test(l)),
    'el portal ve el MISMO texto que leerá el pasajero',
    perfil.paymentLines,
  );

  const conCobro = (await searchPooledTrips({ origin: 'pamplona' }))
    .find((t) => t.id === pamCuc.id);
  check(
    (conCobro?.operatorPayment ?? []).some((l) => /Efectivo al abordar/.test(l)),
    'la salida publica el medio declarado',
    conCobro?.operatorPayment,
  );
  check(
    (conCobro?.operatorPayment ?? []).some((l) => /ZIPA no cobra/.test(l)),
    'y aclara SIEMPRE que la plata no pasa por la plataforma',
  );
  check(
    conCobro?.operatorPaymentSummary === '2 formas de pago',
    'la tarjeta lleva el resumen corto',
    conCobro?.operatorPaymentSummary,
  );

  // ── 3. La planilla ──────────────────────────────────────────────────────
  console.log('\n[3] Quién viaja en cada silla');

  const { booking } = await bookSeats(ana.id, 'Ana', ana.phone, pamCuc.id, {
    seatsBooked: 2,
    passengers: [PAS(1), PAS(2)],
  });
  check(booking.passengers?.length === 2, 'la reserva guarda los DOS pasajeros');
  check(
    booking.passengers?.[0]?.documento === PAS(1).documento,
    'con su documento, no con el nombre de la cuenta',
    booking.passengers,
  );

  const fila = await prisma.seatBooking.findUnique({ where: { id: booking.id } });
  check(Array.isArray(fila?.passengers), 'y quedan escritos en la columna');

  const delOperador = await getOperatorPooledTrips(op.id);
  const conManifiesto = delOperador.find((t) => t.id === pamCuc.id);
  const enManifiesto = conManifiesto?.bookings?.find((b) => b.id === booking.id);
  check(
    enManifiesto?.passengers?.length === 2,
    'el manifiesto de la empresa los muestra',
    enManifiesto?.passengers,
  );

  // ── 4. Los guards ───────────────────────────────────────────────────────
  console.log('\n[4] Lo que NO se admite');

  const c0 = cobayas[0]!, c1 = cobayas[1]!, c2 = cobayas[2]!;

  await rechaza(
    () => bookSeats(c0.id, c0.name!, c0.phone, pamCuc.id, {
      seatsBooked: 2, passengers: [PAS(3)],
    }),
    /2 puestos y enviaste 1 pasajero/,
    'menos pasajeros que puestos',
  );

  await rechaza(
    () => bookSeats(c1.id, c1.name!, c1.phone, pamCuc.id, {
      seatsBooked: 2, passengers: [PAS(4), PAS(4)],
    }),
    /repetido/,
    'el mismo documento en dos sillas',
  );

  await rechaza(
    () => bookSeats(c2.id, c2.name!, c2.phone, pamCuc.id, {
      seatsBooked: 1, passengers: [{ tipoDoc: 'NIT', documento: '900123', nombre: 'Empresa SA' }],
    }),
    /tipo de documento/,
    'un tipo de documento inventado',
  );

  // ── 5. Las apps viejas siguen reservando ────────────────────────────────
  console.log('\n[5] Compatibilidad con las apps ya instaladas');

  const { booking: vieja } = await bookSeats(beto.id, 'Beto', beto.phone, pamCuc.id, {
    seatsBooked: 1,
  });
  check(vieja.passengers === undefined, 'sin pasajeros la reserva pasa igual');
  check(
    vieja.id.length > 0,
    'y se crea de verdad: exigirlo hoy dejaría sin comprar a quien no actualizó',
  );

  // ── 6. Con la exigencia encendida ───────────────────────────────────────
  console.log('\n[6] Con PASAJEROS_EXIGIR_DOCUMENTO=true');
  process.env['PASAJEROS_EXIGIR_DOCUMENTO'] = 'true';
  await rechaza(
    () => bookSeats(beto.id, 'Beto', beto.phone, cucBog.id, { seatsBooked: 1 }),
    /documento de cada pasajero/,
    'ya no se reserva sin la planilla',
  );
  const { booking: conPlanilla } = await bookSeats(
    ana.id, 'Ana', ana.phone, cucBog.id, { seatsBooked: 1, passengers: [PAS(9)] },
  );
  check(conPlanilla.passengers?.length === 1, 'y con ella sí');
  delete process.env['PASAJEROS_EXIGIR_DOCUMENTO'];

  // ── Limpieza ────────────────────────────────────────────────────────────
  await prisma.seatAssignment.deleteMany({ where: { trip: { operatorId: op.id } } });
  await prisma.seatBooking.deleteMany({ where: { trip: { operatorId: op.id } } });
  await prisma.pooledTrip.deleteMany({ where: { operatorId: op.id } });
  await prisma.driver.delete({ where: { id: driver.id } });
  await prisma.operator.delete({ where: { id: op.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [ana.id, beto.id, ...cobayas.map((c) => c.id)] } },
  });

  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} comprobaciones OK, ${fallos} en rojo`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
