/**
 * E2E de moderación: reportar y bloquear.
 *
 * Lo que vigila, por orden de gravedad:
 *
 *  1. **El bloqueo saca de verdad al conductor del despacho.** Es LA
 *     comprobación: un botón «Bloquear» que deja una fila en una tabla y no
 *     cambia a quién se le ofrece el viaje es exactamente el tipo de función
 *     de mentira que la revisión de Apple busca. Se prueba con PostGIS real,
 *     con el conductor bloqueado siendo el ÚNICO cerca.
 *  2. **En las dos direcciones.** Si solo respetara al que bloqueó, un
 *     conductor bloqueado por acoso seguiría recibiendo viajes de esa persona.
 *  3. **El selector de categorías cuenta igual que el despacho.** Si contara
 *     de otra forma, el pasajero leería «1 taxi cerca» y la búsqueda acabaría
 *     en «no encontramos conductor».
 *  4. Un reporte queda en la cola, se resuelve una sola vez, y las reglas del
 *     catálogo se cumplen contra la base real.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/moderacion.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const ORIGEN = { lat: 7.3754, lng: -72.6486 };

async function ponerCerca(driverId: string, lat: number, lng: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "drivers"
    SET "geo" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        "lastLat" = ${lat}, "lastLng" = ${lng}, "lastSeenAt" = now(),
        "status" = 'ONLINE'
    WHERE "id" = ${driverId}`;
}

async function main(): Promise<void> {
  const { findNearestAvailableDrivers, disponibilidadPorTipoVehiculo } =
    await import('../src/services/matching.service');
  const { crearReporte, bloquear, desbloquear, listarBloqueos, listarReportes, resolverReporte } =
    await import('../src/services/moderacion.service');

  const sufijo = Date.now().toString().slice(-6);

  // ── Siembra ────────────────────────────────────────────────────────────────
  const pasajero = await prisma.user.create({
    data: { phone: `+5730011${sufijo}`, name: 'Pasajera E2E' },
  });
  const conductor = await prisma.driver.create({
    data: {
      phone: `+5730022${sufijo}`, name: 'Conductor Bloqueado',
      isVerified: true, status: 'ONLINE',
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: conductor.id, type: 'TAXI', brand: 'Chevrolet', model: 'Spark',
      plate: `TAX${sufijo.slice(0, 3)}`, year: 2020, color: 'Amarillo', isActive: true,
    },
  });
  await ponerCerca(conductor.id, ORIGEN.lat, ORIGEN.lng);

  console.log('\n1) El bloqueo saca al conductor del despacho');

  const antes = await findNearestAvailableDrivers(
    ORIGEN.lat, ORIGEN.lng, 5000, 5, 120, 'trip', null, pasajero.id,
  );
  comprobar(
    'sin bloquear, el conductor es candidato',
    antes.some((c) => c.driverId === conductor.id),
    `candidatos: ${antes.length}`,
  );

  await bloquear('client', pasajero.id, { kind: 'driver', id: conductor.id, reason: 'acoso' });

  const despues = await findNearestAvailableDrivers(
    ORIGEN.lat, ORIGEN.lng, 5000, 5, 120, 'trip', null, pasajero.id,
  );
  comprobar(
    'bloqueado, YA NO es candidato',
    !despues.some((c) => c.driverId === conductor.id),
    `sigue apareciendo entre ${despues.length}`,
  );

  // Y no se le esconde a todo el mundo: el bloqueo es de una persona, no una
  // suspensión. Confundirlo dejaría sin trabajo a un conductor porque a UN
  // pasajero no le cayó bien.
  const otro = await prisma.user.create({
    data: { phone: `+5730033${sufijo}`, name: 'Otro pasajero' },
  });
  const paraOtro = await findNearestAvailableDrivers(
    ORIGEN.lat, ORIGEN.lng, 5000, 5, 120, 'trip', null, otro.id,
  );
  comprobar(
    'para OTRO pasajero sigue disponible: bloquear no es suspender',
    paraOtro.some((c) => c.driverId === conductor.id),
  );

  console.log('\n2) En las dos direcciones');

  await desbloquear('client', pasajero.id, conductor.id);
  const reconciliados = await findNearestAvailableDrivers(
    ORIGEN.lat, ORIGEN.lng, 5000, 5, 120, 'trip', null, pasajero.id,
  );
  comprobar(
    'desbloquear lo devuelve al despacho',
    reconciliados.some((c) => c.driverId === conductor.id),
  );

  // Ahora al revés: es el CONDUCTOR quien no quiere volver a llevarla.
  await bloquear('driver', conductor.id, { kind: 'client', id: pasajero.id });
  const alReves = await findNearestAvailableDrivers(
    ORIGEN.lat, ORIGEN.lng, 5000, 5, 120, 'trip', null, pasajero.id,
  );
  comprobar(
    'si el conductor bloqueó al pasajero, tampoco se emparejan',
    !alReves.some((c) => c.driverId === conductor.id),
  );

  console.log('\n3) El selector cuenta lo mismo que el despacho');

  const dispBloqueado = await disponibilidadPorTipoVehiculo(
    ORIGEN.lat, ORIGEN.lng, 5000, 120, pasajero.id,
  );
  comprobar(
    'el taxi bloqueado NO se cuenta al cotizar',
    (dispBloqueado.get('TAXI')?.cuantos ?? 0) === 0,
    `cuenta ${dispBloqueado.get('TAXI')?.cuantos}`,
  );
  const dispOtro = await disponibilidadPorTipoVehiculo(
    ORIGEN.lat, ORIGEN.lng, 5000, 120, otro.id,
  );
  comprobar(
    'y para quien no lo bloqueó sí se cuenta',
    (dispOtro.get('TAXI')?.cuantos ?? 0) >= 1,
  );

  console.log('\n4) Listado y desbloqueo');

  const lista = await listarBloqueos('driver', conductor.id);
  comprobar('el conductor ve a quién bloqueó, con nombre', lista.length === 1 && lista[0]!.nombre === 'Pasajera E2E',
    JSON.stringify(lista));

  await bloquear('driver', conductor.id, { kind: 'client', id: pasajero.id });
  const otraVez = await listarBloqueos('driver', conductor.id);
  comprobar('bloquear dos veces no duplica la fila', otraVez.length === 1);

  await desbloquear('driver', conductor.id, pasajero.id);
  comprobar('desbloquear lo quita de la lista',
    (await listarBloqueos('driver', conductor.id)).length === 0);

  console.log('\n5) Reportes');

  const r = await crearReporte('client', pasajero.id, {
    targetKind: 'chat_message', targetId: 'msg-1', reason: 'acoso',
    detail: 'Me escribió después de terminar el viaje',
  });
  comprobar('un reporte urgente se marca como tal', r.urgente === true);

  const pendientes = await listarReportes('PENDING');
  const mio = pendientes.find((x) => x.id === r.id);
  comprobar('aparece en la cola con el nombre de quien reporta',
    mio !== undefined && mio.reporterNombre === 'Pasajera E2E');
  comprobar('y con el motivo traducido', mio?.reasonEtiqueta === 'Acoso o amenazas');

  await resolverReporte(r.id, 'ACTIONED', '+573001112233', 'Conductor advertido');
  let doble = false;
  try {
    await resolverReporte(r.id, 'DISMISSED', '+573009998877');
  } catch {
    doble = true;
  }
  comprobar('dos administradores no se pisan la decisión', doble);

  const resueltos = await listarReportes('ACTIONED');
  comprobar('queda constancia de quién y qué hizo',
    resueltos.some((x) => x.id === r.id && x.reviewedBy === '+573001112233'
      && x.resolution === 'Conductor advertido'));

  // Reglas del catálogo, contra la base real y no solo en memoria.
  let rechazado = false;
  try {
    await crearReporte('client', pasajero.id, {
      targetKind: 'driver', targetId: conductor.id, reason: 'porque_si',
    });
  } catch { rechazado = true; }
  comprobar('un motivo inventado no entra en la cola', rechazado);

  // ── Limpieza ───────────────────────────────────────────────────────────────
  await prisma.contentReport.deleteMany({ where: { reporterId: pasajero.id } });
  await prisma.userBlock.deleteMany({
    where: { OR: [{ blockerId: pasajero.id }, { blockerId: conductor.id }] },
  });
  await prisma.vehicle.deleteMany({ where: { driverId: conductor.id } });
  await prisma.driver.delete({ where: { id: conductor.id } });
  await prisma.user.deleteMany({ where: { id: { in: [pasajero.id, otro.id] } } });

  console.log(`\n${fallos === 0 ? '✅ Todo en orden' : `❌ ${fallos} fallo(s)`}`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
