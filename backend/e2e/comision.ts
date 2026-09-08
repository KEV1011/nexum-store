/**
 * E2E de la comisión por flota y por ciudad.
 *
 * Las pruebas unitarias fijan la regla (flota → ciudad → global) sobre valores
 * sueltos. Esto comprueba lo otro, que es donde de verdad se rompe: que al
 * cerrar un viaje REAL se busquen los dos datos en la base, se aplique el que
 * manda, y que lo que queda escrito en el viaje no vuelva a moverse cuando la
 * tasa cambie mañana.
 *
 * Un fallo aquí no da una pantalla rota: da un conductor cobrando de menos
 * durante semanas, o una flota a la que se le prometió el 10 % pagando el 15.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/comision.ts
 */
import { prisma } from '../src/lib/prisma';
import { COMISION_GLOBAL } from '../src/lib/comision';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const tel = (p: string) => `+57${p}${Math.floor(10000000 + Math.random() * 89999999)}`;

// Casco urbano de Pamplona: es donde se siembran los viajes, y la ciudad se
// resuelve por cercanía al centroide del municipio.
const PAMPLONA = { lat: 7.3754, lng: -72.6486 };

async function main(): Promise<void> {
  const { tasaComision, comisionPara } = await import('../src/services/comision.service');
  const { updateClientTripStatus } = await import('../src/services/client.service');
  const { setOperatorCommission } = await import('../src/services/admin.service');
  const {
    setMunicipalityCommission,
    upsertMunicipality,
    invalidarCacheMunicipios,
  } = await import('../src/services/municipality.service');

  const marca = `e2ecom-${Date.now()}`;

  // La plaza donde ocurre todo. Se deja SIN comisión propia para empezar.
  await upsertMunicipality({
    slug: 'pamplona',
    name: 'Pamplona',
    department: 'Norte de Santander',
    lat: PAMPLONA.lat,
    lng: PAMPLONA.lng,
    commissionRate: null,
  });

  const flota = await prisma.operator.create({
    data: {
      legalName: `${marca} Transportes`,
      nit: `900${Math.floor(100000 + Math.random() * 899999)}`,
      type: 'MIXED',
      status: 'ACTIVE',
      isVerified: true,
      contactName: 'Dueño',
      contactPhone: tel('31'),
    },
  });
  const conAfiliado = await prisma.driver.create({
    data: { phone: tel('39'), name: `${marca}-afiliado`, isVerified: true, operatorId: flota.id },
  });
  const conSuelto = await prisma.driver.create({
    data: { phone: tel('39'), name: `${marca}-suelto`, isVerified: true },
  });
  const pasajero = await prisma.user.create({ data: { phone: tel('30'), name: `${marca}-pax` } });

  const ctxAfiliado = {
    operatorId: flota.id,
    driverId: conAfiliado.id,
    lat: PAMPLONA.lat,
    lng: PAMPLONA.lng,
  };
  const ctxSuelto = {
    driverId: conSuelto.id,
    lat: PAMPLONA.lat,
    lng: PAMPLONA.lng,
  };

  console.log('\n═══ Sin nada configurado: la global de siempre ═══');
  {
    const r = await comisionPara(ctxAfiliado);
    comprobar(`la tasa es la global (${COMISION_GLOBAL})`, r.tasa === COMISION_GLOBAL, String(r.tasa));
    comprobar('y lo dice: origen «global»', r.origen === 'global', r.origen);
  }

  console.log('\n═══ La ciudad fija la suya: manda sobre la global ═══');
  {
    await setMunicipalityCommission('pamplona', 8); // el admin escribe «8», no 0.08
    const guardada = await prisma.municipality.findUnique({ where: { slug: 'pamplona' } });
    comprobar('se guarda como fracción, no como 8', guardada?.commissionRate === 0.08,
      String(guardada?.commissionRate));
    const r = await comisionPara(ctxSuelto);
    comprobar('un conductor sin flota paga la de la plaza', r.tasa === 0.08, String(r.tasa));
    comprobar('origen «ciudad»', r.origen === 'ciudad', r.origen);
  }

  console.log('\n═══ La flota manda sobre la ciudad: es con quien se firma ═══');
  {
    await setOperatorCommission(flota.id, 12);
    const r = await comisionPara(ctxAfiliado);
    comprobar('el afiliado paga el 12 % pactado, no el 8 de la plaza', r.tasa === 0.12, String(r.tasa));
    comprobar('origen «flota»', r.origen === 'flota', r.origen);
    // Y el de al lado, en la misma esquina, sigue pagando el de la ciudad.
    const otro = await comisionPara(ctxSuelto);
    comprobar('el conductor suelto sigue en el 8 %', otro.tasa === 0.08, String(otro.tasa));
  }

  console.log('\n═══ Una flota con comisión CERO no hereda: es un acuerdo ═══');
  {
    await setOperatorCommission(flota.id, 0);
    const r = await comisionPara(ctxAfiliado);
    comprobar('cobra 0 %, no el 8 de la ciudad', r.tasa === 0, String(r.tasa));
    comprobar('origen «flota»', r.origen === 'flota', r.origen);
    await setOperatorCommission(flota.id, 12); // se restaura para lo que sigue
  }

  console.log('\n═══ Se rechaza el dedazo antes de guardarlo ═══');
  {
    let rechazado = false;
    try { await setOperatorCommission(flota.id, 150); } catch { rechazado = true; }
    comprobar('un 150 % no llega a la base', rechazado);
    const sigue = await prisma.operator.findUnique({ where: { id: flota.id } });
    comprobar('y la tasa buena sigue intacta', sigue?.commissionRate === 0.12,
      String(sigue?.commissionRate));
  }

  console.log('\n═══ Un viaje REAL se liquida con la tasa de su flota ═══');
  let viajeId = '';
  {
    const viaje = await prisma.trip.create({
      data: {
        requestRef: `NXM-${Date.now() % 1000000}`,
        passengerId: pasajero.id,
        driverId: conAfiliado.id,
        operatorId: flota.id,
        serviceType: 'PARTICULAR',
        status: 'IN_PROGRESS',
        originAddress: 'A', originLat: PAMPLONA.lat, originLng: PAMPLONA.lng,
        destAddress: 'B', destLat: 7.3921, destLng: -72.6602,
        estimatedFare: 10000, distanceKm: 4, etaMinutes: 12,
      },
    });
    viajeId = viaje.id;
    await updateClientTripStatus(viaje.id, 'completed');
    const cerrado = await prisma.trip.findUnique({ where: { id: viaje.id } });
    const bruto = cerrado?.finalFare ?? 0;
    const esperada = Math.round(bruto * 0.12);
    comprobar('el viaje quedó COMPLETED con tarifa', cerrado?.status === 'COMPLETED' && bruto > 0,
      `${cerrado?.status} / ${bruto}`);
    comprobar(`la comisión es el 12 % del bruto (${esperada})`, cerrado?.commission === esperada,
      `${cerrado?.commission}`);
    comprobar('y NO el 15 % global', cerrado?.commission !== Math.round(bruto * COMISION_GLOBAL));
    comprobar('bruto − comisión = neto', bruto - (cerrado?.commission ?? 0) === cerrado?.netEarning,
      `${bruto} − ${cerrado?.commission} ≠ ${cerrado?.netEarning}`);
  }

  console.log('\n═══ Renegociar mañana NO reescribe lo de ayer ═══');
  {
    const antes = await prisma.trip.findUnique({ where: { id: viajeId } });
    await setOperatorCommission(flota.id, 30);
    const despues = await prisma.trip.findUnique({ where: { id: viajeId } });
    comprobar('la comisión del viaje cerrado no se movió',
      despues?.commission === antes?.commission, `${antes?.commission} → ${despues?.commission}`);
    comprobar('el neto del conductor tampoco',
      despues?.netEarning === antes?.netEarning, `${antes?.netEarning} → ${despues?.netEarning}`);
  }

  console.log('\n═══ Quitar la tasa devuelve la herencia ═══');
  {
    await setOperatorCommission(flota.id, null);
    const r = await comisionPara(ctxAfiliado);
    comprobar('la flota vuelve a la de su ciudad (8 %)', r.tasa === 0.08, String(r.tasa));
    await setMunicipalityCommission('pamplona', null);
    invalidarCacheMunicipios();
    const g = await comisionPara(ctxAfiliado);
    comprobar('y sin la de la ciudad, la global', g.tasa === COMISION_GLOBAL, String(g.tasa));
    comprobar('origen «global»', g.origen === 'global', g.origen);
  }

  console.log('\n═══ Lejos de toda plaza no se inventa una ciudad ═══');
  {
    await setMunicipalityCommission('pamplona', 8);
    // En medio del Atlántico: no hay municipio al que atribuirle el viaje.
    const t = await tasaComision({ driverId: conSuelto.id, lat: 0, lng: -30 });
    comprobar('se cobra la global, no la de la última ciudad vista',
      t === COMISION_GLOBAL, String(t));
    await setMunicipalityCommission('pamplona', null);
  }

  // Limpieza.
  await prisma.trip.deleteMany({ where: { passengerId: pasajero.id } });
  await prisma.driverEarning.deleteMany({
    where: { driverId: { in: [conAfiliado.id, conSuelto.id] } },
  });
  await prisma.user.delete({ where: { id: pasajero.id } });
  await prisma.driver.deleteMany({ where: { id: { in: [conAfiliado.id, conSuelto.id] } } });
  await prisma.operator.delete({ where: { id: flota.id } });

  console.log(`\n${fallos === 0 ? '✅ La comisión sale de donde debe y no reescribe la historia' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
