/**
 * E2E del viaje programado.
 *
 * Lo que vigila, por orden de gravedad:
 *
 *  1. **Un viaje reservado NO sale a buscar conductor antes de tiempo.** Si
 *     saliera, el conductor recibiría a las 8 de la noche una oferta para un
 *     viaje de mañana, y el pasajero un carro en la puerta que no pidió.
 *  2. **Ni se queda dormido para siempre.** Cuando le toca, sale.
 *  3. El precio se recalcula al salir, no se arrastra el de la reserva.
 *  4. Dos barridos a la vez no lo despachan dos veces.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/viaje-programado.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const ORIGEN = { lat: 7.3754, lng: -72.6486 };
const DESTINO = { lat: 7.3921, lng: -72.6602 };
const enMin = (m: number) => new Date(Date.now() + m * 60_000);

async function main(): Promise<void> {
  const { requestClientTrip, despacharProgramados, cancelClientTrip, getActiveClientTrip } =
    await import('../src/services/client.service');

  const cliente = await prisma.user.create({
    data: { phone: `+5730${Math.floor(10000000 + Math.random() * 89999999)}`, name: 'e2e-prog' },
  });

  const pedir = (scheduledFor?: Date) =>
    requestClientTrip(cliente.id, {
      serviceType: 'taxi',
      originAddress: 'Parque principal',
      destinationAddress: 'Terminal',
      originLat: ORIGEN.lat, originLng: ORIGEN.lng,
      destLat: DESTINO.lat, destLng: DESTINO.lng,
      ...(scheduledFor ? { scheduledFor: scheduledFor.toISOString() } : {}),
    } as Parameters<typeof requestClientTrip>[1]);

  const estado = async (id: string) =>
    (await prisma.trip.findUnique({ where: { id }, select: { status: true } }))?.status;

  console.log('\n═══ Se reserva sin salir a buscar ═══');
  let programado: string;
  {
    const v = await pedir(enMin(120));
    programado = v.id;
    const t = await prisma.trip.findUnique({
      where: { id: v.id },
      select: { status: true, scheduledFor: true, searchFrom: true },
    });
    comprobar('queda en SCHEDULED', t?.status === 'SCHEDULED', String(t?.status));
    comprobar('con la hora reservada', t?.scheduledFor !== null);
    comprobar('el DTO lo dice: status "scheduled"', v.status === 'scheduled', v.status);
    comprobar('y expone para cuándo', Boolean(v.scheduledFor), String(v.scheduledFor));

    // 15 minutos antes de la hora, ni uno más.
    const antelacion = t?.scheduledFor && t?.searchFrom
      ? (t.scheduledFor.getTime() - t.searchFrom.getTime()) / 60_000
      : -1;
    comprobar('SE BUSCA 15 MIN ANTES, no a la hora', antelacion === 15, String(antelacion));
  }

  console.log('\n═══ NO sale a buscar antes de tiempo ═══');
  {
    const n = await despacharProgramados();
    comprobar('el barrido no lo toca', n === 0, `despachó ${n}`);
    comprobar('sigue reservado', (await estado(programado)) === 'SCHEDULED');
  }

  console.log('\n═══ Y NINGÚN CONDUCTOR RECIBE LA OFERTA ═══');
  {
    // Comprobar solo el estado en la base no basta: sin conductores sembrados,
    // despachar un viaje por error no cambia nada visible. Lo que hay que
    // demostrar es que NO le llega la oferta a nadie — que es el daño real:
    // un conductor recibiendo a las 8 de la noche una carrera de mañana.
    //
    // Hay DOS capas y conviene saberlo: la de fuera es no arrancar el ciclo
    // al crear el viaje; la que de verdad sostiene la regla es el guard de
    // `_offerToCandidate`, que exige que el viaje siga en SEARCHING. Rompiendo
    // solo la primera esta prueba sigue en verde —lo comprobé— y hay que
    // romper las dos para que caiga.
    const d = await prisma.driver.create({
      data: {
        phone: `+5739${Math.floor(10000000 + Math.random() * 89999999)}`,
        name: 'e2e-prog-conductor', status: 'ONLINE', isVerified: true,
        acceptsTrips: true,
      },
    });
    await prisma.vehicle.create({
      data: {
        driverId: d.id, type: 'TAXI', isActive: true,
        brand: 'Prueba', model: 'X',
        plate: `P${Math.floor(1000 + Math.random() * 8999)}`,
        year: 2020, color: 'Amarillo',
      },
    });
    await prisma.$executeRaw`
      UPDATE "drivers"
      SET "geo" = ST_SetSRID(ST_MakePoint(${ORIGEN.lng}, ${ORIGEN.lat}), 4326)::geography,
          "lastSeenAt" = now(), "lastLat" = ${ORIGEN.lat}, "lastLng" = ${ORIGEN.lng}
      WHERE "id" = ${d.id}`;

    const matching = await import('../src/services/matching.service');
    const recibido: Array<Record<string, unknown>> = [];
    matching.registerSendToDriver((_id, msg) => {
      recibido.push(msg as Record<string, unknown>);
      return true;
    });

    const reservado = await pedir(enMin(180));
    await new Promise((r) => setTimeout(r, 800));
    comprobar(
      'con un taxi en línea al lado, NO recibe la oferta',
      !recibido.some((m) => m['type'] === 'trip_request'),
      JSON.stringify(recibido.map((m) => m['type'])),
    );

    // Y en cuanto le toca, ese mismo conductor sí la recibe: la prueba de
    // arriba no puede pasar simplemente porque el despacho esté roto.
    recibido.length = 0;
    await prisma.trip.update({
      where: { id: reservado.id }, data: { searchFrom: enMin(-1) },
    });
    await despacharProgramados();
    await new Promise((r) => setTimeout(r, 800));
    comprobar(
      'y al llegar la hora SÍ la recibe',
      recibido.some((m) => m['type'] === 'trip_request'),
      JSON.stringify(recibido.map((m) => m['type'])),
    );

    matching.registerSendToDriver(() => true);
    await prisma.trip.updateMany({
      where: { id: reservado.id }, data: { status: 'CANCELLED' },
    });
    await prisma.vehicle.deleteMany({ where: { driverId: d.id } });
    await prisma.trip.updateMany({ where: { driverId: d.id }, data: { driverId: null } });
    await prisma.driver.delete({ where: { id: d.id } });
  }

  console.log('\n═══ Cuando le toca, sale ═══');
  {
    // Se adelanta la hora de búsqueda, como haría el paso del tiempo.
    await prisma.trip.update({
      where: { id: programado }, data: { searchFrom: enMin(-1) },
    });
    const n = await despacharProgramados();
    comprobar('el barrido lo despacha', n === 1, `despachó ${n}`);
    comprobar('pasa a SEARCHING', (await estado(programado)) === 'SEARCHING');
  }

  console.log('\n═══ Dos barridos a la vez no lo despachan dos veces ═══');
  {
    const v = await pedir(enMin(120));
    await prisma.trip.update({ where: { id: v.id }, data: { searchFrom: enMin(-1) } });
    // En Render puede haber más de una instancia corriendo el mismo barrido.
    const [a, b] = await Promise.all([despacharProgramados(), despacharProgramados()]);
    comprobar('solo uno se lo lleva', a + b === 1, `${a} + ${b}`);
    await prisma.trip.update({ where: { id: v.id }, data: { status: 'CANCELLED' } });
  }

  console.log('\n═══ El barrido recoge lo atrasado tras un redespliegue ═══');
  {
    const v = await pedir(enMin(120));
    // Como si el servidor hubiera estado caído media hora.
    await prisma.trip.update({ where: { id: v.id }, data: { searchFrom: enMin(-40) } });
    await despacharProgramados();
    comprobar('no se lo salta', (await estado(v.id)) === 'SEARCHING');
    await prisma.trip.update({ where: { id: v.id }, data: { status: 'CANCELLED' } });
  }

  console.log('\n═══ Se puede ver y cancelar mientras está reservado ═══');
  {
    const v = await pedir(enMin(180));
    const activo = await getActiveClientTrip(cliente.id);
    comprobar('sale como viaje activo del pasajero', activo?.id === v.id,
      String(activo?.id));
    comprobar('se puede cancelar', await cancelClientTrip(cliente.id, v.id));
    comprobar('y queda cancelado', (await estado(v.id)) === 'CANCELLED');
  }

  console.log('\n═══ Una hora imposible se rechaza con un motivo claro ═══');
  {
    for (const [caso, cuando] of [
      ['en el pasado', enMin(-30)],
      ['dentro de 5 minutos', enMin(5)],
      ['dentro de un mes', enMin(60 * 24 * 30)],
    ] as [string, Date][]) {
      let mensaje = '';
      try {
        await pedir(cuando);
      } catch (e) {
        mensaje = e instanceof Error ? e.message : '';
      }
      comprobar(`${caso}: se rechaza`, mensaje.length > 0, 'no falló');
      comprobar(`${caso}: y el mensaje dice qué hacer`,
        /minutos|días/.test(mensaje), mensaje);
    }
  }

  await prisma.trip.deleteMany({ where: { passengerId: cliente.id } });
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
