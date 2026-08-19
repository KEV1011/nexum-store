/**
 * E2E: el viaje urbano insiste un minuto antes de rendirse.
 *
 * Antes se rendía al primer intento. Si en ESE segundo no había nadie a 5 km
 * —el conductor más cercano venía de dejar a otro pasajero, o su teléfono
 * acababa de reportar— el pasajero recibía "no hay conductores disponibles" al
 * instante, con carros a cuatro cuadras.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/insistir-viaje.ts
 */
import { prisma } from '../src/lib/prisma';
import {
  startMatchingCycle, registerSendToDriver, registerOnNoDrivers, onDriverAccept,
} from '../src/services/matching.service';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}
const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const PLAZA = { lat: 7.3754, lng: -72.6486 };

async function crearViaje(userId: string): Promise<string> {
  const t = await prisma.trip.create({
    data: {
      requestRef: `INS-${Date.now()}-${Math.floor(Math.random() * 999)}`,
      passengerId: userId, serviceType: 'TAXI', status: 'SEARCHING',
      originAddress: 'Plaza', destAddress: 'Terminal',
      originLat: PLAZA.lat, originLng: PLAZA.lng,
      destLat: PLAZA.lat + 0.01, destLng: PLAZA.lng,
      estimatedFare: 9000, distanceKm: 3, etaMinutes: 10,
    },
  });
  return t.id;
}

async function conectarConductor(nombre: string): Promise<string> {
  const d = await prisma.driver.create({
    data: {
      phone: `+5738${Math.floor(10000000 + Math.random() * 89999999)}`,
      name: nombre, status: 'ONLINE', isVerified: true,
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: d.id, type: 'TAXI', isActive: true,
      plate: `T${Math.floor(100 + Math.random() * 899)}`,
      brand: 'M', model: 'M', year: 2020, color: 'Amarillo',
    },
  });
  await prisma.$executeRaw`
    UPDATE "drivers"
    SET "geo" = ST_SetSRID(ST_MakePoint(${PLAZA.lng}, ${PLAZA.lat}), 4326)::geography,
        "lastSeenAt" = now()
    WHERE "id" = ${d.id}`;
  return d.id;
}

async function main(): Promise<void> {
  console.log('\n═══ El viaje insiste antes de rendirse ═══\n');

  const ofertas: Array<{ driverId: string; tripId: string }> = [];
  registerSendToDriver((driverId, msg) => {
    if (msg['type'] === 'trip_request') {
      const t = msg['trip'] as { id?: string } | undefined;
      ofertas.push({ driverId, tripId: t?.id ?? '' });
    }
  });
  let sinConductor = 0;
  registerOnNoDrivers(() => { sinConductor++; });

  const user = await prisma.user.create({
    data: { phone: `+5736${Math.floor(10000000 + Math.random() * 89999999)}`, name: 'Pasajero' },
  });

  // ── 1. No hay nadie al pedirlo, pero alguien se conecta 15 s después ───────
  console.log('1. El conductor se conecta DESPUÉS de pedir el viaje');
  const viaje = await crearViaje(user.id);
  await startMatchingCycle(viaje, PLAZA.lat, PLAZA.lng);
  comprobar('no se rinde al instante', sinConductor === 0,
    'avisó "sin conductores" en el primer intento');
  comprobar('y todavía no ofrece nada', ofertas.length === 0, `ofertas: ${ofertas.length}`);

  // El conductor aparece cuando ya se pidió el viaje.
  const conductor = await conectarConductor('Llega tarde');
  console.log('   (conductor conectado; esperando al siguiente barrido…)');
  await esperar(14_000);

  const paraEsteViaje = ofertas.filter((o) => o.tripId === viaje);
  comprobar('el reintento SÍ le ofrece el viaje', paraEsteViaje.length >= 1,
    'el pasajero se habría quedado sin carro teniendo uno al lado');
  comprobar('y se lo ofrece al conductor correcto',
    paraEsteViaje[0]?.driverId === conductor, 'otro conductor');

  // ── 2. Al aceptar, deja de insistir ────────────────────────────────────────
  console.log('\n2. Al aceptar se corta la insistencia');
  const aceptado = await onDriverAccept(viaje, conductor);
  comprobar('la aceptación prospera', aceptado, 'no pudo aceptar');
  const antes = ofertas.length;
  await esperar(14_000);
  comprobar('no vuelve a barrer un viaje ya tomado', ofertas.length === antes,
    `siguió ofreciendo (${ofertas.length - antes} ofertas de más)`);
  const estado = await prisma.trip.findUnique({ where: { id: viaje }, select: { status: true } });
  comprobar('el viaje queda ACCEPTED', estado?.status === 'ACCEPTED', `${estado?.status}`);

  console.log(`\n${fallos === 0 ? '✓ TODO EN VERDE' : `✗ ${fallos} FALLIDAS`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('ERROR:', e);
  await prisma.$disconnect();
  process.exit(1);
});
