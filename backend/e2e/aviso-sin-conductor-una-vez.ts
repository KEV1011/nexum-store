/**
 * E2E: «no encontramos conductor» se dice UNA vez, no cada cinco minutos.
 *
 * El defecto, visto en el log de producción del 28/09: dos pasajeros recibiendo
 * `intercity_no_driver` cada cinco minutos durante más de media hora, sin
 * parar. La causa es una asimetría con el viaje urbano:
 *
 *   · el viaje urbano, al agotar candidatos, se CIERRA (CANCELLED con motivo),
 *     así que el barrido de rescate no vuelve a verlo;
 *   · el mandado, el pedido y el intermunicipal se quedan abiertos A PROPÓSITO
 *     —el cliente decide si insiste, el negocio decide si entrega él— y el
 *     aviso no dejaba ninguna marca, así que el barrido los reencontraba cada
 *     cinco minutos y repetía el mismo push para siempre.
 *
 * La marca es `noDriverNotifiedAt`. Esta prueba comprueba las dos mitades: que
 * el aviso sale la primera vez, y que NO se repite.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/aviso-sin-conductor-una-vez.ts
 */
import { prisma } from '../src/lib/prisma';
import { rescatarDespacho } from '../src/services/dispatch-recovery.service';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}
const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── Contar los push sin tocar el servicio ────────────────────────────────────
//
// En modo mock el push se escribe con `[Push:mock]`. Se cuentan solo los de los
// ids de ESTA corrida: la base la comparten varias pruebas y contar todos
// mediría el ruido de otra.
const avisos: string[] = [];
const logOriginal = console.log.bind(console);
console.log = (...args: unknown[]): void => {
  const linea = args.map((a) => String(a)).join(' ');
  if (linea.includes('[Push:mock]') || linea.includes('[Push] Sent')) avisos.push(linea);
  logOriginal(...args);
};
function avisosDe(id: string): number {
  return avisos.filter((l) => l.includes(id)).length;
}

const HACE_DOS_HORAS = (): Date => new Date(Date.now() - 2 * 60 * 60 * 1000);

async function main(): Promise<void> {
  logOriginal('\n═══ El aviso "sin conductor" se da una sola vez ═══\n');

  const sufijo = `${Date.now()}`.slice(-7);
  const user = await prisma.user.create({
    data: { phone: `+5734${sufijo}00`.slice(0, 13), name: 'Pasajero' },
  });
  // Con token: sin él el push ni se intenta y la prueba mediría otra cosa.
  await prisma.user.update({
    where: { id: user.id },
    data: { fcmToken: `token-falso-${sufijo}` },
  });

  // ── 1. Intermunicipal: el caso exacto del log de producción ────────────────
  logOriginal('1. Reserva intermunicipal vieja y sin conductor');
  const reserva = await prisma.intercityBooking.create({
    data: {
      requestRef: `INT-${sufijo}-A`,
      userId: user.id, origin: 'PAMPLONA', destination: 'CUCUTA',
      offeredFare: 40000, status: 'SEARCHING', seats: 'ONE',
      departureTime: new Date(Date.now() + 3600_000),
      createdAt: HACE_DOS_HORAS(),
    },
  });

  await rescatarDespacho();
  await esperar(1200);
  const tras1 = avisosDe(reserva.id === '' ? 'nunca' : user.id);
  comprobar('el primer barrido SÍ avisa', tras1 >= 1, `avisos: ${tras1}`);

  const marcada = await prisma.intercityBooking.findUnique({
    where: { id: reserva.id }, select: { noDriverNotifiedAt: true, status: true },
  });
  comprobar('y deja constancia de que avisó', marcada?.noDriverNotifiedAt != null,
    'noDriverNotifiedAt quedó en null: el barrido volvería a avisar');
  comprobar('sin cerrar la reserva (el pasajero decide si insiste)',
    marcada?.status === 'SEARCHING', `${marcada?.status}`);

  // Dos barridos más: en producción eso son diez minutos.
  const antes = avisosDe(user.id);
  await rescatarDespacho();
  await esperar(800);
  await rescatarDespacho();
  await esperar(800);
  comprobar('los barridos siguientes NO repiten el aviso',
    avisosDe(user.id) === antes,
    `se repitió ${avisosDe(user.id) - antes} vez/veces — es el defecto de producción`);

  // ── 2. Mandado ─────────────────────────────────────────────────────────────
  logOriginal('\n2. Mandado viejo y sin conductor');
  const mandado = await prisma.errand.create({
    data: {
      requestRef: `MAN-${sufijo}`, userId: user.id, category: 'PHARMACY',
      description: 'Acetaminofén', pickupAddress: 'Droguería', dropoffAddress: 'Casa',
      status: 'SEARCHING', createdAt: HACE_DOS_HORAS(),
    },
  });
  const antesMandado = avisosDe(user.id);
  await rescatarDespacho();
  await esperar(1200);
  comprobar('avisa una vez', avisosDe(user.id) > antesMandado, 'no avisó');
  const marcadoM = await prisma.errand.findUnique({
    where: { id: mandado.id }, select: { noDriverNotifiedAt: true },
  });
  comprobar('y deja constancia', marcadoM?.noDriverNotifiedAt != null, 'sin marca');

  const trasMandado = avisosDe(user.id);
  await rescatarDespacho();
  await esperar(800);
  comprobar('y no lo repite', avisosDe(user.id) === trasMandado,
    `repitió ${avisosDe(user.id) - trasMandado}`);

  // ── 3. Pedido: el aviso repetido llegaba también a la COCINA ───────────────
  logOriginal('\n3. Pedido viejo sin repartidor');
  const negocio = await prisma.business.create({
    data: { name: `Prueba ${sufijo}`, category: 'RESTAURANT', address: 'Calle 5' },
  });
  const pedido = await prisma.order.create({
    data: {
      orderRef: `PED-${sufijo}`, userId: user.id, businessId: negocio.id,
      status: 'PREPARING', deliveryAddress: 'Casa', createdAt: HACE_DOS_HORAS(),
      subtotal: 20000, total: 24000, deliveryFee: 4000,
    },
  });
  let campanasAlNegocio = 0;
  const { registerNotifyBusinessNoDriver } = await import('../src/services/matching.service');
  registerNotifyBusinessNoDriver((businessId) => {
    if (businessId === negocio.id) campanasAlNegocio++;
  });

  await rescatarDespacho();
  await esperar(1200);
  comprobar('la cocina recibe el aviso una vez', campanasAlNegocio === 1,
    `campanas: ${campanasAlNegocio}`);
  const marcadoP = await prisma.order.findUnique({
    where: { id: pedido.id }, select: { noDriverNotifiedAt: true, status: true },
  });
  comprobar('y deja constancia', marcadoP?.noDriverNotifiedAt != null, 'sin marca');
  comprobar('sin cerrar el pedido (el negocio decide)',
    marcadoP?.status === 'PREPARING', `${marcadoP?.status}`);

  await rescatarDespacho();
  await esperar(800);
  await rescatarDespacho();
  await esperar(800);
  comprobar('y no vuelve a sonar la campana', campanasAlNegocio === 1,
    `sonó ${campanasAlNegocio} veces — una campana en la cocina cada 5 minutos`);

  // ── 4. Contraprueba: la marca no silencia a quien NO ha sido avisado ───────
  logOriginal('\n4. Contraprueba: una reserva nueva sí recibe SU aviso');
  const otra = await prisma.intercityBooking.create({
    data: {
      requestRef: `INT-${sufijo}-B`,
      userId: user.id, origin: 'PAMPLONA', destination: 'BUCARAMANGA',
      offeredFare: 60000, status: 'SEARCHING', seats: 'ONE',
      departureTime: new Date(Date.now() + 3600_000),
      createdAt: HACE_DOS_HORAS(),
    },
  });
  const antesOtra = avisosDe(user.id);
  await rescatarDespacho();
  await esperar(1200);
  comprobar('avisa de la reserva nueva', avisosDe(user.id) > antesOtra,
    'la marca de la primera silenció a la segunda: sería peor que el defecto');
  const marcadaOtra = await prisma.intercityBooking.findUnique({
    where: { id: otra.id }, select: { noDriverNotifiedAt: true },
  });
  comprobar('con su propia constancia', marcadaOtra?.noDriverNotifiedAt != null, 'sin marca');

  // ── Limpieza ───────────────────────────────────────────────────────────────
  await prisma.order.deleteMany({ where: { businessId: negocio.id } });
  await prisma.business.delete({ where: { id: negocio.id } });
  await prisma.errand.deleteMany({ where: { userId: user.id } });
  await prisma.intercityBooking.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });

  logOriginal(`\n${fallos === 0 ? '✓ TODO EN VERDE' : `✗ ${fallos} FALLIDAS`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  logOriginal('ERROR:', e);
  await prisma.$disconnect();
  process.exit(1);
});
