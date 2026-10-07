/**
 * El intermunicipal está cerrado, ¿y qué más se cerró con él?
 *
 * El bloqueo del intermunicipal tiene UN riesgo grande y uno pequeño. El
 * pequeño es que no cierre (una app vieja seguiría creando reservas que nadie
 * despacha). El GRANDE es que cierre de más: si de paso se lleva la movilidad
 * urbana o el seguimiento de una reserva ya en curso, se habría apagado justo
 * el servicio en el que está el foco, y por el camino se le quitaría la
 * información a alguien que tiene un viaje de verdad.
 *
 * Así que esto se mide por las RUTAS, con el servidor arrancado SIN la
 * variable —o sea en el estado por defecto, que es cerrado— y comprobando las
 * dos mitades.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/intermunicipal-aplazado.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';
import { INTERMUNICIPAL_APLAZADO } from '../src/lib/intermunicipal-abierto';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3146);
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
  const env = { ...process.env };
  // SIN la variable: así se mide el estado por defecto, que es el que va a
  // correr en producción. Ponerla aquí sería probar otra cosa.
  delete env['INTERMUNICIPAL_ABIERTO'];
  const hijo = spawn('npx', ['tsx', 'src/index.ts'], {
    detached: true,
    cwd: process.cwd(),
    env: {
      ...env,
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

const suf = () => Math.floor(10000 + Math.random() * 89999);

async function main() {
  const servidor = await arrancarServidor();
  const marca = `e2eapl-${Date.now()}`;
  const telPax = `+5730210${suf()}`;
  const creados: string[] = [];

  try {
    console.log('\n[0] /health lo declara');
    const salud = await pedir('GET', '/health');
    const d = salud.json as unknown as Record<string, unknown>;
    check(d['intermunicipal'] === 'aplazado',
      'el diagnóstico dice «aplazado», no se queda callado', d['intermunicipal']);

    await pedir('POST', '/client/auth/send-otp', { body: { phone: telPax } });
    const lp = await pedir('POST', '/client/auth/verify-otp', {
      body: { phone: telPax, otp: OTP, name: `${marca} Pasajera`, acceptedTerms: true },
    });
    const tPax = (lp.json.data as { token?: string }).token!;
    check(!!tPax, 'el pasajero entra: el bloqueo no toca el acceso a la app');

    console.log('\n[1] Pedir intermunicipal se RECHAZA, y dice por qué');
    {
      const r = await pedir('POST', '/client/intercity/request', {
        token: tPax,
        body: {
          origin: 'pamplona', destination: 'cucuta',
          departureTime: new Date(Date.now() + 7200_000).toISOString(),
          seats: 2, offeredFare: 40000,
        },
      });
      check(r.status === 422, 'la ruta responde 422', r.status);
      check(r.json.error === INTERMUNICIPAL_APLAZADO,
        'con el motivo exacto, no un «no disponible» que se lee como fallo',
        r.json.error);
      const creadas = await prisma.intercityBooking.count({
        where: { user: { phone: telPax } },
      });
      check(creadas === 0, 'y NO queda nada en la base esperando a nadie', creadas);
    }

    console.log('\n[2] Comprar un puesto en una salida intermunicipal, también');
    {
      // Se siembra una salida intermunicipal directamente: lo que se prueba es
      // que la COMPRA esté cerrada, no cómo se publicó.
      const conductor = await prisma.driver.create({
        data: {
          name: `${marca} Cond`, phone: `+5730211${suf()}`,
          isVerified: true, citySlug: 'pamplona',
        },
      });
      const salida = await prisma.pooledTrip.create({
        data: {
          tripRef: `APL-${suf()}`, kind: 'INTERCITY', driverId: conductor.id,
          driverName: conductor.name, driverPhone: conductor.phone,
          origin: 'pamplona', destination: 'cucuta',
          departureTime: new Date(Date.now() + 86400_000),
          totalSeats: 4, farePerSeat: 25000, maxFarePerSeat: 30000,
          allowFleet: false, status: 'OPEN', vehicleDescription: 'Van blanca',
        },
      });
      const r = await pedir('POST', `/client/intercity/pool/${salida.id}/book`, {
        token: tPax, body: { seatsBooked: 1 },
      });
      check(r.status === 422, 'la compra responde 422', r.status);
      check(r.json.error === INTERMUNICIPAL_APLAZADO, 'con el mismo motivo', r.json.error);
      const reservas = await prisma.seatBooking.count({ where: { tripId: salida.id } });
      check(reservas === 0, 'y no se vendió la silla', reservas);

      await prisma.pooledTrip.delete({ where: { id: salida.id } });
      await prisma.driver.delete({ where: { id: conductor.id } });
    }

    console.log('\n[3] LO QUE NO SE PUEDE HABER CERRADO: la movilidad urbana');
    {
      // La comprobación que de verdad vale. Un bloqueo que de paso apague el
      // puesto urbano habría apagado el servicio en el que está el foco, y
      // nada más lo detectaría.
      const r = await pedir('POST', '/client/pool/urbano/publish', {
        token: tPax,
        body: {
          city: 'pamplona',
          originLabel: 'Barrio El Rosario', destLabel: 'Hospital San Juan de Dios',
          departureTime: new Date().toISOString(),
          totalSeats: 4, seatsForMe: 1,
        },
      });
      check(r.status === 200 || r.status === 201,
        'publicar un viaje por puestos URBANO sigue funcionando',
        { status: r.status, err: r.json.error });
      const pub = r.json.data as { id?: string; farePerSeat?: number } | undefined;
      if (pub?.id) creados.push(pub.id);
      check((pub?.farePerSeat ?? 0) > 0, 'con su precio puesto', pub?.farePerSeat);

      const lista = await pedir('GET', '/client/pool/urbano?ciudad=pamplona', { token: tPax });
      check(lista.status === 200, 'y la búsqueda urbana responde', lista.status);
    }

    console.log('\n[4] Y el seguimiento de lo que YA existe');
    {
      // Cerrarle el seguimiento a quien tiene una reserva en curso sería
      // quitarle la información de un viaje que sí va a ocurrir.
      const activa = await pedir('GET', '/client/intercity/active', { token: tPax });
      check(activa.status === 200,
        'consultar la reserva intermunicipal activa NO está bloqueado', activa.status);
      const hist = await pedir('GET', '/client/intercity/history', { token: tPax });
      check(hist.status === 200, 'ni el historial', hist.status);
    }

    for (const id of creados) {
      await prisma.seatBooking.deleteMany({ where: { tripId: id } });
      await prisma.pooledTrip.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { phone: telPax } });
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
