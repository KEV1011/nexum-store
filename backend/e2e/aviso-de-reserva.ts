/**
 * E2E del aviso de reserva nueva: **a quién se le dice y a quién no.**
 *
 * EL DEFECTO QUE ESTO FIJA. El tablero de reservas funcionaba y la reserva se
 * creaba bien, pero a ningún conductor se le decía que existía: el único sitio
 * donde aparecía era una tarjeta del home cuyo contador se leía UNA vez al
 * construir la pantalla. Un taxista con la app abierta a las 22:05, cuando
 * alguien reservaba para las 6:00, seguía viendo «Sin reservas por ahora» toda
 * la noche. Desde fuera se ve como lo reportó el usuario: el cliente aparta un
 * trayecto y no le llega a ningún conductor.
 *
 * Lo que se comprueba, por orden de gravedad:
 *
 *  1. **Al conductor que puede tomarla LE LLEGA.** Es el defecto reportado.
 *  2. **Al que no puede, NO.** Avisarle a un motociclista de una reserva de
 *     taxi que el tablero no le muestra y que «Apartar» le rechazaría es la
 *     forma más rápida de enseñarle a ignorar nuestros avisos.
 *  3. **La plaza excluye un dato PRESENTE y distinto, nunca uno que falta.** Es
 *     la misma regla que ya dejó el tablero vacío una vez: una reserva sin
 *     ciudad resuelta se le avisa a todos, una de Pamplona no va a Cúcuta.
 *  4. **Una reserva ya apartada no se anuncia**, o se manda a diez conductores
 *     a pelearse por algo que ya no está.
 *  5. **Soltarla vuelve a avisar**: si no, quedaría tan invisible como antes, y
 *     es la que más corre porque ya se le prometió al pasajero.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/aviso-de-reserva.ts
 */
import { TransportType, TripStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle: unknown = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${JSON.stringify(detalle)}`}`);
  if (!ok) fallos++;
}

const ORIGEN = { lat: 7.3754, lng: -72.6486 };
const tel = () => `+5730${Math.floor(10000000 + Math.random() * 89999999)}`;
const placa = () => `A${Math.floor(1000 + Math.random() * 8999)}`;

const creados = { drivers: [] as string[], trips: [] as string[], users: [] as string[] };

async function sembrarConductor(
  nombre: string,
  tipo: 'TAXI' | 'MOTO' | null,
  citySlug: string | null,
  opts: { verificado?: boolean } = {},
): Promise<string> {
  const d = await prisma.driver.create({
    data: {
      phone: tel(),
      name: nombre,
      // A propósito OFFLINE: el conductor que va camino a su casa es justo el
      // que quiere cuadrar la mañana siguiente. Si el aviso filtrara por «en
      // línea», la función quedaría para quien ya está trabajando.
      status: 'OFFLINE',
      isVerified: opts.verificado ?? true,
      acceptsTrips: true,
      citySlug,
    },
  });
  creados.drivers.push(d.id);
  if (tipo) {
    await prisma.vehicle.create({
      data: {
        driverId: d.id, type: tipo, isActive: true,
        brand: 'Prueba', model: 'X', plate: placa(), year: 2020, color: 'Blanco',
      },
    });
  }
  return d.id;
}

async function sembrarReserva(
  serviceType: TransportType,
  citySlug: string | null,
): Promise<string> {
  const u = await prisma.user.create({ data: { phone: tel(), name: 'Pasajera E2E' } });
  creados.users.push(u.id);
  const cuando = new Date(Date.now() + 10 * 60 * 60 * 1000);
  const t = await prisma.trip.create({
    data: {
      requestRef: `E2E-${Math.floor(100000 + Math.random() * 899999)}`,
      passengerId: u.id,
      serviceType,
      status: TripStatus.SCHEDULED,
      scheduledFor: cuando,
      searchFrom: new Date(cuando.getTime() - 15 * 60_000),
      citySlug,
      originAddress: 'Calle 5 # 3-40',
      originLat: ORIGEN.lat,
      originLng: ORIGEN.lng,
      destAddress: 'Universidad de Pamplona',
      destLat: 7.3921,
      destLng: -72.6602,
      estimatedFare: 6000,
    },
  });
  creados.trips.push(t.id);
  return t.id;
}

async function main(): Promise<void> {
  const reservas = await import('../src/services/reservas.service');

  // El canal al conductor, interceptado: es lo único que prueba a quién le
  // llegó de verdad. En modo mock el push solo se escribe en consola.
  const avisados: string[] = [];
  reservas.registerReservaSendToDriver((driverId, msg) => {
    if (msg['type'] === 'reserva_nueva') avisados.push(driverId);
  });

  console.log('\n[1] Se avisa a quien PUEDE tomarla, y solo a él');
  const taxiPam = await sembrarConductor('Taxi Pamplona', 'TAXI', 'pamplona');
  const motoPam = await sembrarConductor('Moto Pamplona', 'MOTO', 'pamplona');
  const taxiCuc = await sembrarConductor('Taxi Cúcuta', 'TAXI', 'cucuta');
  const sinCarro = await sembrarConductor('Sin vehículo', null, 'pamplona');
  const sinPlaza = await sembrarConductor('Taxi sin plaza', 'TAXI', null);

  {
    avisados.length = 0;
    const trip = await sembrarReserva(TransportType.TAXI, 'pamplona');
    const n = await reservas.notificarNuevaReserva(trip);

    comprobar('al taxista de la plaza LE LLEGA', avisados.includes(taxiPam), avisados);
    comprobar(
      'al taxista sin plaza resuelta también (un dato que falta no excluye)',
      avisados.includes(sinPlaza),
      avisados,
    );
    comprobar('al motociclista NO (su vehículo no atiende taxi)', !avisados.includes(motoPam));
    comprobar('al taxista de otra ciudad NO', !avisados.includes(taxiCuc));
    comprobar('al que no tiene vehículo activo NO', !avisados.includes(sinCarro));
    comprobar('el conteo que devuelve coincide con lo enviado', n === avisados.length, { n, avisados });
  }

  console.log('\n[2] Una reserva SIN ciudad resuelta se le avisa a todos');
  {
    // Es el caso que ya dejó el tablero en blanco una vez: el conductor recibe
    // su plaza en cada latido, el viaje solo si `plazaDeCoordenadas` resolvió.
    avisados.length = 0;
    const trip = await sembrarReserva(TransportType.TAXI, null);
    await reservas.notificarNuevaReserva(trip);
    comprobar('al de Pamplona', avisados.includes(taxiPam));
    comprobar('y al de Cúcuta también', avisados.includes(taxiCuc), avisados);
  }

  console.log('\n[3] Un ENVÍO lo puede llevar cualquier vehículo');
  {
    avisados.length = 0;
    const trip = await sembrarReserva(TransportType.ENVIOS, 'pamplona');
    await reservas.notificarNuevaReserva(trip);
    comprobar('le llega al taxista', avisados.includes(taxiPam));
    comprobar('y al motociclista', avisados.includes(motoPam), avisados);
  }

  console.log('\n[4] Lo que ya no está en el tablero no se anuncia');
  {
    avisados.length = 0;
    const trip = await sembrarReserva(TransportType.TAXI, 'pamplona');
    await prisma.trip.update({ where: { id: trip }, data: { driverId: taxiPam } });
    const n = await reservas.notificarNuevaReserva(trip);
    comprobar('reserva ya apartada: no se avisa a nadie', n === 0 && avisados.length === 0, avisados);

    avisados.length = 0;
    const activa = await sembrarReserva(TransportType.TAXI, 'pamplona');
    await prisma.trip.update({ where: { id: activa }, data: { status: TripStatus.SEARCHING } });
    comprobar(
      'reserva que el barrido ya activó: tampoco',
      (await reservas.notificarNuevaReserva(activa)) === 0,
    );
  }

  console.log('\n[5] Soltarla la devuelve al tablero Y vuelve a avisar');
  {
    const trip = await sembrarReserva(TransportType.TAXI, 'pamplona');
    await prisma.trip.update({ where: { id: trip }, data: { driverId: taxiPam } });
    avisados.length = 0;
    await reservas.soltarReserva(taxiPam, trip);
    // `soltarReserva` avisa sin esperar (best-effort), así que se le da un
    // instante al bucle de eventos antes de mirar.
    await new Promise((r) => setTimeout(r, 400));
    const fila = await prisma.trip.findUnique({
      where: { id: trip }, select: { driverId: true, status: true },
    });
    comprobar('vuelve a estar libre', fila?.driverId === null && fila?.status === 'SCHEDULED', fila);
    comprobar('y se vuelve a anunciar', avisados.includes(taxiPam), avisados);
  }

  console.log('\n[6] La reserva que crea el cliente dispara el aviso sola');
  {
    // La comprobación que de verdad persigue el reporte: no que la función
    // exista, sino que el camino del pasajero la llame.
    const { requestClientTrip } = await import('../src/services/client.service');
    const u = await prisma.user.create({ data: { phone: tel(), name: 'Pasajero real' } });
    creados.users.push(u.id);
    avisados.length = 0;
    const creada = await requestClientTrip(u.id, {
      serviceType: 'taxi',
      originAddress: 'Calle 5 # 3-40, Pamplona',
      originLat: ORIGEN.lat,
      originLng: ORIGEN.lng,
      destinationAddress: 'Universidad de Pamplona',
      destLat: 7.3921,
      destLng: -72.6602,
      // El servidor mide el trayecto y descarta estos números; van porque el
      // DTO los exige (hay apps instaladas que todavía los mandan).
      estimatedFare: 0,
      distanceKm: 0,
      etaMinutes: 0,
      scheduledFor: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
    });
    creados.trips.push(creada.id);
    // El aviso sale sin esperar para no retener la respuesta del pasajero.
    await new Promise((r) => setTimeout(r, 1200));
    comprobar('el viaje queda reservado', creada.status === 'scheduled', creada.status);
    comprobar(
      'y al taxista de la plaza le llegó sin que nadie lo pidiera',
      avisados.includes(taxiPam),
      avisados,
    );
  }

  // ── Limpieza ───────────────────────────────────────────────────────────────
  await prisma.trip.deleteMany({ where: { id: { in: creados.trips } } });
  await prisma.vehicle.deleteMany({ where: { driverId: { in: creados.drivers } } });
  await prisma.driver.deleteMany({ where: { id: { in: creados.drivers } } });
  await prisma.user.deleteMany({ where: { id: { in: creados.users } } });

  console.log(`\n${fallos === 0 ? 'TODO EN VERDE' : 'HAY FALLOS'}: ${fallos} fallos`);
  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
