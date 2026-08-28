/**
 * E2E de los viajes encadenados.
 *
 * El problema: un conductor que va llegando a dejar a su pasajero está, en la
 * práctica, libre dentro de tres minutos. Excluirlo por estar ON_TRIP hacía que
 * un servicio saliera a la vuelta de la esquina y él no lo viera nunca. Uber y
 * DiDi lo resuelven ofreciéndole el siguiente antes de terminar.
 *
 * Lo que hay que demostrar no es que se le ofrezca —eso es quitar un filtro—
 * sino que se le ofrezca SOLO cuando toca. Encadenar de más es peor que no
 * encadenar: un pasajero esperando media hora a alguien que acababa de empezar
 * otra carrera, o un conductor con dos personas pendientes a la vez.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/viajes-encadenados.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const tel = (p: string) => `+57${p}${Math.floor(10000000 + Math.random() * 89999999)}`;

// Pamplona. El destino del viaje en curso y el origen del nuevo están a ~300 m:
// justo el caso que motiva todo esto.
const DESTINO_ACTUAL = { lat: 7.3754, lng: -72.6486 };
const NUEVO_ORIGEN = { lat: 7.3780, lng: -72.6486 };
// A 6 km: fuera de todo radio razonable.
const LEJOS = { lat: 7.4300, lng: -72.6486 };

async function main(): Promise<void> {
  const { findNearestAvailableDrivers } = await import('../src/services/matching.service');
  const { liberarConductorSiNoTieneMas } = await import('../src/lib/liberar-conductor');

  const marca = `e2echain-${Date.now()}`;
  const cliente = await prisma.user.create({ data: { phone: tel('30'), name: marca } });

  /** Conductor con vehículo, GPS fresco y posición dada. */
  async function crearConductor(
    nombre: string,
    pos: { lat: number; lng: number },
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const d = await prisma.driver.create({
      data: {
        phone: tel('39'), name: `${marca}-${nombre}`,
        isVerified: true, acceptsTrips: true, status: 'ONLINE',
        ...extra,
      },
    });
    await prisma.vehicle.create({
      data: {
        driverId: d.id, type: 'PARTICULAR', isActive: true,
        brand: 'Prueba', model: 'X', plate: `Z${Math.floor(1000 + Math.random() * 8999)}`,
        year: 2020, color: 'Blanco',
      },
    });
    await prisma.$executeRaw`
      UPDATE "drivers"
      SET "geo" = ST_SetSRID(ST_MakePoint(${pos.lng}, ${pos.lat}), 4326)::geography,
          "lastSeenAt" = now(), "lastLat" = ${pos.lat}, "lastLng" = ${pos.lng}
      WHERE "id" = ${d.id}`;
    return d.id;
  }

  /** Viaje asignado a [driverId] en el estado dado, con destino [dest]. */
  function crearViaje(
    driverId: string,
    status: 'ACCEPTED' | 'IN_PROGRESS',
    dest: { lat: number; lng: number },
  ) {
    return prisma.trip.create({
      data: {
        requestRef: `NXM-${Math.floor(100000 + Math.random() * 899999)}`,
        passengerId: cliente.id, driverId, serviceType: 'PARTICULAR', status,
        originAddress: 'Origen', originLat: 7.36, originLng: -72.64,
        destAddress: 'Destino', destLat: dest.lat, destLng: dest.lng,
        estimatedFare: 9000, distanceKm: 3, etaMinutes: 10,
      },
    });
  }

  const candidatos = () =>
    findNearestAvailableDrivers(NUEVO_ORIGEN.lat, NUEVO_ORIGEN.lng, 5000, 20, 120, 'trip');

  const ids = new Set<string>();
  const esCandidato = async (id: string) =>
    (await candidatos()).some((c) => c.driverId === id);

  console.log('\n═══ Al que va llegando SÍ se le ofrece ═══');
  {
    const llegando = await crearConductor('llegando', DESTINO_ACTUAL, { status: 'ON_TRIP' });
    ids.add(llegando);
    await crearViaje(llegando, 'IN_PROGRESS', DESTINO_ACTUAL);

    const lista = await candidatos();
    const suyo = lista.find((c) => c.driverId === llegando);
    comprobar('entra en la lista de candidatos', suyo != null);
    comprobar('y la oferta va marcada como encadenada', suyo?.encadenado === true,
      JSON.stringify(suyo));
  }

  console.log('\n═══ Al que acaba de empezar NO ═══');
  {
    // Mismo caso, pero su destino está a 6 km: le queda carrera por delante y el
    // nuevo pasajero estaría esperando todo ese rato.
    const empezando = await crearConductor('empezando', DESTINO_ACTUAL, { status: 'ON_TRIP' });
    ids.add(empezando);
    await crearViaje(empezando, 'IN_PROGRESS', LEJOS);
    comprobar('lejos de su destino, no se le ofrece', !(await esCandidato(empezando)));
  }

  console.log('\n═══ Al que todavía va a recoger, tampoco ═══');
  {
    // Aceptó pero aún no ha subido al pasajero: encadenar aquí sería empezar la
    // casa por el tejado.
    const aRecoger = await crearConductor('a-recoger', DESTINO_ACTUAL, { status: 'ON_TRIP' });
    ids.add(aRecoger);
    await crearViaje(aRecoger, 'ACCEPTED', DESTINO_ACTUAL);
    comprobar('con el viaje aún sin arrancar, no se le ofrece',
      !(await esCandidato(aRecoger)));
  }

  console.log('\n═══ Al que lo apagó, no se le molesta ═══');
  {
    const sinEncadenar = await crearConductor('sin-encadenar', DESTINO_ACTUAL, {
      status: 'ON_TRIP', acceptsChained: false,
    });
    ids.add(sinEncadenar);
    await crearViaje(sinEncadenar, 'IN_PROGRESS', DESTINO_ACTUAL);
    comprobar('con la preferencia apagada, no se le ofrece',
      !(await esCandidato(sinEncadenar)));
  }

  console.log('\n═══ Uno en cola, no una pila ═══');
  {
    const conCola = await crearConductor('con-cola', DESTINO_ACTUAL, { status: 'ON_TRIP' });
    ids.add(conCola);
    await crearViaje(conCola, 'IN_PROGRESS', DESTINO_ACTUAL);
    comprobar('sin nada en cola sí es candidato', await esCandidato(conCola));

    // Ya aceptó el siguiente: encadenar un tercero sería prometer lo imposible.
    const encolado = await crearViaje(conCola, 'ACCEPTED', DESTINO_ACTUAL);
    comprobar('con uno ya aceptado deja de serlo', !(await esCandidato(conCola)));

    console.log('\n═══ Cerrar el primero NO lo suelta si el segundo espera ═══');
    await prisma.trip.updateMany({
      where: { driverId: conCola, status: 'IN_PROGRESS' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await liberarConductorSiNoTieneMas(conCola);
    const d1 = await prisma.driver.findUnique({ where: { id: conCola } });
    comprobar('sigue ON_TRIP con el pasajero encolado esperando',
      d1?.status === 'ON_TRIP', String(d1?.status));

    // Y al cerrar también el segundo, ahora sí queda libre.
    await prisma.trip.update({
      where: { id: encolado.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await liberarConductorSiNoTieneMas(conCola);
    const d2 = await prisma.driver.findUnique({ where: { id: conCola } });
    comprobar('y al terminar los dos vuelve a ONLINE', d2?.status === 'ONLINE',
      String(d2?.status));
  }

  console.log('\n═══ El conductor libre de siempre sigue igual ═══');
  {
    const libre = await crearConductor('libre', NUEVO_ORIGEN);
    ids.add(libre);
    const lista = await candidatos();
    const suyo = lista.find((c) => c.driverId === libre);
    comprobar('es candidato', suyo != null);
    comprobar('y su oferta NO va marcada como encadenada', suyo?.encadenado === false,
      JSON.stringify(suyo));
  }

  // Limpieza.
  await prisma.trip.deleteMany({ where: { passengerId: cliente.id } });
  await prisma.vehicle.deleteMany({ where: { driverId: { in: [...ids] } } });
  await prisma.driver.deleteMany({ where: { id: { in: [...ids] } } });
  await prisma.user.delete({ where: { id: cliente.id } });

  console.log(`\n${fallos === 0 ? '✅ El encadenado ofrece solo cuando toca' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
