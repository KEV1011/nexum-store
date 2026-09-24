/**
 * El saldo del conductor, contra PostgreSQL real.
 *
 * LO QUE SOLO SE VE EJECUTANDO: que el método sellado en el viaje llegue hasta
 * la columna. Son cuatro saltos —`Trip.paymentMethod` → `updateClientTripStatus`
 * → `recordCompletedTrip` → `driver_earnings`— y la prueba unitaria solo
 * conoce el último. El defecto vivía justo en el primero: nadie leía el campo.
 *
 * EL CASO QUE ESTO IMPIDE: cincuenta carreras en efectivo daban ~$255.000
 * «disponibles» de plata que el conductor ya tenía en el bolsillo, y encima
 * nunca se le cobraba la comisión.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/saldo-real-conductor.ts
 */
import { prisma } from '../src/lib/prisma';
import { getDriverBalance } from '../src/services/payout.service';
import { updateClientTripStatus } from '../src/services/client.service';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

const sufijo = () => Math.floor(10000 + Math.random() * 89999);
const PAMPLONA = { lat: 7.3754, lng: -72.6486 };

async function main() {
  const marca = `e2esaldo-${Date.now()}`;

  const conductor = await prisma.driver.create({
    data: {
      name: `${marca} Taxista`, phone: `+5730011${sufijo()}`,
      isVerified: true, status: 'ONLINE',
    },
  });
  const pasajero = await prisma.user.create({
    data: { name: `${marca} Pasajero`, phone: `+5730022${sufijo()}` },
  });

  let n = 0;
  /** Siembra un viaje asignado y lo cierra con el método indicado. */
  async function carrera(metodo: string | null) {
    const t = await prisma.trip.create({
      data: {
        requestRef: `${marca}-${n++}`,
        passengerId: pasajero.id,
        driverId: conductor.id,
        serviceType: 'TAXI',
        status: 'IN_PROGRESS',
        originAddress: 'A', originLat: PAMPLONA.lat, originLng: PAMPLONA.lng,
        destAddress: 'B', destLat: 7.3921, destLng: -72.6602,
        estimatedFare: 10000, distanceKm: 4, etaMinutes: 12,
        paymentMethod: metodo,
      },
    });
    await updateClientTripStatus(t.id, 'completed');
    return prisma.trip.findUnique({ where: { id: t.id } });
  }

  console.log('\n[1] Una carrera EN EFECTIVO no deja saldo retirable');
  {
    const cerrada = await carrera('efectivo');
    const bruto = cerrada?.finalFare ?? 0;
    const comision = cerrada?.commission ?? 0;
    check(bruto > 0 && comision > 0, 'el viaje se liquidó', { bruto, comision });

    const b = await getDriverBalance(conductor.id);
    check(b.totalEarned > 0, 'el panel de ganancias SÍ muestra lo que ganó', b.totalEarned);
    check(b.available === 0, 'pero el disponible es CERO: la plata ya la tiene él', b.available);
    check(
      Math.round(b.owed) === Math.round(comision),
      'y queda debiendo exactamente la comisión',
      { owed: b.owed, comision },
    );
  }

  console.log('\n[2] Una carrera EN LÍNEA sí deja saldo');
  {
    const cerrada = await carrera('en_linea');
    const neto = cerrada?.netEarning ?? 0;
    const b = await getDriverBalance(conductor.id);
    // Lo retenido de esta carrera menos la deuda de la anterior.
    const esperado = Math.max(0, Math.round(neto - b.owed));
    check(b.available === esperado, 'el disponible es el neto menos su deuda', {
      disponible: b.available, neto, deuda: b.owed,
    });
    check(b.owed > 0, 'la deuda de la carrera en efectivo sigue viva', b.owed);
  }

  console.log('\n[3] NEQUI al conductor cuenta como efectivo, no como pago en la app');
  {
    const antes = await getDriverBalance(conductor.id);
    const cerrada = await carrera('nequi');
    const despues = await getDriverBalance(conductor.id);
    check(
      Math.round(despues.owed - antes.owed) === Math.round(cerrada?.commission ?? 0),
      'sumó deuda, no saldo — la plata le llegó a él directamente',
      { antes: antes.owed, despues: despues.owed },
    );
  }

  console.log('\n[4] Sin método declarado (apps viejas) se asume EFECTIVO');
  {
    const antes = await getDriverBalance(conductor.id);
    await carrera(null);
    const despues = await getDriverBalance(conductor.id);
    check(
      despues.available <= antes.available,
      'no acredita plata que nunca recibimos',
      { antes: antes.available, despues: despues.available },
    );
    check(despues.owed > antes.owed, 'y sí registra la comisión como deuda');
  }

  console.log('\n[5] El conductor 100 % de efectivo: el caso que se rompía');
  {
    const soloEfectivo = await prisma.driver.create({
      data: {
        name: `${marca} Solo Efectivo`, phone: `+5730033${sufijo()}`,
        isVerified: true, status: 'ONLINE',
      },
    });
    for (let i = 0; i < 5; i++) {
      const t = await prisma.trip.create({
        data: {
          requestRef: `${marca}-ef-${i}`,
          passengerId: pasajero.id, driverId: soloEfectivo.id,
          serviceType: 'TAXI', status: 'IN_PROGRESS',
          originAddress: 'A', originLat: PAMPLONA.lat, originLng: PAMPLONA.lng,
          destAddress: 'B', destLat: 7.3921, destLng: -72.6602,
          estimatedFare: 10000, distanceKm: 4, etaMinutes: 12,
          paymentMethod: 'efectivo',
        },
      });
      await updateClientTripStatus(t.id, 'completed');
    }
    const b = await getDriverBalance(soloEfectivo.id);
    check(b.totalEarned > 0, 'ganó de verdad y el panel lo dice', b.totalEarned);
    check(b.available === 0, 'pero NO puede retirar un peso', b.available);
    check(b.owed > 0, 'y la deuda acumulada está a la vista', b.owed);

    await prisma.trip.deleteMany({ where: { driverId: soloEfectivo.id } });
    await prisma.driverEarning.deleteMany({ where: { driverId: soloEfectivo.id } });
    await prisma.driver.delete({ where: { id: soloEfectivo.id } });
  }

  await prisma.trip.deleteMany({ where: { requestRef: { startsWith: marca } } });
  await prisma.driverEarning.deleteMany({ where: { driverId: conductor.id } });
  await prisma.driver.delete({ where: { id: conductor.id } });
  await prisma.user.delete({ where: { id: pasajero.id } });

  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} comprobaciones OK, ${fallos} en rojo`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
