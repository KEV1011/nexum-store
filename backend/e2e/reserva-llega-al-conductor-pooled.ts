/**
 * Cuando alguien aparta un puesto en una van o un bus, ¿le llega al conductor?
 *
 * Reportado desde producción: «cuando se aparta una van o bus de
 * intermunicipal no le sale al conductor asignado». Esto va por las rutas
 * REALES —la empresa publica, el pasajero compra, el conductor consulta—
 * para separar las tres cosas que se confunden:
 *
 *   1. ¿El dato LLEGA a la consulta del conductor? (si no, es un bug de
 *      backend y es lo más grave)
 *   2. ¿Le llega un AVISO, o tiene que acordarse de mirar?
 *   3. ¿Dónde tiene que mirar, y es el sitio donde lo buscaría?
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/reserva-llega-al-conductor-pooled.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3141);
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
  try { json = (await r.json()) as Res['json']; } catch { /* sin JSON */ }
  return { status: r.status, json };
}

async function arrancarServidor(): Promise<ChildProcess> {
  try {
    const o = await fetch(`${BASE}/health`);
    if (o.ok) throw new Error(`el puerto ${PUERTO} ya está ocupado (fuser -k ${PUERTO}/tcp).`);
  } catch (e) {
    if (e instanceof Error && e.message.includes('ya está ocupado')) throw e;
  }
  const hijo = spawn('npx', ['tsx', 'src/index.ts'], {
    detached: true,
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PUERTO), NODE_ENV: 'development',
      OTP_DEV_CODE: OTP, OTP_FALLBACK_CODE: OTP,
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
    try { if ((await fetch(`${BASE}/health`)).ok) return hijo; } catch { /* aún no */ }
  }
  console.error(registros.join(''));
  throw new Error('el servidor no arrancó');
}

function matar(s: ChildProcess) {
  try { if (s.pid) process.kill(-s.pid, 'SIGKILL'); } catch { s.kill('SIGKILL'); }
}

const suf = Math.floor(10000 + Math.random() * 89999);

async function main() {
  const servidor = await arrancarServidor();
  const marca = `e2epool-${Date.now()}`;
  const telEmp = `+5730111${suf}`;
  const telCond = `+5730112${suf}`;
  const telPax = `+5730113${suf}`;

  try {
    const empresa = await prisma.operator.create({
      data: {
        legalName: `${marca} Intermunicipal`, nit: `902${suf}`, type: 'INTERCITY',
        status: 'ACTIVE', isVerified: true, contactPhone: telEmp,
        members: { create: { phone: telEmp, role: 'OWNER', name: 'Dueña' } },
      },
    });
    const conductor = await prisma.driver.create({
      data: {
        name: 'Conductor Van', phone: telCond, isVerified: true,
        operatorId: empresa.id, citySlug: 'pamplona', intercityEnabled: true,
        // Sin token el push se descarta ANTES de enviarse y el registro solo
        // diría «sin token registrado»: la prueba pasaría sin probar nada.
        fcmToken: `fake-token-${suf}`,
        vehicles: {
          create: {
            type: 'PARTICULAR', brand: 'Renault', model: 'Master',
            plate: `VAN${suf}`, year: 2022, color: 'Blanca', isActive: true,
          },
        },
      },
    });

    // Entrar por las rutas reales.
    await pedir('POST', '/operator/auth/send-otp', { body: { phone: telEmp } });
    const le = await pedir('POST', '/operator/auth/verify-otp', { body: { phone: telEmp, otp: OTP } });
    const tEmp = (le.json.data as { token?: string }).token!;
    await pedir('POST', '/auth/send-otp', { body: { phone: telCond } });
    const lc = await pedir('POST', '/auth/verify-otp', { body: { phone: telCond, otp: OTP } });
    const tCond = (lc.json.data as { token?: string }).token!;
    await pedir('POST', '/client/auth/send-otp', { body: { phone: telPax } });
    const lp = await pedir('POST', '/client/auth/verify-otp', {
      body: { phone: telPax, otp: OTP, name: 'Pasajera Van' },
    });
    const tPax = (lp.json.data as { token?: string }).token!;

    // ── 1. La empresa publica la salida y le asigna el conductor ──────────
    console.log('\n[1] La empresa publica la salida');
    const manana = new Date(Date.now() + 30 * 3600 * 1000);
    const pub = await pedir('POST', '/operator/pool/publish', {
      token: tEmp,
      body: {
        driverId: conductor.id,
        origin: 'pamplona', destination: 'cucuta',
        departureTime: manana.toISOString(),
        // Con silla numerada los puestos los pone el PLANO del vehículo, no
        // el formulario: el tope de 7 es del viaje compartido entre
        // particulares y no aplica a una van de empresa.
        seatType: 'VAN',
        farePerSeat: 25000,
        vehicleDescription: 'Renault Master Blanca',
      },
    });
    const salida = pub.json.data as { id?: string; availableSeats?: number } | undefined;
    check(pub.status === 200 || pub.status === 201,
      'la salida se publica', { status: pub.status, err: pub.json.error });
    const salidaId = salida?.id ?? '';

    const enBD = await prisma.pooledTrip.findUnique({ where: { id: salidaId } });
    check(enBD?.driverId === conductor.id,
      'y queda sellada al conductor que la empresa asignó', enBD?.driverId);

    // ── 2. El conductor la ve ANTES de que nadie compre ───────────────────
    console.log('\n[2] El conductor consulta sus salidas');
    type Vista = { id: string; bookings?: unknown[]; seatsBooked?: number; availableSeats?: number };
    const antes = await pedir('GET', '/driver/intercity/pool/mine', { token: tCond });
    const lista0 = (antes.json.data as Vista[] | undefined) ?? [];
    check(antes.status === 200, 'la consulta responde', { status: antes.status });
    check(lista0.some((t) => t.id === salidaId),
      'y SU salida aparece en la lista', lista0.map((t) => t.id));

    // ── 3. Un pasajero aparta un puesto ───────────────────────────────────
    console.log('\n[3] El pasajero aparta un puesto');
    const compra = await pedir('POST', `/client/intercity/pool/${salidaId}/book`, {
      token: tPax,
      body: { seats: [6, 7], seatsBooked: 2, pickupAddress: 'Parque Águeda Gallardo' },
    });
    check(compra.status === 200 || compra.status === 201,
      'la reserva se crea', { status: compra.status, err: compra.json.error });
    const reservas = await prisma.seatBooking.count({ where: { tripId: salidaId } });
    check(reservas === 1, 'y queda en la base', reservas);

    // ── 4. LA PREGUNTA: ¿le llega al conductor? ───────────────────────────
    console.log('\n[4] ¿Le sale al conductor?');
    const despues = await pedir('GET', '/driver/intercity/pool/mine', { token: tCond });
    const mia = ((despues.json.data as Vista[] | undefined) ?? [])
      .find((t) => t.id === salidaId);
    check(!!mia, 'su salida sigue en la lista');
    check((mia?.bookings?.length ?? 0) === 1,
      'CON la reserva del pasajero dentro', mia?.bookings?.length);
    // `seatsBooked` vive en la RESERVA, no en la salida: la salida solo
    // expone cuántos quedan libres.
    const primera = (mia?.bookings?.[0] ?? {}) as Record<string, unknown>;
    check(primera['seatsBooked'] === 2,
      'con los dos puestos que compró', primera['seatsBooked']);
    check((mia?.availableSeats ?? 0) > 0 && (mia?.availableSeats ?? 0) < 14,
      'y los libres descontados', mia?.availableSeats);

    const manifiesto = primera;
    check(typeof manifiesto['passengerName'] === 'string' && !!manifiesto['passengerName'],
      'con el nombre de quien viaja', manifiesto['passengerName']);
    check(manifiesto['pickupAddress'] === 'Parque Águeda Gallardo',
      'y dónde recogerlo', manifiesto['pickupAddress']);

    // ── 5. Y EL AVISO ─────────────────────────────────────────────────────
    //
    // Esta es LA comprobación de la tanda. El dato siempre estuvo en la
    // consulta del conductor; lo que no había era forma de enterarse. Sin
    // aviso, un pasajero esperando en una esquina a las cinco de la mañana
    // depende de que al conductor se le ocurra abrir una pantalla.
    //
    // En desarrollo el push es un mock que escribe en el registro del
    // servidor, así que se mide ahí: es el único sitio donde se puede ver
    // sin Firebase.
    console.log('\n[5] El aviso al conductor');
    await new Promise((r) => setTimeout(r, 600));
    const regs = ((servidor as ChildProcess & { registros?: string[] }).registros ?? []).join('');
    // El mock escribe `[Push:mock] driver=<id> type=<tipo> — "<título>"`.
    // Se exige la línea ENTERA: el id del conductor suelto aparece por todo
    // el registro —lo escribe cada petición— y buscarlo a secas daba un
    // verde que no probaba nada.
    const linea = regs.split('\n').find((l) =>
      l.includes('[Push:mock]') && l.includes(`driver=${conductor.id}`));
    check(!!linea, 'sale un push dirigido a ESE conductor', linea);
    check((linea ?? '').includes('type=pooled_booking'),
      'con el tipo que su app sabe enrutar hasta el manifiesto', linea);
    check((linea ?? '').includes('Nuevo pasajero'),
      'y un texto que se entiende sin abrir nada', linea);
    // El acumulado va en el CUERPO y el mock solo registra el título, así
    // que no se puede ver aquí: lo vigila `aviso-reserva-puesto.test`.

    await prisma.seatBooking.deleteMany({ where: { tripId: salidaId } });
    await prisma.pooledTrip.deleteMany({ where: { id: salidaId } });
    await prisma.vehicle.deleteMany({ where: { driverId: conductor.id } });
    await prisma.driver.delete({ where: { id: conductor.id } });
    await prisma.user.deleteMany({ where: { phone: telPax } });
    await prisma.operatorMember.deleteMany({ where: { operatorId: empresa.id } });
    await prisma.operator.delete({ where: { id: empresa.id } });
  } finally {
    if (fallos > 0) {
      const regs = (servidor as ChildProcess & { registros?: string[] }).registros ?? [];
      console.log('\n── Registros ──\n' + regs.join('').slice(-3000));
    }
    matar(servidor);
  }

  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} comprobaciones OK, ${fallos} fallos`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
