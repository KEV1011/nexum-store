/**
 * El viaje por puestos URBANO de punta a punta, como lo reportó el usuario:
 * «no se ve el trayecto, el viaje desaparece al refrescar, no se ven las
 * reservas ni cuando inicia, no hay chat, la ubicación no es obligatoria, no
 * se puede decir cómo se paga ni calificar, y el conductor no ve a qué puntos
 * ir».
 *
 * Por HTTP (el servidor real), con un conductor de verdad (JWT firmado):
 *
 *   1. La reserva urbana SIN punto en el mapa se rechaza; con pago en línea
 *      también; con punto y efectivo entra.
 *   2. El conductor toma el viaje y ve a cada pasajero con su punto, en el
 *      mapa, y cómo paga (el autor sube en el origen).
 *   3. El pasajero ve SU viaje en /viajes, con la reserva propia.
 *   4. Chat de grupo: los dos pasajeros y el conductor escriben y leen, con el
 *      nombre de quien escribe; alguien ajeno no entra.
 *   5. Iniciar y terminar: el viaje NO desaparece de /viajes al terminar; el
 *      pasajero califica al taxista y el taxista a cada pasajero (la nota
 *      llega a la reputación del pasajero).
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/puesto-viaje-completo.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3119);
const BASE = `http://localhost:${PUERTO}`;
const OTP = '424242';
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'e2e-secreto-largo-para-firmar-0123456789';

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

async function arrancarServidor(): Promise<ChildProcess & { registros: string[] }> {
  try {
    const ocupado = await fetch(`${BASE}/health`);
    if (ocupado.ok) throw new Error(`el puerto ${PUERTO} ya está ocupado (fuser -k ${PUERTO}/tcp).`);
  } catch (e) {
    if (e instanceof Error && e.message.includes('ya está ocupado')) throw e;
  }
  const hijo = spawn('npx', ['tsx', 'src/index.ts'], {
    detached: true,
    cwd: process.cwd(),
    env: {
      ...process.env, PORT: String(PUERTO), NODE_ENV: 'development',
      INTERMUNICIPAL_ABIERTO: '', OTP_DEV_CODE: OTP, OTP_FALLBACK_CODE: OTP, JWT_SECRET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcess & { registros: string[] };
  hijo.registros = [];
  hijo.stdout?.on('data', (b: Buffer) => hijo.registros.push(b.toString()));
  hijo.stderr?.on('data', (b: Buffer) => hijo.registros.push(b.toString()));
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { if ((await fetch(`${BASE}/health`)).ok) return hijo; } catch { /* aún no */ }
  }
  console.error(hijo.registros.join(''));
  throw new Error('el servidor no arrancó');
}

async function entrarComoCliente(telefono: string, nombre: string): Promise<string> {
  await pedir('POST', '/client/auth/send-otp', { body: { phone: telefono } });
  const r = await pedir('POST', '/client/auth/verify-otp', {
    body: { phone: telefono, otp: OTP, name: nombre },
  });
  const data = r.json.data as { token?: string } | undefined;
  if (!data?.token) throw new Error(`no se pudo entrar: ${JSON.stringify(r.json)}`);
  return data.token;
}

interface Reserva {
  id: string; passengerName: string; pickupAddress?: string;
  pickupLat?: number; pickupLng?: number; paymentMethod?: string; paymentLabel?: string;
  passengerRating?: number; rating?: number;
}
interface Viaje {
  id: string; status: string; sinConductor: boolean; soyAutor?: boolean;
  myBooking?: Reserva; bookings?: Reserva[]; originLat?: number; destLat?: number;
  miUsuarioId?: string;
}

async function main() {
  const servidor = await arrancarServidor();
  const viajes: string[] = [];
  const conductores: string[] = [];
  const telefonos: string[] = [];
  try {
    await prisma.municipality.upsert({
      where: { slug: 'pamplona' },
      update: { isActive: true },
      create: { slug: 'pamplona', name: 'Pamplona', department: 'Norte de Santander', lat: 7.3754, lng: -72.6486 },
    });
    const sufijo = String(Date.now()).slice(-6);
    const telA = `+57303${sufijo}1`;
    const telB = `+57303${sufijo}2`;
    const telC = `+57303${sufijo}3`;
    telefonos.push(telA, telB, telC);
    const tokenA = await entrarComoCliente(telA, 'Ana Autora');
    const tokenB = await entrarComoCliente(telB, 'Beto Pasajero');
    const tokenC = await entrarComoCliente(telC, 'Carla Ajena');
    const idB = (await prisma.user.findFirst({ where: { phone: telB } }))!.id;
    // El código no pone el nombre (lo pide una pantalla aparte): se pone aquí,
    // que es lo que el pasajero habría escrito.
    await prisma.user.update({ where: { phone: telA }, data: { name: 'Ana Autora' } });
    await prisma.user.update({ where: { phone: telB }, data: { name: 'Beto Pasajero' } });
    await prisma.user.update({ where: { phone: telC }, data: { name: 'Carla Ajena' } });

    console.log('\n[1] Recogida obligatoria y pago en la mano');
    const pub = await pedir('POST', '/client/pool/urbano/publish', {
      token: tokenA,
      body: {
        city: 'pamplona', originLabel: 'Cl. 10 #4a2', destLabel: 'Cra. 1 # 3 Norte',
        originLat: 7.3754, originLng: -72.6486, destLat: 7.3810, destLng: -72.6440,
        departureTime: new Date(Date.now() + 30 * 60_000).toISOString(),
        totalSeats: 4, seatsForMe: 1, paymentMethod: 'nequi',
      },
    });
    const viajeId = (pub.json.data as Viaje | undefined)?.id ?? '';
    check(pub.status === 201 && !!viajeId, 'el autor publica su viaje', pub.json);
    viajes.push(viajeId);

    const sinPunto = await pedir('POST', `/client/intercity/pool/${viajeId}/book`, {
      token: tokenB, body: { seatsBooked: 1, pickupAddress: 'Parque de los Enamorados' },
    });
    check(sinPunto.status === 400 && /mapa/i.test(sinPunto.json.error ?? ''),
      'sin punto en el mapa se rechaza diciendo que lo marque', sinPunto);
    const enLinea = await pedir('POST', `/client/intercity/pool/${viajeId}/book`, {
      token: tokenB,
      body: { seatsBooked: 1, pickupAddress: 'Parque', pickupLat: 7.3765, pickupLng: -72.6470, paymentMethod: 'en_linea' },
    });
    check(enLinea.status === 400, 'el pago en línea no se acepta en un puesto', enLinea);
    const lejos = await pedir('POST', `/client/intercity/pool/${viajeId}/book`, {
      token: tokenB,
      body: { seatsBooked: 1, pickupAddress: 'Cúcuta', pickupLat: 7.8939, pickupLng: -72.5078, paymentMethod: 'efectivo' },
    });
    check(lejos.status === 400 && /lejos/i.test(lejos.json.error ?? ''), 'un punto en otra ciudad se rechaza', lejos);
    const bien = await pedir('POST', `/client/intercity/pool/${viajeId}/book`, {
      token: tokenB,
      body: { seatsBooked: 1, pickupAddress: 'Parque de los Enamorados', pickupLat: 7.3765, pickupLng: -72.6470, paymentMethod: 'efectivo' },
    });
    check(bien.status === 201, 'con punto y efectivo, la reserva entra', bien);

    console.log('\n[2] El conductor toma el viaje y ve a quién recoger, dónde y cómo paga');
    const taxista = await prisma.driver.create({
      data: {
        name: 'Steve Taxista', phone: `+57304${sufijo}9`, documentType: 'CC',
        documentNumber: `78${sufijo}`, isVerified: true, status: 'ONLINE', citySlug: 'pamplona',
        lastLat: 7.3750, lastLng: -72.6490,
        vehicles: { create: { type: 'TAXI', brand: 'Kia', model: 'Picanto', color: 'Amarillo', plate: `U${sufijo}`, year: 2021, isActive: true } },
      },
    });
    conductores.push(taxista.id);
    const tokenT = jwt.sign({ driverId: taxista.id, phone: taxista.phone }, JWT_SECRET, { expiresIn: '1h' });
    const tomar = await pedir('POST', `/driver/pool/urbano/${viajeId}/tomar`, { token: tokenT });
    check(tomar.status === 200, 'el taxista toma el viaje', tomar);
    const mios = await pedir('GET', '/driver/intercity/pool/mine', { token: tokenT });
    const suyo = (mios.json.data as Viaje[] | undefined)?.find((t) => t.id === viajeId);
    check(!!suyo?.originLat && !!suyo?.destLat, 'el viaje trae los extremos REALES para dibujar el trayecto', suyo);
    const recB = suyo?.bookings?.find((b) => b.passengerName === 'Beto Pasajero');
    const recA = suyo?.bookings?.find((b) => b.passengerName === 'Ana Autora');
    check(recB?.pickupLat === 7.3765 && recB?.pickupLng === -72.647, 've el punto de recogida del pasajero', recB);
    check(recB?.paymentLabel === 'Efectivo', 'y cómo le paga', recB?.paymentLabel);
    check(recA?.pickupLat === 7.3754 && recA?.pickupAddress === 'Cl. 10 #4a2',
      'el autor sube en el origen del viaje', recA);
    check(recA?.paymentLabel === 'Nequi', 'y paga como dijo al publicar', recA?.paymentLabel);

    console.log('\n[3] El pasajero ve SU viaje, con su reserva y el taxi');
    const listaB = await pedir('GET', '/client/pool/urbano/viajes', { token: tokenB });
    const deB = (listaB.json.data as Viaje[] | undefined)?.find((t) => t.id === viajeId);
    check(!!deB && deB.sinConductor === false && deB.soyAutor === false,
      'el que reservó lo ve, con taxista asignado', deB);
    check(deB?.myBooking?.pickupAddress === 'Parque de los Enamorados', 'con SU recogida', deB?.myBooking);
    check(deB?.miUsuarioId === idB, 'y su id para el chat de grupo', deB?.miUsuarioId);
    const detalleA = await pedir('GET', `/client/pool/urbano/viajes/${viajeId}`, { token: tokenA });
    check(detalleA.status === 200 && (detalleA.json.data as Viaje).soyAutor === true, 'el autor lo ve como suyo', detalleA);
    const ajeno = await pedir('GET', `/client/pool/urbano/viajes/${viajeId}`, { token: tokenC });
    check(ajeno.status === 404, 'alguien sin reserva no lo ve', ajeno.status);

    console.log('\n[4] Chat de grupo');
    const { postTripChat, getTripChat } = await import('../src/services/trip-chat.service');
    const idA = (await prisma.user.findFirst({ where: { phone: telA } }))!.id;
    const idC = (await prisma.user.findFirst({ where: { phone: telC } }))!.id;
    const m1 = await postTripChat(viajeId, 'client', idB, 'Voy en la esquina');
    check(m1.senderName === 'Beto Pasajero', 'el mensaje lleva el nombre de quien escribe', m1);
    await postTripChat(viajeId, 'driver', taxista.id, 'Llego en 3 minutos');
    const hilo = await getTripChat(viajeId, idA);
    check(hilo.length === 2 && hilo[1]?.senderName === 'Steve Taxista',
      'la autora lee a los dos, con nombre', hilo.map((m) => m.senderName));
    let bloqueado = false;
    try { await getTripChat(viajeId, idC); } catch { bloqueado = true; }
    check(bloqueado, 'alguien sin reserva no entra al chat');
    const restHilo = await pedir('GET', `/client/trips/${viajeId}/chat`, { token: tokenB });
    check(restHilo.status === 200, 'el historial también se lee por HTTP', restHilo.status);

    console.log('\n[5] Iniciar, terminar, y el viaje NO desaparece: se califica');
    const antes = await pedir('POST', `/driver/pool/bookings/${recB?.id}/rate-passenger`, { token: tokenT, body: { rating: 5 } });
    check(antes.status === 400, 'no se califica al pasajero antes de terminar', antes);
    const salir = await pedir('POST', `/driver/intercity/pool/${viajeId}/depart`, { token: tokenT });
    check(salir.status === 200, 'el taxista inicia', salir);
    const enCamino = await pedir('GET', `/client/pool/urbano/viajes/${viajeId}`, { token: tokenB });
    check((enCamino.json.data as Viaje).status === 'departed', 'el pasajero ve que arrancó', enCamino.json.data);
    const fin = await pedir('POST', `/driver/intercity/pool/${viajeId}/complete`, { token: tokenT });
    check(fin.status === 200, 'el taxista termina', fin);
    const despues = await pedir('GET', '/client/pool/urbano/viajes', { token: tokenB });
    const sigue = (despues.json.data as Viaje[] | undefined)?.find((t) => t.id === viajeId);
    check(sigue?.status === 'completed', 'terminado, el viaje SIGUE en la lista del pasajero', sigue?.status);
    const calB = await pedir('POST', `/client/intercity/pool/bookings/${deB?.myBooking?.id}/rate`, {
      token: tokenB, body: { rating: 4, comment: 'Puntual' },
    });
    check(calB.status === 200, 'el pasajero califica al taxista', calB);
    const calT = await pedir('POST', `/driver/pool/bookings/${recB?.id}/rate-passenger`, { token: tokenT, body: { rating: 5 } });
    check(calT.status === 200, 'el taxista califica al pasajero', calT);
    const userB = await prisma.user.findUnique({ where: { id: idB } });
    check(userB?.rating === 5 && userB?.ratingCount === 1, 'la nota llega a la reputación del pasajero', userB);
    const otro = jwt.sign({ driverId: 'otro-conductor', phone: '+573000000000' }, JWT_SECRET, { expiresIn: '1h' });
    const ajenoRate = await pedir('POST', `/driver/pool/bookings/${recB?.id}/rate-passenger`, { token: otro, body: { rating: 1 } });
    check(ajenoRate.status !== 200, 'otro conductor no puede calificar a ese pasajero', ajenoRate.status);

    console.log(`\n${ok} comprobaciones bien, ${fallos} mal`);
    if (fallos > 0) { console.error('\nREGISTROS:'); console.error(servidor.registros.join('')); }
    process.exitCode = fallos > 0 ? 1 : 0;
  } finally {
    try {
      await prisma.tripMessage.deleteMany({ where: { tripId: { in: viajes } } });
      await prisma.seatBooking.deleteMany({ where: { tripId: { in: viajes } } });
      await prisma.pooledTrip.deleteMany({ where: { id: { in: viajes } } });
      await prisma.driverEarning.deleteMany({ where: { driverId: { in: conductores } } }).catch(() => undefined);
      await prisma.vehicle.deleteMany({ where: { driverId: { in: conductores } } });
      await prisma.driver.deleteMany({ where: { id: { in: conductores } } });
    } catch (e) { console.error('(no se pudo limpiar del todo)', e); }
    await prisma.$disconnect();
    if (servidor.pid) { try { process.kill(-servidor.pid, 'SIGKILL'); } catch { /* ya murió */ } }
  }
}

void main();
