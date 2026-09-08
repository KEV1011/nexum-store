/**
 * E2E del panel por plaza.
 *
 * Las unitarias fijan quién puede ver qué. Esto comprueba lo otro: que las
 * consultas cuenten SOLO lo de la ciudad pedida. Un error aquí no se ve —el
 * panel enseñaría un número plausible— y se descubriría abriendo una segunda
 * ciudad y viendo que sus cifras incluyen las de la primera.
 *
 * Se siembran viajes en dos plazas separadas de verdad y se comprueba que
 * ninguna cuenta los de la otra.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/plaza-admin.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const tel = (p: string) => `+57${p}${Math.floor(10000000 + Math.random() * 89999999)}`;

// Dos plazas de verdad, a ~65 km una de otra: más que el radio de 40 km con el
// que se atribuye un punto a un municipio, así que ninguna puede robarle
// viajes a la otra por cercanía.
const PAMPLONA = { lat: 7.3754, lng: -72.6486 };
const CUCUTA = { lat: 7.8891, lng: -72.4967 };
// En medio del Atlántico: lejos de toda plaza. Su viaje no debe atribuirse a
// ninguna ciudad ni desaparecer de los totales globales.
const NINGUNA = { lat: 12.5, lng: -60.0 };

async function main(): Promise<void> {
  const { getAdminMetrics, getMetricasNegocio, listDriversForAdmin } =
    await import('../src/services/admin.service');
  const { upsertMunicipality, plazaDeCoordenadas } = await import('../src/services/municipality.service');
  const { updateDriverGeo } = await import('../src/services/matching.service');

  const marca = `e2eplaza-${Date.now()}`;

  await upsertMunicipality({
    slug: 'pamplona', name: 'Pamplona', department: 'Norte de Santander',
    lat: PAMPLONA.lat, lng: PAMPLONA.lng,
  });
  await upsertMunicipality({
    slug: 'cucuta', name: 'Cúcuta', department: 'Norte de Santander',
    lat: CUCUTA.lat, lng: CUCUTA.lng,
  });

  // Base limpia: estas cifras son globales y cualquier viaje previo las
  // contaminaría, diciendo cosas que no son.
  await prisma.trip.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('\n═══ El punto decide la plaza, y lejos de todo no decide nada ═══');
  {
    comprobar('un punto en Pamplona es pamplona',
      (await plazaDeCoordenadas(PAMPLONA.lat, PAMPLONA.lng)) === 'pamplona');
    comprobar('un punto en Cúcuta es cucuta',
      (await plazaDeCoordenadas(CUCUTA.lat, CUCUTA.lng)) === 'cucuta');
    comprobar('en mitad del mar no se inventa ciudad',
      (await plazaDeCoordenadas(NINGUNA.lat, NINGUNA.lng)) === null);
  }

  const conPam = await prisma.driver.create({
    data: { phone: tel('39'), name: `${marca}-pam`, isVerified: true },
  });
  const conCuc = await prisma.driver.create({
    data: { phone: tel('39'), name: `${marca}-cuc`, isVerified: true },
  });
  const [ana, beto] = await Promise.all([
    prisma.user.create({ data: { phone: tel('30'), name: `${marca}-ana` } }),
    prisma.user.create({ data: { phone: tel('30'), name: `${marca}-beto` } }),
  ]);

  let n = 0;
  const viaje = async (de: string, donde: { lat: number; lng: number }, completado: boolean) => {
    const citySlug = await plazaDeCoordenadas(donde.lat, donde.lng);
    return prisma.trip.create({
      data: {
        requestRef: `NXP-${Date.now()}-${n++}`,
        passengerId: de,
        driverId: completado ? conPam.id : null,
        serviceType: 'PARTICULAR',
        status: completado ? 'COMPLETED' : 'SEARCHING',
        citySlug,
        originAddress: 'A', originLat: donde.lat, originLng: donde.lng,
        destAddress: 'B', destLat: donde.lat + 0.01, destLng: donde.lng + 0.01,
        estimatedFare: 9000, distanceKm: 3, etaMinutes: 10,
        ...(completado
          ? { completedAt: new Date(), finalFare: 9000, commission: 1350, netEarning: 7650 }
          : {}),
      },
    });
  };

  // Pamplona: 3 viajes (2 completados). Cúcuta: 1 (completado). Y uno en
  // mitad del mar, que no es de nadie.
  await viaje(ana.id, PAMPLONA, true);
  await viaje(ana.id, PAMPLONA, true);
  await viaje(beto.id, PAMPLONA, false);
  await viaje(beto.id, CUCUTA, true);
  await viaje(beto.id, NINGUNA, true);

  console.log('\n═══ Cada plaza cuenta lo suyo ═══');
  {
    const pam = await getAdminMetrics('pamplona');
    const cuc = await getAdminMetrics('cucuta');
    const todo = await getAdminMetrics();

    comprobar('Pamplona ve sus 3 viajes de hoy', pam.trips.todayRequested === 3,
      String(pam.trips.todayRequested));
    comprobar('Cúcuta ve 1', cuc.trips.todayRequested === 1, String(cuc.trips.todayRequested));
    comprobar('sin filtro se ven los 5, incluido el de ninguna plaza',
      todo.trips.todayRequested === 5, String(todo.trips.todayRequested));
    comprobar('el GMV de Pamplona son sus 2 completados',
      pam.money.todayGmv === 18000, String(pam.money.todayGmv));
    comprobar('el de Cúcuta, su 1', cuc.money.todayGmv === 9000, String(cuc.money.todayGmv));
    comprobar('la respuesta dice sobre qué plaza está calculada',
      pam.ciudad === 'pamplona' && todo.ciudad === null, `${pam.ciudad} / ${todo.ciudad}`);
  }

  console.log('\n═══ Lo que no sabe de plazas se calla, no dice cero ═══');
  {
    const pam = await getAdminMetrics('pamplona');
    const todo = await getAdminMetrics();
    comprobar('los pagos con plaza van en null', pam.money.paymentsApprovedToday === null,
      String(pam.money.paymentsApprovedToday));
    comprobar('el SOS con plaza va en null', pam.safety.sosLast24h === null,
      String(pam.safety.sosLast24h));
    comprobar('sin plaza sí son números',
      typeof todo.money.paymentsApprovedToday === 'number' && typeof todo.safety.sosLast24h === 'number',
      `${todo.money.paymentsApprovedToday} / ${todo.safety.sosLast24h}`);
    comprobar('los mandados/pedidos atascados van en null con plaza',
      pam.stuck.mandado === null && pam.stuck.pedido === null && pam.stuck.intermunicipal === null);
    comprobar('y sin plaza son números',
      typeof todo.stuck.mandado === 'number' && typeof todo.stuck.pedido === 'number');
    comprobar('«usuarios» avisa de que con plaza son otra cosa',
      pam.users.porViajes === true && todo.users.porViajes === false);
  }

  console.log('\n═══ Las cifras del piloto, por plaza ═══');
  {
    const pam = await getMetricasNegocio(7, 'pamplona');
    const cuc = await getMetricasNegocio(7, 'cucuta');
    comprobar('Pamplona: 3 solicitados', pam.emparejamiento.solicitados === 3,
      String(pam.emparejamiento.solicitados));
    comprobar('Cúcuta: 1', cuc.emparejamiento.solicitados === 1,
      String(cuc.emparejamiento.solicitados));
    comprobar('Pamplona tiene 2 pasajeros distintos', pam.pasajerosActivos === 2,
      String(pam.pasajerosActivos));
    comprobar('Cúcuta 1', cuc.pasajerosActivos === 1, String(cuc.pasajerosActivos));
    const totalPam = pam.serie.reduce((a, d) => a + d.solicitados, 0);
    comprobar('la serie diaria de Pamplona suma sus 3', totalPam === 3, String(totalPam));
  }

  console.log('\n═══ El conductor pertenece a donde late ═══');
  {
    await updateDriverGeo(conPam.id, PAMPLONA.lat, PAMPLONA.lng);
    await updateDriverGeo(conCuc.id, CUCUTA.lat, CUCUTA.lng);

    const enPam = await listDriversForAdmin('pamplona');
    const enCuc = await listDriversForAdmin('cucuta');
    comprobar('el de Pamplona sale en Pamplona',
      enPam.some((d) => d.id === conPam.id) && !enPam.some((d) => d.id === conCuc.id));
    comprobar('y el de Cúcuta en Cúcuta',
      enCuc.some((d) => d.id === conCuc.id) && !enCuc.some((d) => d.id === conPam.id));
    comprobar('la fila trae su plaza',
      enPam.find((d) => d.id === conPam.id)?.citySlug === 'pamplona');

    const mPam = await getAdminMetrics('pamplona');
    comprobar('y las métricas cuentan 1 conductor en Pamplona', mPam.drivers.total === 1,
      String(mPam.drivers.total));

    // Se muda: el latido nuevo lo cambia de plaza, sin tocar nada más.
    await updateDriverGeo(conPam.id, CUCUTA.lat, CUCUTA.lng);
    const trasMudanza = await listDriversForAdmin('cucuta');
    comprobar('al latir desde otra ciudad, cambia de plaza',
      trasMudanza.filter((d) => d.id === conPam.id || d.id === conCuc.id).length === 2,
      String(trasMudanza.length));
    comprobar('y ya no está en la anterior',
      (await listDriversForAdmin('pamplona')).length === 0);
  }

  console.log('\n═══ Una plaza sin nada da ceros honestos, no falla ═══');
  {
    await upsertMunicipality({
      slug: 'chitaga', name: 'Chitagá', department: 'Norte de Santander',
      lat: 7.1394, lng: -72.6664,
    });
    const vacia = await getAdminMetrics('chitaga');
    comprobar('cero viajes', vacia.trips.todayRequested === 0);
    comprobar('cero conductores', vacia.drivers.total === 0);
    const nada = await getMetricasNegocio(7, 'chitaga');
    comprobar('y la tasa de emparejamiento es null, no 0 %',
      nada.emparejamiento.tasa === null, String(nada.emparejamiento.tasa));
  }

  console.log('\n═══ Una plaza inventada no devuelve los de otra ═══');
  {
    const fantasma = await getAdminMetrics('narnia');
    comprobar('no cuenta ningún viaje', fantasma.trips.todayRequested === 0,
      String(fantasma.trips.todayRequested));
    comprobar('ni ningún conductor', fantasma.drivers.total === 0, String(fantasma.drivers.total));
  }

  // Limpieza.
  await prisma.trip.deleteMany({});
  await prisma.driverEarning.deleteMany({ where: { driverId: { in: [conPam.id, conCuc.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ana.id, beto.id] } } });
  await prisma.driver.deleteMany({ where: { id: { in: [conPam.id, conCuc.id] } } });

  console.log(`\n${fallos === 0 ? '✅ Cada plaza cuenta lo suyo y nada más' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
