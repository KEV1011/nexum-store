/**
 * Comprar un pasaje POR HTTP: silla, punto de embarque y cupón.
 *
 * POR QUÉ CONTRA LAS RUTAS Y NO CONTRA EL SERVICIO
 * ------------------------------------------------
 * Porque el servicio estaba bien y la ruta no. `POST /client/intercity/pool/
 * :id/book` recibía `seats` de la app y NO se lo pasaba a `bookSeats`: se
 * quedaba con `seatsBooked`, `pickupAddress` y `notes`. En una salida numerada
 * eso hacía que el servidor respondiera «Elige al menos una silla» a alguien
 * que acababa de elegirla, así que el mapa de asientos —toda una tanda de
 * trabajo— era inalcanzable desde la app. Los tests unitarios y el E2E de
 * sillas llamaban a `bookSeats` directamente y por eso no lo vieron.
 *
 * Regla del repo que esto vuelve a demostrar: para saber si una ruta funciona
 * hay que GOLPEARLA.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/embarque-y-cupon.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3111);
const BASE = `http://localhost:${PUERTO}`;
const OTP = '424242';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

type Res = { status: number; json: { success?: boolean; data?: unknown; error?: string } };
async function pedir(
  metodo: string, ruta: string, opts: { token?: string; body?: unknown } = {},
): Promise<Res> {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: Res['json'] = {};
  try { json = (await r.json()) as Res['json']; } catch { /* no JSON */ }
  return { status: r.status, json };
}

async function arrancarServidor(): Promise<ChildProcess> {
  try {
    const ocupado = await fetch(`${BASE}/health`);
    if (ocupado.ok) {
      throw new Error(
        `el puerto ${PUERTO} ya está ocupado. Mátalo (fuser -k ${PUERTO}/tcp) o ` +
          'la prueba mediría el servidor equivocado.',
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('ya está ocupado')) throw e;
  }

  const hijo = spawn('npx', ['tsx', 'src/index.ts'], {
    detached: true,
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PUERTO),
      NODE_ENV: 'development',
      // En desarrollo el código lo pone OTP_DEV_CODE, no OTP_FALLBACK_CODE
      // (ese es el de producción). Se definen los dos para no depender de en
      // qué modo arranque el servidor.
      OTP_DEV_CODE: OTP,
      OTP_FALLBACK_CODE: OTP,
      JWT_SECRET: process.env['JWT_SECRET'] ?? 'e2e-secreto-largo-para-firmar-0123456789',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const registros: string[] = [];
  hijo.stdout?.on('data', (b: Buffer) => registros.push(b.toString()));
  hijo.stderr?.on('data', (b: Buffer) => registros.push(b.toString()));
  (hijo as ChildProcess & { registros: string[] }).registros = registros;

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return hijo;
    } catch { /* todavía no */ }
  }
  console.error(registros.join(''));
  throw new Error('el servidor no arrancó');
}

async function entrarComoCliente(telefono: string): Promise<string> {
  await pedir('POST', '/client/auth/send-otp', { body: { phone: telefono } });
  const r = await pedir('POST', '/client/auth/verify-otp', {
    body: { phone: telefono, otp: OTP, name: 'Pasajera E2E' },
  });
  const data = r.json.data as { token?: string } | undefined;
  if (!data?.token) throw new Error(`no se pudo entrar: ${JSON.stringify(r.json)}`);
  return data.token;
}

async function main() {
  const servidor = await arrancarServidor();
  const sufijo = Math.floor(10000 + Math.random() * 89999);
  const telefono = `+5730055${sufijo}`;

  const op = await prisma.operator.create({
    data: {
      legalName: 'Cootrans Embarque E2E', nit: `NIT-${Date.now()}`,
      type: 'INTERCITY', status: 'ACTIVE', isVerified: true, city: 'pamplona',
    },
  });
  const driver = await prisma.driver.create({
    data: {
      name: 'Conductor Bus', phone: `+5730066${sufijo}`,
      isVerified: true, status: 'ONLINE', operatorId: op.id,
    },
  });

  // Salida numerada de mañana, con dos puntos de embarque.
  const salida = new Date(Date.now() + 24 * 3600 * 1000);
  salida.setHours(6, 0, 0, 0);
  const { publishPooledTrip } = await import('../src/services/intercity-pool.service');
  const trip = await publishPooledTrip(
    driver.id, driver.name, driver.phone,
    {
      origin: 'pamplona', destination: 'cucuta',
      departureTime: salida.toISOString(),
      totalSeats: 1, farePerSeat: 40000,
      vehicleDescription: 'Bus Marcopolo',
      seatType: 'BUSETA',
      seatConfig: { izquierda: 2, derecha: 1, filas: 6, fondoCorrido: 4 },
      boardingPoints: [
        { name: 'Parque Águeda', time: '06:15', address: 'Calle 5 # 3-40' },
        { name: 'Terminal de Transportes', time: '06:00' },
      ],
    },
    { operatorId: op.id, licensedOperator: true },
  );

  const token = await entrarComoCliente(telefono);

  // ── 1. Los puntos llegan al pasajero, ordenados ─────────────────────────
  console.log('\n[1] Puntos de embarque en la búsqueda');
  const busqueda = await pedir('GET', '/client/intercity/pool/search?origin=pamplona&destination=cucuta', { token });
  const lista = (busqueda.json.data as Array<{ id: string; boardingPoints?: Array<{ name: string; time: string }> }>) ?? [];
  const mia = lista.find((t) => t.id === trip.id);
  check(mia != null, 'la salida aparece en la búsqueda', busqueda.status);
  check(mia?.boardingPoints?.length === 2, 'con sus dos puntos', mia?.boardingPoints);
  check(mia?.boardingPoints?.[0]?.name === 'Terminal de Transportes',
    'y el primero es el más temprano, no el que se escribió primero',
    mia?.boardingPoints?.map((p) => p.name));

  // ── 2. Comprar una silla POR HTTP ───────────────────────────────────────
  console.log('\n[2] Comprar la silla 4 desde la app');
  const puntoParque = mia!.boardingPoints!.find((p) => p.name === 'Parque Águeda') as
    { id?: string } | undefined;
  const compra = await pedir('POST', `/client/intercity/pool/${trip.id}/book`, {
    token,
    body: {
      seatsBooked: 1,
      seats: [4],
      boardingPointId: (puntoParque as { id?: string })?.id,
    },
  });
  check(compra.status === 201, 'la compra se acepta', compra.json.error ?? compra.status);

  const reserva = await prisma.seatBooking.findFirst({
    where: { tripId: trip.id }, include: { seats: true },
  });
  check(reserva?.seats.length === 1 && reserva?.seats[0]?.seatNumber === 4,
    'y la silla que queda tomada es la 4 — antes la ruta descartaba `seats`',
    reserva?.seats.map((s) => s.seatNumber));

  const punto = reserva?.boardingPoint as { name?: string; time?: string } | null;
  check(punto?.name === 'Parque Águeda' && punto?.time === '06:15',
    'el punto queda SELLADO en la reserva, con su hora', punto);
  check(reserva?.fareTotal === 40000,
    'y el precio también: subir la tarifa mañana no le cambia el suyo',
    reserva?.fareTotal);

  // ── 3. Cupones: quién paga el descuento ─────────────────────────────────
  console.log('\n[3] Cupones de pasaje');
  const dePlataforma = await prisma.promoCode.create({
    data: {
      code: `ZIPA${sufijo}`, type: 'PERCENT', value: 10,
      scope: 'INTERCITY', createdBy: 'admin', perUserLimit: 5,
    },
  });
  const r1 = await pedir('POST', `/client/intercity/pool/${trip.id}/promo`, {
    token, body: { code: dePlataforma.code, seats: 1 },
  });
  check(/directamente a la empresa/i.test(r1.json.error ?? ''),
    'el cupón de la PLATAFORMA se rechaza: ese dinero no pasa por nosotros',
    r1.json.error);

  const { operatorCreatePromo } = await import('../src/services/promo.service');
  const suyo = await operatorCreatePromo(op.id, {
    code: `COOTRANS${sufijo}`, type: 'PERCENT', value: 20, perUserLimit: 5,
  });
  check(suyo.scope === 'INTERCITY' && suyo.operatorId === op.id,
    'el de la empresa nace con su dueño puesto', { scope: suyo.scope, op: suyo.operatorId });

  const r2 = await pedir('POST', `/client/intercity/pool/${trip.id}/promo`, {
    token, body: { code: suyo.code, seats: 1 },
  });
  const cotiza = r2.json.data as { discount?: number; amountToPay?: number } | undefined;
  check(cotiza?.discount === 8000 && cotiza?.amountToPay === 32000,
    'el suyo cotiza el 20 % de 40.000', cotiza);

  // El de otra empresa no vale aquí.
  const otra = await prisma.operator.create({
    data: {
      legalName: 'Otra Empresa E2E', nit: `NIT2-${Date.now()}`,
      type: 'INTERCITY', status: 'ACTIVE', isVerified: true,
    },
  });
  const ajeno = await operatorCreatePromo(otra.id, {
    code: `OTRA${sufijo}`, type: 'FIXED', value: 5000,
  });
  const r3 = await pedir('POST', `/client/intercity/pool/${trip.id}/promo`, {
    token, body: { code: ajeno.code, seats: 1 },
  });
  check(/otra empresa/i.test(r3.json.error ?? ''),
    'el de otra empresa se rechaza diciendo por qué', r3.json.error);

  // ── 4. Comprar CON cupón, y que quede sellado ───────────────────────────
  console.log('\n[4] Segunda compra, con el código de la empresa');
  const otroTel = `+5730077${sufijo}`;
  const token2 = await entrarComoCliente(otroTel);
  const compra2 = await pedir('POST', `/client/intercity/pool/${trip.id}/book`, {
    token: token2,
    body: { seatsBooked: 1, seats: [5], promoCode: suyo.code },
  });
  check(compra2.status === 201, 'se acepta', compra2.json.error ?? compra2.status);

  const u2 = await prisma.user.findFirst({ where: { phone: otroTel } });
  const reserva2 = await prisma.seatBooking.findFirst({
    where: { tripId: trip.id, userId: u2?.id },
  });
  check(reserva2?.discount === 8000 && reserva2?.promoCode === suyo.code,
    'el descuento y el código quedan sellados en la reserva',
    { d: reserva2?.discount, c: reserva2?.promoCode });

  const canjes = await prisma.promoRedemption.count({ where: { promoCodeId: suyo.id } });
  check(canjes === 1, 'y se registra UN canje, para poder auditarlo', canjes);

  // Sin punto elegido cae al primero: las apps instaladas no lo mandan.
  const punto2 = reserva2?.boardingPoint as { name?: string } | null;
  check(punto2?.name === 'Terminal de Transportes',
    'sin elegir punto se sella la terminal, que es donde sube casi todo el mundo',
    punto2);

  // ── 5. Lo que el pasajero ve en sus reservas ────────────────────────────
  console.log('\n[5] Mis reservas');
  const mis = await pedir('GET', '/client/intercity/pool/bookings', { token: token2 });
  const fila = ((mis.json.data as Array<{ myBooking?: Record<string, unknown> }>) ?? [])[0];
  check(fila?.myBooking?.['amountToPay'] === 32000,
    'con lo que de verdad tiene que pagar, ya descontado',
    fila?.myBooking?.['amountToPay']);
  check((fila?.myBooking?.['boardingPoint'] as { time?: string })?.time === '06:00',
    'y a qué hora lo recogen', fila?.myBooking?.['boardingPoint']);

  // ── Limpieza ────────────────────────────────────────────────────────────
  const users = await prisma.user.findMany({ where: { phone: { in: [telefono, otroTel] } } });
  await prisma.promoRedemption.deleteMany({
    where: { promoCodeId: { in: [suyo.id, ajeno.id, dePlataforma.id] } },
  });
  await prisma.promoCode.deleteMany({
    where: { id: { in: [suyo.id, ajeno.id, dePlataforma.id] } },
  });
  await prisma.seatAssignment.deleteMany({ where: { tripId: trip.id } });
  await prisma.seatBooking.deleteMany({ where: { tripId: trip.id } });
  await prisma.pooledTrip.deleteMany({ where: { operatorId: op.id } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.driver.delete({ where: { id: driver.id } });
  await prisma.operator.deleteMany({ where: { id: { in: [op.id, otra.id] } } });

  if (fallos > 0) {
    console.log('\n── registros del servidor ──');
    console.log((servidor as ChildProcess & { registros: string[] }).registros.join('').slice(-2500));
  }
  try {
    if (servidor.pid) process.kill(-servidor.pid, 'SIGKILL');
  } catch { servidor.kill('SIGKILL'); }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Comprobaciones: ${ok} en verde, ${fallos} en rojo`);
  await prisma.$disconnect();
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('\nERROR:', e);
  await prisma.$disconnect();
  process.exit(2);
});
