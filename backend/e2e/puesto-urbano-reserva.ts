/**
 * «Los viajes por puestos en taxi se están pasando por intermunicipal».
 *
 * El puesto URBANO y la salida intermunicipal viven en la misma tabla
 * (`PooledTrip`, distinguidos por `kind`) y la app reserva los dos por la MISMA
 * ruta: `POST /client/intercity/pool/:id/book`. El corte del intermunicipal
 * aplazado cerraba esa ruta entera, así que reservar un puesto de taxi dentro
 * de Pamplona respondía «El servicio intermunicipal abre pronto…».
 *
 * Por HTTP y no llamando a `bookSeats`: el defecto vivía en el manejador, y
 * las pruebas del servicio pasaban en verde con él dentro.
 *
 *   1. Un pasajero publica su viaje por puestos y otro reserva → 201.
 *   2. Lleno (4 de 4) y sin taxista: sigue en el tablero del conductor y lo
 *      puede tomar. Antes del arreglo nadie podía sumarse, así que un viaje
 *      nunca se llenaba; al poder sumarse, el último puesto lo pasaba a FULL y
 *      desaparecía justo del tablero donde el taxista lo tenía que ver.
 *   3. Contraprueba: una salida INTERMUNICIPAL sigue cerrada → 422 con el aviso.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/puesto-urbano-reserva.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3118);
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
  // Un servidor huérfano en el puerto haría que la prueba midiera el código
  // VIEJO y diera verde sobre un defecto que sigue ahí.
  try {
    const ocupado = await fetch(`${BASE}/health`);
    if (ocupado.ok) {
      throw new Error(
        `el puerto ${PUERTO} ya está ocupado. Mátalo (fuser -k ${PUERTO}/tcp).`,
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
      INTERMUNICIPAL_ABIERTO: '',
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
  const usuarios: string[] = [];
  const viajes: string[] = [];
  const conductores: string[] = [];
  try {
    await prisma.municipality.upsert({
      where: { slug: 'pamplona' },
      update: { isActive: true },
      create: {
        slug: 'pamplona', name: 'Pamplona',
        department: 'Norte de Santander', lat: 7.3754, lng: -72.6486,
      },
    });
    const sufijo = String(Date.now()).slice(-6);
    const telA = `+57301${sufijo}1`;
    const telB = `+57301${sufijo}2`;
    const tokenA = await entrarComoCliente(telA);
    const tokenB = await entrarComoCliente(telB);
    usuarios.push(
      ...(await prisma.user.findMany({ where: { phone: { in: [telA, telB] } }, select: { id: true } }))
        .map((u) => u.id),
    );

    console.log('\n[1] Un pasajero publica su viaje por puestos y otro lo reserva');
    const sale = new Date(Date.now() + 40 * 60_000).toISOString();
    const pub = await pedir('POST', '/client/pool/urbano/publish', {
      token: tokenA,
      body: {
        city: 'pamplona', originLabel: 'Cl. 10 #4a2', destLabel: 'Cra. 1 # 1-96',
        originLat: 7.3754, originLng: -72.6486, destLat: 7.3725, destLng: -72.6481,
        departureTime: sale, totalSeats: 4, seatsForMe: 1,
      },
    });
    const urbano = pub.json.data as { id?: string } | undefined;
    check(pub.status === 201 && !!urbano?.id, 'se publica el viaje por puestos', pub.json);
    if (urbano?.id) viajes.push(urbano.id);

    const reserva = await pedir('POST', `/client/intercity/pool/${urbano?.id}/book`, {
      token: tokenB,
      body: { seatsBooked: 3, pickupAddress: 'Parque principal' },
    });
    check(reserva.status === 201, 'la reserva del puesto URBANO entra (201)', reserva);
    check(
      !/intermunicipal/i.test(reserva.json.error ?? ''),
      'y no responde el aviso del intermunicipal',
      reserva.json.error,
    );

    console.log('\n[2] Lleno y sin taxista: sigue en el tablero y se puede tomar');
    const lleno = await prisma.pooledTrip.findUnique({ where: { id: urbano!.id! } });
    check(lleno?.status === 'FULL', 'con los 4 puestos ocupados queda lleno', lleno?.status);
    const { listarPuestosSinConductor, tomarPuestoDePasajero } =
      await import('../src/services/intercity-pool.service');
    const tablero = await listarPuestosSinConductor('pamplona');
    check(tablero.some((t) => t.id === urbano!.id), 'el taxista lo ve en su tablero', tablero.map((t) => t.id));
    const taxista = await prisma.driver.create({
      data: {
        name: 'Taxista E2E', phone: `+57302${sufijo}9`, documentType: 'CC',
        documentNumber: `77${sufijo}`, isVerified: true, status: 'ONLINE',
        vehicles: { create: { type: 'TAXI', brand: 'Hyundai', model: 'Atos', color: 'Amarillo', plate: `T${sufijo}`, year: 2020, isActive: true } },
      },
    });
    conductores.push(taxista.id);
    let tomado = false;
    try {
      const t = await tomarPuestoDePasajero(taxista.id, urbano!.id!);
      tomado = !t.sinConductor;
    } catch (e) { check(false, 'tomar no lanza', (e as Error).message); }
    check(tomado, 'y lo puede tomar');

    console.log('\n[3] Contraprueba: una salida INTERMUNICIPAL sigue cerrada');
    const inter = await prisma.pooledTrip.create({
      data: {
        tripRef: `E2E-INT-${sufijo}`, kind: 'INTERCITY',
        origin: 'pamplona', destination: 'cucuta',
        departureTime: new Date(Date.now() + 3 * 3600_000),
        totalSeats: 4, farePerSeat: 30000, maxFarePerSeat: 40000,
      },
    });
    viajes.push(inter.id);
    const r2 = await pedir('POST', `/client/intercity/pool/${inter.id}/book`, {
      token: tokenB,
      body: { seatsBooked: 1 },
    });
    check(r2.status === 422, 'la reserva intermunicipal se rechaza (422)', r2);
    check(/abre pronto/i.test(r2.json.error ?? ''), 'con el aviso del intermunicipal', r2.json.error);

    console.log(`\n${ok} comprobaciones bien, ${fallos} mal`);
    if (fallos > 0) {
      console.error('\nREGISTROS DEL SERVIDOR:');
      console.error((servidor as ChildProcess & { registros: string[] }).registros.join(''));
    }
    process.exitCode = fallos > 0 ? 1 : 0;
  } finally {
    try {
      await prisma.seatBooking.deleteMany({ where: { tripId: { in: viajes } } });
      await prisma.pooledTrip.deleteMany({ where: { id: { in: viajes } } });
      await prisma.vehicle.deleteMany({ where: { driverId: { in: conductores } } });
      await prisma.driver.deleteMany({ where: { id: { in: conductores } } });
    } catch (e) { console.error('(no se pudo limpiar del todo)', e); }
    await prisma.$disconnect();
    if (servidor.pid) { try { process.kill(-servidor.pid, 'SIGKILL'); } catch { /* ya murió */ } }
  }
}

void main();
