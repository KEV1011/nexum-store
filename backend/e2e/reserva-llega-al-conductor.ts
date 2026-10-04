/**
 * «Al conductor no le sale nada de las reservas de taxi» — POR HTTP.
 *
 * POR QUÉ ESTE E2E EXISTE TENIENDO YA `reservas-taxi.ts`
 * -----------------------------------------------------
 * Aquel siembra los viajes directamente en la base con `status: SCHEDULED` y
 * llama a `listarReservasLibres()`. Prueba el servicio, que está bien. Lo que
 * NO prueba es la cadena que recorre el usuario:
 *
 *     app cliente → POST /client/trips/request (con scheduledFor)
 *                 → el viaje nace como lo crea el servidor de verdad
 *     app conductor → GET /driver/reservas
 *
 * El repo ya pagó esta lección: `POST /client/intercity/pool/:id/book`
 * recibía `seats` y no se lo pasaba al servicio, así que el mapa de asientos
 * era inalcanzable desde la app mientras el servicio y su E2E estaban en
 * verde. Para saber si algo funciona hay que GOLPEAR LA RUTA.
 *
 * Aquí el viaje no se siembra: lo crea el cliente como lo crearía su teléfono,
 * y se comprueba que al conductor le llega por su propia ruta.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/reserva-llega-al-conductor.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3123);
const BASE = `http://localhost:${PUERTO}`;
const OTP = '424242';

// Pamplona. Las mismas coordenadas que usa el resto de los E2E, para que
// `plazaDeCoordenadas` resuelva igual que en producción.
const ORIGEN = { lat: 7.3754, lng: -72.6486 };
const DESTINO = { lat: 7.3800, lng: -72.6400 };

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

type Res = { status: number; json: { success?: boolean; data?: unknown; error?: string; aviso?: string } };
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
  // viejo y diera un verde que no significa nada. Ya pasó.
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
    body: { phone: telefono, otp: OTP, name: 'Pasajera Reserva' },
  });
  const data = r.json.data as { token?: string } | undefined;
  if (!data?.token) throw new Error(`cliente no pudo entrar: ${JSON.stringify(r.json)}`);
  return data.token;
}

async function entrarComoConductor(telefono: string): Promise<string> {
  await pedir('POST', '/auth/send-otp', { body: { phone: telefono } });
  const r = await pedir('POST', '/auth/verify-otp', { body: { phone: telefono, otp: OTP } });
  const data = r.json.data as { token?: string } | undefined;
  if (!data?.token) throw new Error(`conductor no pudo entrar: ${JSON.stringify(r.json)}`);
  return data.token;
}

type ReservaVista = {
  id: string;
  serviceType: string;
  scheduledFor: string;
  originAddress: string;
  estimatedFare: number | null;
  stops?: string[];
};

async function main() {
  const servidor = await arrancarServidor();
  const suf = Math.floor(10000 + Math.random() * 89999);
  const telCliente = `+5730077${suf}`;
  const telCond = `+5730088${suf}`;

  // ── El conductor: un taxista como cualquiera ─────────────────────────────
  // Verificado, con su taxi activo y latido fresco, que es lo que tiene un
  // taxista que acaba de abrir la app.
  const conductor = await prisma.driver.create({
    data: {
      name: 'Taxista Reserva', phone: telCond,
      isVerified: true, status: 'ONLINE',
      citySlug: 'pamplona',
      lastLat: ORIGEN.lat, lastLng: ORIGEN.lng, lastSeenAt: new Date(),
      vehicles: {
        create: {
          type: 'TAXI', brand: 'Chevrolet', model: 'Spark',
          plate: `TXR${suf}`, year: 2020, color: 'Amarillo', isActive: true,
        },
      },
    },
  });

  const tokenCliente = await entrarComoCliente(telCliente);
  const tokenCond = await entrarComoConductor(telCond);

  // ── 1. El pasajero reserva un taxi, por la ruta real ─────────────────────
  console.log('\n[1] El pasajero reserva un taxi para mañana');
  const manana = new Date(Date.now() + 20 * 3600 * 1000);
  const crear = await pedir('POST', '/client/trips/request', {
    token: tokenCliente,
    body: {
      serviceType: 'taxi',
      originAddress: 'Parque Águeda Gallardo',
      destinationAddress: 'Terminal de Pamplona',
      originLat: ORIGEN.lat, originLng: ORIGEN.lng,
      destLat: DESTINO.lat, destLng: DESTINO.lng,
      paymentMethod: 'efectivo',
      scheduledFor: manana.toISOString(),
    },
  });
  const creado = crear.json.data as { id?: string; status?: string } | undefined;
  check(crear.status === 200 || crear.status === 201,
    'la reserva se crea por la ruta del cliente', { status: crear.status, err: crear.json.error });
  check(creado?.status === 'scheduled',
    'nace como reservado, no como buscando conductor', creado?.status);

  const tripId = creado?.id ?? '';
  const enBD = tripId
    ? await prisma.trip.findUnique({
        where: { id: tripId },
        select: { status: true, driverId: true, serviceType: true, citySlug: true, scheduledFor: true },
      })
    : null;
  check(enBD?.status === 'SCHEDULED', 'en la base queda SCHEDULED', enBD?.status);
  check(enBD?.driverId === null, 'nace sin conductor, o sea en el tablero');
  check(enBD?.serviceType === 'TAXI', 'el servicio sellado es TAXI', enBD?.serviceType);

  // ── 2. LO QUE REPORTÓ EL USUARIO: ¿la ve el conductor? ───────────────────
  console.log('\n[2] El conductor abre su tablero (GET /driver/reservas)');
  const tablero = await pedir('GET', '/driver/reservas', { token: tokenCond });
  const vistas = (tablero.json.data as ReservaVista[]) ?? [];
  const mia = vistas.find((r) => r.id === tripId);

  check(tablero.status === 200, 'el tablero responde 200', tablero.status);
  check(
    mia !== undefined,
    'LA RESERVA LE SALE AL CONDUCTOR',
    { recibidas: vistas.length, aviso: tablero.json.aviso, error: tablero.json.error },
  );
  check(mia?.serviceType === 'TAXI', 'con su servicio', mia?.serviceType);
  check(
    typeof mia?.scheduledFor === 'string' && mia.scheduledFor.length > 0,
    'con la hora a la que tiene que estar',
    mia?.scheduledFor,
  );

  // ── 3. Y se le avisó, no solo está en una lista que hay que abrir ────────
  console.log('\n[3] Le llegó el aviso, no solo está en la lista');
  // El aviso sale sin esperar (`void`), así que se le da un respiro antes de
  // mirar su constancia. Sin esto la comprobación mide una carrera, no el
  // comportamiento.
  await new Promise((r) => setTimeout(r, 1500));
  const avisos = tripId
    ? await prisma.reservaAviso.findMany({ where: { tripId }, select: { driverId: true, resultado: true } })
    : [];
  const suyo = avisos.find((a) => a.driverId === conductor.id);
  check(suyo !== undefined, 'queda constancia de que se le avisó a ESTE conductor',
    { avisos: avisos.length });
  check(suyo?.resultado === 'enviado',
    'y el resultado es «enviado», no un motivo de exclusión', suyo?.resultado);

  // ── 4. Puede apartarla, que es para lo que sirve el tablero ──────────────
  console.log('\n[4] La aparta');
  const apartar = await pedir('POST', `/driver/reservas/${tripId}/apartar`, { token: tokenCond });
  check(apartar.status === 200, 'apartar responde 200',
    { status: apartar.status, err: apartar.json.error });
  const trasApartar = tripId
    ? await prisma.trip.findUnique({ where: { id: tripId }, select: { driverId: true } })
    : null;
  check(trasApartar?.driverId === conductor.id, 'queda sellada a su nombre');

  const mias = await pedir('GET', '/driver/reservas/mias', { token: tokenCond });
  const listaMias = (mias.json.data as ReservaVista[]) ?? [];
  check(listaMias.some((r) => r.id === tripId), 'y aparece en «mis reservas»',
    { recibidas: listaMias.length });

  // ── 5. CONTRAPRUEBA: ya apartada, no se le ofrece a otro ─────────────────
  // Sin esto, la comprobación 2 pasaría igual si el tablero devolviera TODO
  // sin filtrar, que es un fallo distinto y peor.
  console.log('\n[5] Contraprueba: apartada, ya no está libre para otro');
  const telOtro = `+5730099${suf}`;
  await prisma.driver.create({
    data: {
      name: 'Otro Taxista', phone: telOtro,
      isVerified: true, status: 'ONLINE', citySlug: 'pamplona',
      lastLat: ORIGEN.lat, lastLng: ORIGEN.lng, lastSeenAt: new Date(),
      vehicles: {
        create: {
          type: 'TAXI', brand: 'Kia', model: 'Picanto',
          plate: `OTR${suf}`, year: 2021, color: 'Amarillo', isActive: true,
        },
      },
    },
  });
  const tokenOtro = await entrarComoConductor(telOtro);
  const tableroOtro = await pedir('GET', '/driver/reservas', { token: tokenOtro });
  const vistasOtro = (tableroOtro.json.data as ReservaVista[]) ?? [];
  check(!vistasOtro.some((r) => r.id === tripId),
    'al segundo taxista ya no se le ofrece');

  // ── 6. Y un conductor sin taxi NO la ve, con su motivo ───────────────────
  // La otra mitad del filtro: si el tablero no filtrara por vehículo, a un
  // motociclista se le ofrecerían carreras de taxi que no puede atender.
  console.log('\n[6] Un motociclista no ve una reserva de taxi');
  const telMoto = `+5730111${suf}`;
  await prisma.driver.create({
    data: {
      name: 'Motociclista', phone: telMoto,
      isVerified: true, status: 'ONLINE', citySlug: 'pamplona',
      lastLat: ORIGEN.lat, lastLng: ORIGEN.lng, lastSeenAt: new Date(),
      vehicles: {
        create: {
          type: 'MOTO', brand: 'Bajaj', model: 'Boxer',
          plate: `MTO${suf}`, year: 2022, color: 'Negro', isActive: true,
        },
      },
    },
  });
  const tokenMoto = await entrarComoConductor(telMoto);
  // Se crea OTRA reserva de taxi, porque la primera ya está apartada y no
  // probaría nada: tiene que ser una que SÍ esté libre.
  const otra = await pedir('POST', '/client/trips/request', {
    token: tokenCliente,
    body: {
      serviceType: 'taxi',
      originAddress: 'Catedral', destinationAddress: 'Hospital',
      originLat: ORIGEN.lat, originLng: ORIGEN.lng,
      destLat: DESTINO.lat, destLng: DESTINO.lng,
      paymentMethod: 'efectivo',
      scheduledFor: new Date(Date.now() + 22 * 3600 * 1000).toISOString(),
    },
  });
  const otraId = (otra.json.data as { id?: string } | undefined)?.id ?? '';
  const tableroMoto = await pedir('GET', '/driver/reservas', { token: tokenMoto });
  const vistasMoto = (tableroMoto.json.data as ReservaVista[]) ?? [];
  check(!vistasMoto.some((r) => r.id === otraId),
    'la reserva de taxi no le sale al de la moto');
  // Y el control de esa contraprueba: al taxista SÍ le sale. Sin esto, la
  // comprobación de arriba pasaría también con el tablero roto para todos.
  const tableroOtro2 = await pedir('GET', '/driver/reservas', { token: tokenOtro });
  const vistasOtro2 = (tableroOtro2.json.data as ReservaVista[]) ?? [];
  check(vistasOtro2.some((r) => r.id === otraId),
    'pero al taxista sí (control: el tablero no está roto para todos)',
    { recibidas: vistasOtro2.length, aviso: tableroOtro2.json.aviso });

  // ── Limpieza ─────────────────────────────────────────────────────────────
  await prisma.reservaAviso.deleteMany({ where: { tripId: { in: [tripId, otraId].filter(Boolean) } } });
  await prisma.trip.deleteMany({ where: { id: { in: [tripId, otraId].filter(Boolean) } } });
  await prisma.vehicle.deleteMany({ where: { plate: { in: [`TXR${suf}`, `OTR${suf}`, `MTO${suf}`] } } });
  await prisma.driver.deleteMany({ where: { phone: { in: [telCond, telOtro, telMoto] } } });
  await prisma.user.deleteMany({ where: { phone: telCliente } });

  if (fallos > 0) {
    const regs = (servidor as ChildProcess & { registros?: string[] }).registros ?? [];
    console.error('\n─── registros del servidor ───\n' + regs.join('').slice(-4000));
  }
  if (servidor.pid) { try { process.kill(-servidor.pid); } catch { /* ya murió */ } }
  await prisma.$disconnect();

  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} comprobaciones en verde, ${fallos} en rojo`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
