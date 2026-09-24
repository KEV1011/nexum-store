/**
 * Auditoría del flujo de BUS (salidas programadas) contra PostgreSQL real.
 *
 * No prueba lo que las notas dicen: golpea el código y mira la base. Comprueba
 * tres cosas que solo se ven ejecutando:
 *
 *  1. En qué formato queda la ciudad de una salida — la tanda de municipios
 *     pasó la columna a slug minúscula, y hay que ver si el servicio lo
 *     respeta.
 *  2. Si una salida publicada antes de esa migración sigue siendo visible.
 *  3. Si un municipio fuera de los siete del enum viejo funciona igual.
 */
import { prisma } from '../src/lib/prisma';
import { publishPooledTrip, searchPooledTrips } from '../src/services/intercity-pool.service';

let fallos = 0;
let ok = 0;
const pendientes: string[] = [];

function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

/**
 * Hueco de producto conocido, no un fallo.
 *
 * Hoy no queda ninguno abierto —los tres que había (remito en salida, rastro
 * GPS y posición del bus) se cerraron y pasaron a `check`—, pero el mecanismo
 * se conserva: la próxima auditoría del bus encontrará otros, y éste es el
 * sitio donde anotarlos sin que tumben la corrida.
 *
 * Se mide igual que lo demás y se imprime, pero no tumba la corrida: son
 * funciones que todavía no existen, no cosas que se rompieron. El día que se
 * construyan, esta línea pasa a verde sola y hay que moverla a `check`.
 */
function pendiente(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}  (ya no es un hueco: pásalo a check)`); }
  else { pendientes.push(msg); console.log(`  ⚠ PENDIENTE — ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

async function main() {
  // ── Datos base ──────────────────────────────────────────────────────────
  const op = await prisma.operator.create({
    data: {
      legalName: 'Cooperativa de Prueba', nit: `NIT-${Date.now()}`,
      type: 'INTERCITY', status: 'ACTIVE', isVerified: true,
      contactName: 'Gerente', contactPhone: '+573001112233', city: 'pamplona',
    },
  });
  const driver = await prisma.driver.create({
    data: {
      name: 'Conductor Bus', phone: `+5730011${Math.floor(10000 + Math.random() * 89999)}`,
      isVerified: true, status: 'ONLINE', operatorId: op.id,
    },
  });

  const manana = new Date(Date.now() + 24 * 3600 * 1000);

  // ── 1. Par clásico: pamplona → cucuta ───────────────────────────────────
  console.log('\n[1] Salida Pamplona → Cúcuta (par de los siete de siempre)');
  const t1 = await publishPooledTrip(driver.id, driver.name, driver.phone, {
    origin: 'pamplona', destination: 'cucuta',
    vehicleDescription: 'Buseta Chevrolet', departureTime: manana.toISOString(),
    totalSeats: 7, farePerSeat: 25000,
  } as never, { operatorId: op.id, licensedOperator: true });

  const crudo1 = await prisma.pooledTrip.findUnique({
    where: { id: t1.id }, select: { origin: true, destination: true },
  });
  console.log(`    guardado en BD → origin="${crudo1?.origin}" destination="${crudo1?.destination}"`);
  check(
    crudo1?.origin === 'pamplona',
    'la ciudad se guarda como slug minúscula, igual que en municipalities',
    crudo1,
  );

  // ── 2. Municipio fuera de los siete ─────────────────────────────────────
  console.log('\n[2] Salida Pamplona → Los Patios (municipio nuevo, slug con guion)');
  const t2 = await publishPooledTrip(driver.id, driver.name, driver.phone, {
    origin: 'pamplona', destination: 'los-patios',
    vehicleDescription: 'Buseta Chevrolet', departureTime: manana.toISOString(),
    totalSeats: 7, farePerSeat: 30000,
  } as never, { operatorId: op.id, licensedOperator: true });

  const crudo2 = await prisma.pooledTrip.findUnique({
    where: { id: t2.id }, select: { origin: true, destination: true },
  });
  console.log(`    guardado en BD → origin="${crudo2?.origin}" destination="${crudo2?.destination}"`);
  check(
    crudo2?.destination === 'los-patios',
    'el municipio nuevo se guarda con su slug exacto',
    crudo2,
  );

  // ── 3. Fila "vieja": la que dejó la migración de municipios ─────────────
  console.log('\n[3] Salida ya migrada (minúscula en la base, como la dejó la migración)');
  const vieja = await prisma.pooledTrip.create({
    data: {
      tripRef: `NXP-OLD${Math.floor(Math.random() * 9000)}`,
      driverId: driver.id, driverName: driver.name, driverPhone: driver.phone,
      vehicleDescription: 'Bus viejo',
      origin: 'pamplona', destination: 'cucuta',   // minúscula: lo que dejó la migración
      departureTime: manana, totalSeats: 7,
      farePerSeat: 25000, maxFarePerSeat: 90000, status: 'OPEN', operatorId: op.id,
    },
  });

  // ── 4. La búsqueda del pasajero ─────────────────────────────────────────
  console.log('\n[4] Búsqueda del pasajero: pamplona → cucuta');
  const encontradas = await searchPooledTrips({ origin: 'pamplona', destination: 'cucuta' } as never);
  const ids = encontradas.map((t) => t.id);
  console.log(`    encontró ${encontradas.length} salida(s)`);
  check(ids.includes(t1.id), 'encuentra la salida recién publicada');
  check(ids.includes(vieja.id), 'encuentra la salida que ya estaba en la base antes de la migración');

  console.log('\n[5] Búsqueda del pasajero: pamplona → los-patios');
  const enc2 = await searchPooledTrips({ origin: 'pamplona', destination: 'los-patios' } as never);
  console.log(`    encontró ${enc2.length} salida(s)`);
  check(enc2.some((t) => t.id === t2.id), 'encuentra la salida al municipio nuevo');

  // ── 6. ¿Se puede colgar una encomienda de una salida de bus? ────────────
  console.log('\n[6] Encomienda dentro de una salida de bus');
  const columnas = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'freight_manifests' AND column_name LIKE '%rip%'`,
  );
  console.log(`    freight_manifests tiene: ${columnas.map((c) => c.column_name).join(', ')}`);
  check(
    columnas.some((c) => c.column_name.toLowerCase().includes('pooled')),
    'el remito se puede colgar de una salida de bus (pooledTripId)',
    columnas.map((c) => c.column_name),
  );

  // ── 7. Rastro GPS de la salida ──────────────────────────────────────────
  console.log('\n[7] Rastro GPS de una salida de bus');
  const kinds = await prisma.$queryRawUnsafe<Array<{ v: string }>>(
    `SELECT DISTINCT "serviceKind" AS v FROM driver_track_points`,
  );
  const { TrackServiceKind } = await import('../src/services/track.service') as never as { TrackServiceKind?: unknown };
  void TrackServiceKind; void kinds;
  const fuente = (await import('fs')).readFileSync('src/services/track.service.ts', 'utf8');
  const linea = fuente.match(/export type TrackServiceKind = .*/)?.[0] ?? '(no encontrada)';
  console.log(`    ${linea}`);
  check(linea.includes('pooled'), 'el rastro GPS admite salidas de bus');

  // ── 8. ¿El pasajero ve dónde va el bus? ─────────────────────────────────
  console.log('\n[8] Posición del bus para quien compró el cupo');
  const tipos = (await import('fs')).readFileSync('src/types/index.ts', 'utf8');
  const bloque = tipos.match(/export interface PooledTripDTO \{[\s\S]*?\n\}/)?.[0] ?? '';
  check(
    bloque.includes('driverLat'),
    'PooledTripDTO expone la posición del conductor (como los otros cuatro servicios)',
  );

  // ── Limpieza ────────────────────────────────────────────────────────────
  await prisma.pooledTrip.deleteMany({ where: { driverId: driver.id } });
  await prisma.driver.delete({ where: { id: driver.id } });
  await prisma.operator.delete({ where: { id: op.id } });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Comprobaciones: ${ok} en verde, ${fallos} en rojo`);
  if (pendientes.length > 0) {
    console.log(`\nHuecos de producto pendientes (${pendientes.length}) — no son fallos:`);
    for (const p of pendientes) console.log(`  · ${p}`);
  }
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch((e) => { console.error('\nERROR:', e); process.exit(2); });
