/**
 * E2E del tablero de operación de la flota (`GET /operator/fleet/analytics`).
 *
 * Las pruebas unitarias fijan las reglas sobre números sueltos. Esto comprueba
 * lo otro, que es donde un tablero se rompe sin que nadie lo note: que al
 * consultar sobre datos REALES la hora salga en la de Colombia y no en UTC,
 * que los viajes caídos aparezcan de verdad, que no se le cuente a una flota
 * lo que nunca aceptó, y que la actividad de un día no se reparta en veinte.
 *
 * Un fallo aquí no da una pantalla rota: da un dueño moviendo el turno de su
 * gente cinco horas, o mirando un tablero impecable mientras pierde la mitad
 * de sus viajes.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/analitica-operacion.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const tel = (p: string) => `+57${p}${Math.floor(10000000 + Math.random() * 89999999)}`;
const PAMPLONA = { lat: 7.3754, lng: -72.6486 };

/**
 * El instante UTC que, visto en Colombia, es ese día a esa hora.
 *
 * Colombia va cinco horas por detrás de UTC, así que las 06:00 de Pamplona son
 * las 11:00 UTC. Sembrar directamente en UTC es lo que haría pasar la prueba
 * con el error que busca cazar.
 */
function colombiaEn(dia: string, hora: number): Date {
  const hh = String(hora).padStart(2, '0');
  return new Date(Date.parse(`${dia}T${hh}:00:00.000Z`) + 5 * 3_600_000);
}

async function main(): Promise<void> {
  const { getFleetAnalytics } = await import('../src/services/freight.service');

  const marca = `e2eop-${Date.now()}`;

  const flota = await prisma.operator.create({
    data: {
      legalName: `${marca} Transportes`,
      nit: `900${Math.floor(100000 + Math.random() * 899999)}`,
      type: 'TAXI',
      status: 'ACTIVE',
      isVerified: true,
      contactName: 'Dueño',
      contactPhone: tel('31'),
    },
  });

  const madrugador = await prisma.driver.create({
    data: { name: `${marca} Madrugador`, phone: tel('30'), isVerified: true, operatorId: flota.id },
  });
  const ocasional = await prisma.driver.create({
    data: { name: `${marca} Ocasional`, phone: tel('30'), isVerified: true, operatorId: flota.id },
  });
  const pasajero = await prisma.user.create({
    data: { name: `${marca} Pasajero`, phone: tel('32') },
  });

  // Un mes cerrado y en el pasado: así el rango es estable y no depende de la
  // hora a la que se corra la prueba.
  const DESDE = '2026-03-01';
  const HASTA = '2026-03-31';
  const desdeISO = new Date('2026-03-01T00:00:00.000Z').toISOString();
  const hastaISO = new Date('2026-04-01T04:59:59.000Z').toISOString();

  let n = 0;
  /** Siembra un viaje ya cerrado, pedido a esa hora de COLOMBIA. */
  async function viajeCerrado(opts: {
    driverId: string; dia: string; horaColombia: number; tarifa?: number; programado?: boolean;
  }) {
    const pedidoEn = colombiaEn(opts.dia, opts.horaColombia);
    const cerradoEn = new Date(pedidoEn.getTime() + 20 * 60_000);
    const tarifa = opts.tarifa ?? 10000;
    return prisma.trip.create({
      data: {
        requestRef: `${marca}-${n++}`,
        passengerId: pasajero.id,
        driverId: opts.driverId,
        operatorId: flota.id,
        serviceType: 'TAXI',
        status: 'COMPLETED',
        originAddress: 'A', originLat: PAMPLONA.lat, originLng: PAMPLONA.lng,
        destAddress: 'B', destLat: 7.3921, destLng: -72.6602,
        estimatedFare: tarifa,
        finalFare: tarifa,
        commission: Math.round(tarifa * 0.15),
        netEarning: tarifa - Math.round(tarifa * 0.15),
        // Si es programado, se PIDIÓ mucho antes pero la demanda es a su hora.
        createdAt: opts.programado
          ? new Date(pedidoEn.getTime() - 20 * 3_600_000)
          : pedidoEn,
        scheduledFor: opts.programado ? pedidoEn : null,
        acceptedAt: new Date(pedidoEn.getTime() + 2 * 60_000),
        arrivedAt: new Date(pedidoEn.getTime() + 6 * 60_000),
        startedAt: new Date(pedidoEn.getTime() + 7 * 60_000),
        completedAt: cerradoEn,
      },
    });
  }

  console.log('\n═══ Siembra ═══');

  // El madrugador: 20 viajes a las 6 de la mañana, TODOS el mismo día.
  for (let i = 0; i < 20; i++) {
    await viajeCerrado({ driverId: madrugador.id, dia: '2026-03-10', horaColombia: 6 });
  }
  // Uno más a las 9 de la NOCHE de Colombia (02:00 UTC del día siguiente): es
  // el que delata una lectura en UTC.
  await viajeCerrado({ driverId: madrugador.id, dia: '2026-03-10', horaColombia: 21 });

  // El ocasional: 4 viajes repartidos en 4 días distintos.
  for (const dia of ['2026-03-05', '2026-03-12', '2026-03-19', '2026-03-26']) {
    await viajeCerrado({ driverId: ocasional.id, dia, horaColombia: 15 });
  }
  console.log(`  · 25 viajes cerrados sembrados en ${flota.legalName}`);

  console.log('\n═══ La hora es la de Colombia, no la del servidor ═══');
  const a = await getFleetAnalytics(flota.id, desdeISO, hastaISO);
  {
    const b = a.porHora.buckets;
    comprobar('las 24 horas están, incluidas las vacías', b.length === 24, `${b.length}`);
    comprobar('20 servicios a las 06:00', b[6]!.servicios === 20, `${b[6]!.servicios}`);
    comprobar('el de las 9 de la noche cae en la hora 21', b[21]!.servicios === 1, `${b[21]!.servicios}`);
    // Ésta es la comprobación que importa: leído en UTC habría caído en la 2.
    comprobar('y NO en la hora 2 (sería la lectura en UTC)', b[2]!.servicios === 0, `${b[2]!.servicios}`);
    comprobar('4 servicios a las 15:00', b[15]!.servicios === 4, `${b[15]!.servicios}`);
    comprobar('la madrugada está en cero, dibujada', b[3]!.servicios === 0);
    comprobar('la muestra cuadra con los servicios del periodo',
      a.porHora.muestra === a.totalServices, `${a.porHora.muestra} vs ${a.totalServices}`);
    comprobar('la hora pico es las 06:00', a.porHora.pico === 6, `${a.porHora.pico}`);
  }

  console.log('\n═══ Días activos: 20 en un día no es lo mismo que 4 en cuatro ═══');
  {
    const mad = a.topDrivers.find((d) => d.name.includes('Madrugador'));
    const oca = a.topDrivers.find((d) => d.name.includes('Ocasional'));
    comprobar('el madrugador aparece con 21 servicios', mad?.count === 21, `${mad?.count}`);
    comprobar('y UN solo día activo', mad?.diasActivos === 1, `${mad?.diasActivos}`);
    comprobar('21 servicios por día trabajado', mad?.porDiaActivo === 21, `${mad?.porDiaActivo}`);
    comprobar('el ocasional tiene 4 días activos', oca?.diasActivos === 4, `${oca?.diasActivos}`);
    comprobar('y 1 servicio por día trabajado', oca?.porDiaActivo === 1, `${oca?.porDiaActivo}`);
  }

  console.log('\n═══ Un viaje programado genera demanda a SU hora ═══');
  {
    // Se pidió 20 horas antes; la demanda es a las 5 de la mañana, que es
    // cuando hace falta el carro en la puerta.
    await viajeCerrado({ driverId: ocasional.id, dia: '2026-03-14', horaColombia: 5, programado: true });
    const b = (await getFleetAnalytics(flota.id, desdeISO, hastaISO)).porHora.buckets;
    comprobar('cuenta a las 05:00, la hora acordada', b[5]!.servicios === 1, `${b[5]!.servicios}`);
    comprobar('y no a las 09:00, cuando se reservó', b[9]!.servicios === 0, `${b[9]!.servicios}`);
  }

  console.log('\n═══ Sin cancelaciones, la tarjeta no acusa a nadie ═══');
  {
    const x = await getFleetAnalytics(flota.id, desdeISO, hastaISO);
    comprobar('cero viajes caídos', x.cancelaciones.cancelados === 0, `${x.cancelaciones.cancelados}`);
    comprobar('la tasa es 0 (hay denominador, es un cero honesto)',
      x.cancelaciones.tasa === 0, `${x.cancelaciones.tasa}`);
  }

  console.log('\n═══ Los viajes caídos aparecen, con su motivo y su conductor ═══');
  {
    const caer = async (driverId: string, motivo: string) => {
      const v = await viajeCerrado({ driverId, dia: '2026-03-15', horaColombia: 8 });
      await prisma.trip.update({
        where: { id: v.id },
        data: {
          status: 'CANCELLED', cancelReason: motivo, finalFare: null,
          completedAt: null, updatedAt: new Date('2026-03-15T14:00:00.000Z'),
        },
      });
    };
    await caer(madrugador.id, 'CANCELLED_BY_PASSENGER');
    await caer(madrugador.id, 'CANCELLED_BY_PASSENGER');
    await caer(ocasional.id, 'Vehículo accidentado en la vía');

    const x = await getFleetAnalytics(flota.id, desdeISO, hastaISO);
    const c = x.cancelaciones;
    comprobar('se cuentan los 3 caídos', c.cancelados === 3, `${c.cancelados}`);
    comprobar('el denominador son los 26 completados', c.completados === 26, `${c.completados}`);
    comprobar('la tasa es 10,3 % (3 de 29)', c.tasa === 10.3, `${c.tasa}`);
    comprobar('el motivo del sistema sale en cristiano',
      c.porMotivo.some((m) => m.motivo === 'El pasajero canceló' && m.cuantos === 2),
      JSON.stringify(c.porMotivo));
    comprobar('el motivo escrito a mano sale tal cual',
      c.porMotivo.some((m) => m.motivo === 'Vehículo accidentado en la vía' && m.cuantos === 1),
      JSON.stringify(c.porMotivo));
    comprobar('el conductor con 2 caídos va primero',
      c.porConductor[0]?.name.includes('Madrugador') === true && c.porConductor[0]?.cuantos === 2,
      JSON.stringify(c.porConductor));
    comprobar('un viaje caído NO suma a la facturación',
      x.totalServices === 26, `${x.totalServices}`);
  }

  console.log('\n═══ Lo que la flota nunca aceptó NO se le cuenta ═══');
  {
    // Un viaje que nadie tomó: sin conductor y sin empresa sellada. Es el caso
    // que convertiría esta tarjeta en un reproche injusto.
    await prisma.trip.create({
      data: {
        requestRef: `${marca}-nadie`,
        passengerId: pasajero.id,
        serviceType: 'TAXI',
        status: 'CANCELLED',
        cancelReason: 'NO_DRIVERS_AVAILABLE',
        originAddress: 'A', originLat: PAMPLONA.lat, originLng: PAMPLONA.lng,
        destAddress: 'B', destLat: 7.3921, destLng: -72.6602,
        estimatedFare: 10000,
        updatedAt: new Date('2026-03-16T14:00:00.000Z'),
      },
    });
    const c = (await getFleetAnalytics(flota.id, desdeISO, hastaISO)).cancelaciones;
    comprobar('sigue habiendo 3 caídos, no 4', c.cancelados === 3, `${c.cancelados}`);
    comprobar('y «Nadie tomó el viaje» no figura',
      !c.porMotivo.some((m) => m.motivo === 'Nadie tomó el viaje'), JSON.stringify(c.porMotivo));
  }

  console.log('\n═══ Una flota sin nada: ni pico inventado ni tasa inventada ═══');
  {
    const vacia = await prisma.operator.create({
      data: {
        legalName: `${marca} Vacía`,
        nit: `901${Math.floor(100000 + Math.random() * 899999)}`,
        type: 'TAXI', status: 'ACTIVE', isVerified: true,
        contactName: 'Dueño', contactPhone: tel('31'),
      },
    });
    const x = await getFleetAnalytics(vacia.id, desdeISO, hastaISO);
    comprobar('sin muestra no se señala hora pico', x.porHora.pico === null, `${x.porHora.pico}`);
    comprobar('las 24 barras existen igual, todas en cero',
      x.porHora.buckets.length === 24 && x.porHora.buckets.every((b) => b.servicios === 0));
    comprobar('sin denominador la tasa es null, NO 0 %',
      x.cancelaciones.tasa === null, `${x.cancelaciones.tasa}`);
    comprobar('la comparación con el periodo anterior también calla',
      x.cambio.bruto === null && x.cambio.servicios === null,
      `${x.cambio.bruto} / ${x.cambio.servicios}`);
    await prisma.operator.delete({ where: { id: vacia.id } });
  }

  console.log('\n═══ Muestra corta: hay una hora más alta, pero no se afirma ═══');
  {
    const chica = await prisma.operator.create({
      data: {
        legalName: `${marca} Chica`,
        nit: `902${Math.floor(100000 + Math.random() * 899999)}`,
        type: 'TAXI', status: 'ACTIVE', isVerified: true,
        contactName: 'Dueño', contactPhone: tel('31'),
      },
    });
    const conductor = await prisma.driver.create({
      data: { name: `${marca} Chico`, phone: tel('30'), isVerified: true, operatorId: chica.id },
    });
    for (let i = 0; i < 3; i++) {
      const pedidoEn = colombiaEn('2026-03-08', 7);
      await prisma.trip.create({
        data: {
          requestRef: `${marca}-chica-${i}`,
          passengerId: pasajero.id, driverId: conductor.id, operatorId: chica.id,
          serviceType: 'TAXI', status: 'COMPLETED',
          originAddress: 'A', originLat: PAMPLONA.lat, originLng: PAMPLONA.lng,
          destAddress: 'B', destLat: 7.3921, destLng: -72.6602,
          estimatedFare: 9000, finalFare: 9000,
          createdAt: pedidoEn, completedAt: new Date(pedidoEn.getTime() + 15 * 60_000),
        },
      });
    }
    const x = await getFleetAnalytics(chica.id, desdeISO, hastaISO);
    comprobar('los 3 servicios están en la hora 7', x.porHora.buckets[7]!.servicios === 3);
    comprobar('pero NO se señala hora pico con 3 servicios',
      x.porHora.pico === null, `${x.porHora.pico}`);

    await prisma.trip.deleteMany({ where: { operatorId: chica.id } });
    await prisma.driver.delete({ where: { id: conductor.id } });
    await prisma.operator.delete({ where: { id: chica.id } });
  }

  console.log('\n═══ Limpieza ═══');
  await prisma.trip.deleteMany({ where: { requestRef: { startsWith: marca } } });
  await prisma.driver.deleteMany({ where: { operatorId: flota.id } });
  await prisma.operator.delete({ where: { id: flota.id } });
  await prisma.user.delete({ where: { id: pasajero.id } });
  console.log('  · datos de prueba borrados');

  console.log(`\n${fallos === 0 ? '✅ TODO EN VERDE' : `❌ ${fallos} COMPROBACIONES EN ROJO`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
