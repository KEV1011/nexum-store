/**
 * E2E: el recordatorio de la reserva, media hora antes y a LOS DOS.
 *
 * EL DEFECTO QUE CIERRA. La reserva solo avisaba al ACTIVARSE —quince minutos
 * antes— y su push decía «empieza ahora». Quien apartó el lunes una carrera
 * para el viernes a las 6:00 no recibía nada hasta ese momento: si no abría la
 * app, se le pasaba. Y al pasajero no se le decía nada hasta que el conductor
 * ya iba en camino.
 *
 * LO QUE SE COMPRUEBA, y por qué cada cosa:
 *
 *  1. **Salen los DOS avisos**, al conductor y al pasajero. Avisar solo a uno
 *     es la mitad del problema: el taxista que no sabe no sale, y el pasajero
 *     que no sabe no está listo.
 *  2. **UNA sola vez.** El barrido corre cada minuto; sin la marca
 *     (`reminderSentAt`) les sonaría el teléfono treinta veces seguidas. Es la
 *     misma lección que ya costó el aviso de «sin conductor» repitiéndose cada
 *     cinco minutos en producción.
 *  3. **Solo a las reservas con conductor.** A las que están esperando a que
 *     alguien las aparte no se les manda nada: la búsqueda arranca quince
 *     minutos antes, y decirle al pasajero a media hora que «aún no hay
 *     conductor» lo alarma por algo que en ese momento es normal.
 *  4. **No se adelanta.** Una reserva de mañana no se recuerda hoy.
 *  5. **No pisa la activación.** El recordatorio no cambia el estado: la
 *     reserva sigue SCHEDULED y es `activarReservas` quien la pasa a ACCEPTED.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/recordatorio-reserva.ts
 */
import { prisma } from '../src/lib/prisma';
import { recordarReservas, RECORDATORIO_MIN } from '../src/services/reservas.service';

let fallos = 0;
let ok = 0;
function comprobar(nombre: string, cond: boolean, detalle?: unknown): void {
  if (cond) { ok++; logOriginal(`  ✓ ${nombre}`); }
  else {
    fallos++;
    logOriginal(`  ✗ ${nombre}`, detalle !== undefined ? JSON.stringify(detalle) : '');
  }
}

// Los push en modo mock se escriben en el log. Se capturan para poder afirmar
// QUIÉN recibió el aviso: comprobar solo la marca en la base diría que el
// barrido pasó, no que alguien se enteró.
const avisos: string[] = [];
const logOriginal = console.log.bind(console);
console.log = (...args: unknown[]): void => {
  const linea = args.map((a) => String(a)).join(' ');
  if (linea.includes('[Push:mock]') || linea.includes('[Push] Sent')) avisos.push(linea);
  logOriginal(...args);
};
const avisosDe = (id: string): string[] => avisos.filter((l) => l.includes(id));

/// Los push salen con `void` (best-effort: un fallo de Firebase no puede
/// frenar el barrido), así que al volver de `recordarReservas` todavía no se
/// han escrito. Se le da un suspiro al bucle de eventos.
const dejarSalirLosPush = (): Promise<void> =>
  new Promise((r) => setTimeout(r, 300));

const sufijo = `${Date.now()}`.slice(-7);
let n = 0;
const tel = (): string => `+57350${sufijo}${(n++).toString()}`.slice(0, 13);

/** Una reserva programada dentro de la ventana del recordatorio. */
async function sembrarReserva(opts: {
  driverId: string | null;
  passengerId: string;
  minutos: number;
}): Promise<string> {
  const t = await prisma.trip.create({
    data: {
      requestRef: `RES-${sufijo}-${n++}`,
      passengerId: opts.passengerId,
      ...(opts.driverId ? { driverId: opts.driverId } : {}),
      serviceType: 'TAXI',
      status: 'SCHEDULED',
      originAddress: 'Calle 5 # 3-40',
      originLat: 7.3754,
      originLng: -72.6486,
      destAddress: 'Universidad de Pamplona',
      destLat: 7.3800,
      destLng: -72.6400,
      estimatedFare: 6000,
      distanceKm: 2.1,
      scheduledFor: new Date(Date.now() + opts.minutos * 60 * 1000),
      searchFrom: new Date(Date.now() + (opts.minutos - 15) * 60 * 1000),
    },
  });
  return t.id;
}

async function main(): Promise<void> {
  logOriginal('\n═══ Recordatorio de la reserva ═══\n');
  logOriginal(`(la ventana configurada es de ${RECORDATORIO_MIN} minutos)\n`);

  const pasajero = await prisma.user.create({
    data: { phone: tel(), name: 'Pasajera E2E', fcmToken: `tk-cli-${sufijo}` },
  });
  const conductor = await prisma.driver.create({
    data: {
      phone: tel(),
      name: 'Taxista E2E',
      documentNumber: `${sufijo}91`,
      status: 'ONLINE',
      isVerified: true,
      lastSeenAt: new Date(),
      fcmToken: `tk-con-${sufijo}`,
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: conductor.id,
      type: 'TAXI',
      plate: `TAX${sufijo.slice(-3)}`,
      brand: 'Chevrolet',
      model: 'Spark',
      year: 2020,
      color: 'Amarillo',
      isActive: true,
    },
  });

  // ── 1. Apartada y dentro de la ventana: avisa a los dos ───────────────────
  logOriginal('1. Reserva apartada, dentro de la media hora');
  const dentro = await sembrarReserva({
    driverId: conductor.id,
    passengerId: pasajero.id,
    minutos: RECORDATORIO_MIN - 5,
  });

  const primera = await recordarReservas();
  comprobar('el barrido manda al menos un recordatorio', primera >= 1, primera);
  await dejarSalirLosPush();

  const alConductor = avisosDe(`driver=${conductor.id}`);
  const alPasajero = avisosDe(`user=${pasajero.id}`);
  comprobar(
    'le llega al CONDUCTOR',
    alConductor.some((l) => l.includes('reserva_recordatorio')),
    alConductor,
  );
  comprobar(
    'y le llega al PASAJERO',
    alPasajero.some((l) => l.includes('reserva_recordatorio')),
    alPasajero,
  );
  comprobar(
    'con la hora en 24 h, no «p. m.»',
    alConductor.every((l) => !l.includes('m.')),
    alConductor,
  );

  const marcada = await prisma.trip.findUniqueOrThrow({
    where: { id: dentro },
    select: { reminderSentAt: true, status: true },
  });
  comprobar('queda constancia de la hora del aviso', marcada.reminderSentAt != null);
  comprobar(
    'el recordatorio NO activa la reserva: eso es otro barrido',
    marcada.status === 'SCHEDULED',
    marcada.status,
  );

  // ── 2. No se repite ───────────────────────────────────────────────────────
  logOriginal('\n2. El barrido vuelve a pasar un minuto después');
  const antes = avisos.length;
  const segunda = await recordarReservas();
  await dejarSalirLosPush();
  const despues = avisos.length;
  comprobar(
    'no se manda nada la segunda vez',
    despues === antes,
    { antes, despues, segunda },
  );


  // ── 2.5. Dos barridos A LA VEZ ────────────────────────────────────────────
  //
  // ESTO es lo que comprueba la guarda atómica, y la de arriba NO: en el
  // barrido secuencial la reserva ya no aparece en el `findMany` (filtra por
  // `reminderSentAt: null`), así que quitar el `updateMany` con guarda deja la
  // prueba en verde igual —comprobado—. Con Render levantando dos instancias,
  // o con un barrido que se solapa con el anterior, los dos encuentran la
  // misma fila y sin la guarda los dos avisan: al pasajero le suena el
  // teléfono dos veces por la misma carrera.
  logOriginal('\n2.5. Cuatro barridos simultáneos sobre la misma reserva');
  const simultanea = await sembrarReserva({
    driverId: conductor.id,
    passengerId: pasajero.id,
    minutos: RECORDATORIO_MIN - 7,
  });
  const antesSim = avisos.length;
  const resultados = await Promise.all([
    recordarReservas(), recordarReservas(),
    recordarReservas(), recordarReservas(),
  ]);
  await dejarSalirLosPush();
  const salieron = avisos.length - antesSim;
  comprobar(
    'solo UN barrido se la lleva: dos avisos (conductor y pasajero), no ocho',
    salieron === 2,
    { salieron, resultados, lineas: avisos.slice(antesSim) },
  );

  // ── 3. Sin conductor no se avisa ──────────────────────────────────────────
  logOriginal('\n3. Reserva que nadie ha apartado todavía');
  const huerfana = await sembrarReserva({
    driverId: null,
    passengerId: pasajero.id,
    minutos: RECORDATORIO_MIN - 5,
  });
  const antesHuerfana = avisos.length;
  await recordarReservas();
  await dejarSalirLosPush();
  comprobar(
    'al pasajero no se le alarma: la búsqueda aún no ha empezado',
    avisos.length === antesHuerfana,
    avisos.slice(antesHuerfana),
  );
  const sinMarca = await prisma.trip.findUniqueOrThrow({
    where: { id: huerfana },
    select: { reminderSentAt: true },
  });
  comprobar('y no se le gasta la marca', sinMarca.reminderSentAt === null);

  // ── 4. Todavía falta mucho ────────────────────────────────────────────────
  logOriginal('\n4. Reserva para dentro de tres horas');
  const lejana = await sembrarReserva({
    driverId: conductor.id,
    passengerId: pasajero.id,
    minutos: 180,
  });
  const antesLejana = avisos.length;
  await recordarReservas();
  await dejarSalirLosPush();
  comprobar(
    'no se recuerda con tres horas de antelación',
    avisos.length === antesLejana,
    avisos.slice(antesLejana),
  );

  // ── 5. La hora ya pasó: la resuelven los otros barridos ───────────────────
  logOriginal('\n5. Reserva cuya hora ya pasó');
  const pasada = await sembrarReserva({
    driverId: conductor.id,
    passengerId: pasajero.id,
    minutos: -10,
  });
  const antesPasada = avisos.length;
  await recordarReservas();
  await dejarSalirLosPush();
  comprobar(
    'una reserva vencida no se «recuerda»: la activa o la libera su barrido',
    avisos.length === antesPasada,
    avisos.slice(antesPasada),
  );

  // Limpieza: los viajes de esta corrida, para no contaminar las siguientes.
  await prisma.trip.deleteMany({
    where: { id: { in: [dentro, simultanea, huerfana, lejana, pasada] } },
  });
  await prisma.vehicle.deleteMany({ where: { driverId: conductor.id } });
  await prisma.driver.delete({ where: { id: conductor.id } });
  await prisma.user.delete({ where: { id: pasajero.id } });

  await prisma.$disconnect();
  logOriginal(`\n${'─'.repeat(60)}`);
  logOriginal(`Comprobaciones: ${ok} en verde, ${fallos} en rojo`);
  if (fallos > 0) process.exit(1);
}

main().catch(async (e) => {
  logOriginal(e);
  await prisma.$disconnect();
  process.exit(1);
});
