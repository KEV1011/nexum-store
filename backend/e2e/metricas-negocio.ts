/**
 * E2E de las tres cifras del piloto.
 *
 * Las pruebas unitarias fijan la aritmética. Esto comprueba lo otro: que las
 * consultas cuenten lo que dicen contar. Un error aquí no se ve —el panel
 * enseñaría un número plausible— y se descubriría tomando una decisión de
 * negocio equivocada.
 *
 * Se siembran viajes con fechas controladas y se comprueba que cada cifra
 * salga exacta.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/metricas-negocio.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const tel = (p: string) => `+57${p}${Math.floor(10000000 + Math.random() * 89999999)}`;

/**
 * Mediodía LOCAL de hace N días (hoy = hace un rato).
 *
 * Restar `N*24h + 12h` a la hora actual parece equivalente y no lo es: según a
 * qué hora se ejecute la prueba, esas 12 horas cruzan la medianoche y el viaje
 * cae en el día anterior. El servicio corta los días a medianoche de Colombia,
 * así que la prueba tiene que anclarse a lo mismo o falla sola de madrugada.
 */
const HORAS_UTC_COLOMBIA = -5;
function diaAtras(dias: number): Date {
  if (dias === 0) return new Date(Date.now() - 3_600_000); // hoy, hace una hora
  const local = new Date(Date.now() + HORAS_UTC_COLOMBIA * 3_600_000);
  local.setUTCHours(0, 0, 0, 0);
  const medianocheUtc = local.getTime() - HORAS_UTC_COLOMBIA * 3_600_000;
  return new Date(medianocheUtc - dias * 86_400_000 + 12 * 3_600_000);
}

async function main(): Promise<void> {
  const { getMetricasNegocio } = await import('../src/services/admin.service');

  const marca = `e2emet-${Date.now()}`;

  // Se parte de una base limpia: estas cifras son globales, así que cualquier
  // viaje previo las contaminaría y la prueba diría cosas que no son.
  await prisma.trip.deleteMany({});
  await prisma.user.deleteMany({});

  const conductor = await prisma.driver.create({
    data: { phone: tel('39'), name: `${marca}-con`, isVerified: true },
  });
  const [ana, beto, caro] = await Promise.all([
    prisma.user.create({ data: { phone: tel('30'), name: `${marca}-ana` } }),
    prisma.user.create({ data: { phone: tel('30'), name: `${marca}-beto` } }),
    prisma.user.create({ data: { phone: tel('30'), name: `${marca}-caro` } }),
  ]);

  let n = 0;
  const viaje = (opts: {
    de: string;
    creado: Date;
    conConductor?: boolean;
    completadoEn?: Date;
    sinConductores?: boolean;
  }) =>
    prisma.trip.create({
      data: {
        requestRef: `NXM-${100000 + n++}`,
        passengerId: opts.de,
        driverId: opts.conConductor ? conductor.id : null,
        serviceType: 'PARTICULAR',
        status: opts.completadoEn ? 'COMPLETED' : opts.sinConductores ? 'CANCELLED' : 'SEARCHING',
        ...(opts.sinConductores ? { cancelReason: 'NO_DRIVERS_AVAILABLE' } : {}),
        originAddress: 'A', originLat: 7.3754, originLng: -72.6486,
        destAddress: 'B', destLat: 7.3921, destLng: -72.6602,
        estimatedFare: 9000, distanceKm: 3, etaMinutes: 10,
        createdAt: opts.creado,
        ...(opts.completadoEn ? { completedAt: opts.completadoEn } : {}),
      },
    });

  // ── Semana PASADA (8-14 días): Ana y Beto piden ──────────────────────────
  await viaje({ de: ana.id, creado: diaAtras(10), conConductor: true, completadoEn: diaAtras(10) });
  await viaje({ de: beto.id, creado: diaAtras(9), conConductor: true, completadoEn: diaAtras(9) });

  // ── Semana ACTUAL (últimos 7 días) ───────────────────────────────────────
  // Ana VUELVE (cuenta para retención). Beto NO vuelve — es el caso que hace
  // que la métrica signifique algo: sin alguien que no regrese, un 100 % no
  // demostraría que sabe distinguir. Caro es nueva y por eso no entra en la
  // cohorte: la retención mide a los de la semana pasada, no a los que llegan.
  await viaje({ de: ana.id, creado: diaAtras(2), conConductor: true, completadoEn: diaAtras(2) });
  await viaje({ de: caro.id, creado: diaAtras(1), conConductor: true, completadoEn: diaAtras(1) });
  // Uno que NO encontró conductor: el sistema mismo lo cerró.
  await viaje({ de: caro.id, creado: diaAtras(4), sinConductores: true });
  // Uno todavía buscando: cuenta como solicitado y sin conductor.
  await viaje({ de: caro.id, creado: diaAtras(0) });

  const m = await getMetricasNegocio(30);

  console.log('\n═══ Emparejamiento ═══');
  comprobar('cuenta las 6 solicitudes', m.emparejamiento.solicitados === 6,
    String(m.emparejamiento.solicitados));
  comprobar('4 encontraron conductor', m.emparejamiento.conConductor === 4,
    String(m.emparejamiento.conConductor));
  comprobar('1 se cerró por falta de conductores', m.emparejamiento.sinConductor === 1,
    String(m.emparejamiento.sinConductor));
  comprobar('la tasa es 4/6 = 66,7 %', m.emparejamiento.tasa === 66.7,
    String(m.emparejamiento.tasa));

  console.log('\n═══ Retención semanal ═══');
  // Ana y Beto pidieron la semana pasada; solo Ana volvió.
  comprobar('la base son los 2 de la semana pasada', m.retencion.base === 2,
    String(m.retencion.base));
  comprobar('volvió 1', m.retencion.volvieron === 1, String(m.retencion.volvieron));
  comprobar('el porcentaje es 50', m.retencion.pct === 50, String(m.retencion.pct));
  comprobar('pero se marca NO fiable (base de 2)', m.retencion.fiable === false);

  console.log('\n═══ Serie diaria ═══');
  const total = m.serie.reduce((a, d) => a + d.solicitados, 0);
  const hechos = m.serie.reduce((a, d) => a + d.completados, 0);
  comprobar('la serie suma las 6 solicitudes', total === 6, String(total));
  comprobar('y los 4 completados', hechos === 4, String(hechos));
  comprobar('cubre los 30 días pedidos', m.serie.length === 30, String(m.serie.length));
  comprobar('los días sin viajes están, en cero',
    m.serie.some((d) => d.solicitados === 0),
    'ningún día vacío: la serie se estaría saltando días');

  console.log('\n═══ Pasajeros activos ═══');
  comprobar('son 3 personas distintas', m.pasajerosActivos === 3,
    String(m.pasajerosActivos));

  console.log('\n═══ Un rango corto no arrastra lo viejo ═══');
  {
    // 3 días: dentro quedan el de Ana (día 2), el de Caro (día 1) y el de hoy.
    // Fuera, los de la semana pasada y el del día 4.
    const corto = await getMetricasNegocio(3);
    comprobar('solo cuenta lo reciente', corto.emparejamiento.solicitados === 3,
      String(corto.emparejamiento.solicitados));
    comprobar('y la serie tiene 3 días', corto.serie.length === 3, String(corto.serie.length));
  }

  console.log('\n═══ Sin datos NO se inventa nada ═══');
  {
    await prisma.trip.deleteMany({});
    const vacio = await getMetricasNegocio(7);
    comprobar('la tasa de emparejamiento es null, no 0',
      vacio.emparejamiento.tasa === null, String(vacio.emparejamiento.tasa));
    comprobar('la retención es null, no 0', vacio.retencion.pct === null,
      String(vacio.retencion.pct));
    comprobar('la serie sigue teniendo sus 7 días en cero',
      vacio.serie.length === 7 && vacio.serie.every((d) => d.solicitados === 0));
  }

  // Limpieza.
  await prisma.trip.deleteMany({});
  await prisma.driver.delete({ where: { id: conductor.id } });
  await prisma.user.deleteMany({ where: { id: { in: [ana.id, beto.id, caro.id] } } });

  console.log(`\n${fallos === 0 ? '✅ Las cifras del piloto cuentan lo que dicen' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
