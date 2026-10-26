/**
 * E2E del viaje seguro y de la clave personal, por HTTP contra PostgreSQL real.
 *
 * Lo que se comprueba, cada cosa por la PUERTA por la que entra de verdad:
 *
 *   1. Código de abordaje: el pasajero lo recibe, el conductor NUNCA; sin él
 *      (con la exigencia encendida) o con uno equivocado el viaje no arranca.
 *   2. Nota para el conductor: llega en la oferta.
 *   3. Compartir viaje: el enlace es la PÁGINA del portal y la vista pública
 *      trae el mapa; terminado el viaje deja de decir dónde está el carro.
 *   4. La puerta del conductor rechaza tokens que no son de conductor.
 *   5. «¿Todo bien?»: la respuesta queda en la alerta, solo para su pasajero.
 *   6. Clave personal del conductor, de la empresa y del negocio: crearla,
 *      pedirla, bloquear tras cinco fallos y restablecerla desde el admin.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/viaje-seguro.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = 3027;
const BASE = `http://127.0.0.1:${PUERTO}`;
const OTP = '123456';
const ADMIN = '+573009990001';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown): void {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

interface Res { status: number; json: { success?: boolean; data?: unknown; error?: string; code?: string } }
async function pedir(
  metodo: string,
  ruta: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<Res> {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: Res['json'] = {};
  try { json = (await r.json()) as Res['json']; } catch { /* no JSON */ }
  return { status: r.status, json };
}
const datos = <T>(r: Res) => r.json.data as T;

async function arrancarServidor(): Promise<ChildProcess> {
  try {
    const r = await fetch(`${BASE}/health`);
    if (r.ok) throw new Error(`el puerto ${PUERTO} ya está ocupado (fuser -k ${PUERTO}/tcp)`);
  } catch (e) {
    if (e instanceof Error && e.message.includes('ocupado')) throw e;
  }
  const hijo = spawn('npx', ['tsx', 'src/index.ts'], {
    detached: true,
    env: {
      ...process.env,
      PORT: String(PUERTO),
      NODE_ENV: 'development',
      OTP_DEV_CODE: OTP,
      OTP_FALLBACK_CODE: OTP,
      ADMIN_PHONES: ADMIN,
      RATE_LIMIT_AUTH: '5000',
      BOARDING_PIN_ENFORCE: 'true',
      PORTAL_BASE_URL: 'https://portal.zipa.test',
      JWT_SECRET: process.env['JWT_SECRET'] ?? 'e2e-secreto-largo-para-firmar-0123456789',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const registros: string[] = [];
  hijo.stdout?.on('data', (b: Buffer) => registros.push(b.toString()));
  hijo.stderr?.on('data', (b: Buffer) => registros.push(b.toString()));
  (hijo as ChildProcess & { registros: string[] }).registros = registros;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { if ((await fetch(`${BASE}/health`)).ok) return hijo; } catch { /* aún no */ }
  }
  console.error(registros.join(''));
  throw new Error('el servidor no arrancó');
}

async function entrarCliente(tel: string): Promise<string> {
  await pedir('POST', '/client/auth/send-otp', { body: { phone: tel } });
  const r = await pedir('POST', '/client/auth/verify-otp', { body: { phone: tel, otp: OTP } });
  const t = datos<{ token?: string }>(r)?.token;
  if (!t) throw new Error(`cliente no entró: ${JSON.stringify(r.json)}`);
  return t;
}

/**
 * Deja un código vivo para ese teléfono. `send-otp` no se puede llamar dos
 * veces en 45 s por el mismo número (anti-abuso), y esta prueba entra varias
 * veces seguidas con la misma cuenta.
 */
async function sembrarCodigo(tel: string): Promise<void> {
  await prisma.otpSession.updateMany({ where: { phone: tel, used: false }, data: { used: true } });
  await prisma.otpSession.create({
    data: { phone: tel, code: OTP, expiresAt: new Date(Date.now() + 5 * 60_000) },
  });
}

async function loginConductor(tel: string, pin?: string): Promise<Res> {
  await sembrarCodigo(tel);
  return pedir('POST', '/auth/verify-otp', { body: { phone: tel, otp: OTP, ...(pin ? { pin } : {}) } });
}

async function main(): Promise<void> {
  const servidor = await arrancarServidor();
  const n = Math.floor(10000 + Math.random() * 89999);
  const telCliente = `+5730011${n}`;
  const telOtro = `+5730012${n}`;
  const telConductor = `+5730013${n}`;
  const limpiar: Array<() => Promise<unknown>> = [];

  try {
    const conductor = await prisma.driver.create({
      data: {
        name: 'Ramón Abordaje', phone: telConductor, isVerified: true, status: 'ONLINE',
        lastLat: 7.3754, lastLng: -72.6486, lastSeenAt: new Date(),
        vehicles: { create: { brand: 'Chevrolet', model: 'Spark', year: 2020, plate: `ABC${n % 1000}`.padEnd(6, '0'), color: 'Amarillo', type: 'TAXI', isActive: true } },
      },
    });
    limpiar.push(() => prisma.driver.delete({ where: { id: conductor.id } }));

    // ── 1. El pasajero pide con nota y recibe su código ──────────────────────
    console.log('\n[1] Código de abordaje y nota');
    const tokCliente = await entrarCliente(telCliente);
    const pedido = await pedir('POST', '/client/trips/request', {
      token: tokCliente,
      body: {
        serviceType: 'taxi', originAddress: 'Parque Águeda', destinationAddress: 'Terminal',
        originLat: 7.3754, originLng: -72.6486, destLat: 7.3921, destLng: -72.6602,
        estimatedFare: 1, distanceKm: 1, etaMinutes: 1,
        passengerNote: '  Estoy en la portería\n del edificio azul ',
      },
    });
    const viaje = datos<{ id: string; boardingPin?: string; passengerNote?: string }>(pedido);
    check(pedido.status === 201, 'el viaje se crea', pedido.json);
    check(/^\d{4}$/.test(viaje?.boardingPin ?? ''), 'el pasajero recibe un código de 4 dígitos', viaje?.boardingPin);
    check(viaje?.passengerNote === 'Estoy en la portería del edificio azul', 'la nota llega limpia', viaje?.passengerNote);
    const codigo = viaje.boardingPin!;

    // Asignado a mano: el matching no es lo que se prueba aquí.
    await prisma.trip.update({ where: { id: viaje.id }, data: { driverId: conductor.id, status: 'ARRIVED' } });

    const { buildTripRequestDTO } = await import('../src/services/matching.service');
    const oferta = await buildTripRequestDTO(viaje.id);
    check(oferta?.requiresBoardingPin === true, 'la oferta avisa que hace falta el código');
    check(oferta?.passengerNote === 'Estoy en la portería del edificio azul', 'la oferta trae la nota');
    check(!JSON.stringify(oferta).includes(`"${codigo}"`), 'la oferta NO trae el código');

    const { getClientTripSnapshot } = await import('../src/services/client.service');
    const snapConductor = await getClientTripSnapshot(viaje.id);
    check(!('boardingPin' in (snapConductor ?? {})), 'el DTO que viaja al conductor tampoco');
    const snapCliente = await pedir('GET', `/client/trips/${viaje.id}`, { token: tokCliente });
    check(datos<{ boardingPin?: string }>(snapCliente)?.boardingPin === codigo, 'el pasajero lo recupera al reabrir la app');

    const tokConductor = datos<{ token?: string }>(await loginConductor(telConductor))?.token!;
    const sinCodigo = await pedir('POST', `/driver/trips/${viaje.id}/status`, { token: tokConductor, body: { status: 'in_progress' } });
    check(sinCodigo.status === 400, 'sin código (exigencia encendida) no arranca', sinCodigo.json);
    const malo = await pedir('POST', `/driver/trips/${viaje.id}/status`, {
      token: tokConductor, body: { status: 'in_progress', pin: codigo === '0000' ? '1111' : '0000' },
    });
    check(malo.status === 400 && /no coincide/.test(malo.json.error ?? ''), 'con código equivocado tampoco, y lo dice', malo.json);
    let t = await prisma.trip.findUnique({ where: { id: viaje.id } });
    check(t?.status === 'ARRIVED', 'el viaje sigue esperando');
    const bueno = await pedir('POST', `/driver/trips/${viaje.id}/status`, { token: tokConductor, body: { status: 'in_progress', pin: codigo } });
    check(bueno.status === 200, 'con el código correcto arranca', bueno.json);
    t = await prisma.trip.findUnique({ where: { id: viaje.id } });
    check(t?.status === 'IN_PROGRESS' && t.startedAt != null, 'en curso y con hora de salida sellada', t?.status);

    // ── 3. Compartir viaje ───────────────────────────────────────────────────
    console.log('\n[3] Compartir viaje');
    const share = await pedir('POST', '/safety/share-trip', { token: tokCliente, body: { tripId: viaje.id } });
    const s = datos<{ shareToken: string; shareUrl: string }>(share);
    check(s?.shareUrl === `https://portal.zipa.test/viaje/${s?.shareToken}`, 'el enlace es la página del portal', s?.shareUrl);
    await prisma.driver.update({ where: { id: conductor.id }, data: { lastLat: 7.381, lastLng: -72.652, lastSeenAt: new Date() } });
    let vista = datos<Record<string, unknown>>(await pedir('GET', `/safety/track/${s.shareToken}`));
    check((vista?.origin as { lat: number })?.lat === 7.3754 && (vista?.destination as { lat: number })?.lat === 7.3921, 'trae origen y destino para el mapa');
    check((vista?.driverPosition as { lat: number })?.lat === 7.381, 'con el viaje en curso, dice dónde va el carro', vista?.driverPosition);
    check(typeof vista?.arrivalEstimate === 'string', 'y a qué hora llega');
    check((vista?.vehicle as { plate: string })?.plate === `ABC${n % 1000}`.padEnd(6, '0'), 'y la placa por separado', vista?.vehicle);
    check(!JSON.stringify(vista).includes(telConductor) && !JSON.stringify(vista).includes('Abordaje'), 'sin teléfono ni apellido del conductor');
    await prisma.driver.update({ where: { id: conductor.id }, data: { lastSeenAt: new Date(Date.now() - 30 * 60_000) } });
    vista = datos<Record<string, unknown>>(await pedir('GET', `/safety/track/${s.shareToken}`));
    check(vista?.driverPosition === undefined, 'una posición de hace media hora NO se dibuja');

    // ── 4. La puerta del conductor ───────────────────────────────────────────
    console.log('\n[4] Solo tokens de conductor en las rutas del conductor');
    check((await pedir('GET', '/driver/profile', { token: tokCliente })).status === 401, 'el token del pasajero se rechaza');
    check((await pedir('GET', '/driver/profile', { token: s.shareToken })).status === 401, 'el enlace de compartir también');
    check((await pedir('GET', '/driver/profile', { token: tokConductor })).status === 200, 'el del conductor entra');

    // ── 5. «¿Todo bien?» ─────────────────────────────────────────────────────
    console.log('\n[5] La respuesta al «¿Todo bien?»');
    const alerta = await prisma.safetyAlertLog.create({
      data: { kind: 'stall', driverId: conductor.id, driverName: 'Ramón', serviceKind: 'trip', serviceId: viaje.id, detail: 'detenido' },
    });
    limpiar.push(() => prisma.safetyAlertLog.delete({ where: { id: alerta.id } }));
    const tokOtro = await entrarCliente(telOtro);
    const ajena = await pedir('POST', `/client/trips/${viaje.id}/safety-check`, { token: tokOtro, body: { ok: false } });
    check(ajena.status === 404, 'otro pasajero no puede contestar por él');
    const ayuda = await pedir('POST', `/client/trips/${viaje.id}/safety-check`, { token: tokCliente, body: { ok: false } });
    check(datos<{ registrada: boolean }>(ayuda)?.registrada === true, 'su respuesta se registra');
    const fila = await prisma.safetyAlertLog.findUnique({ where: { id: alerta.id } });
    check(fila?.passengerResponse === 'ayuda' && fila.respondedAt != null, 'la alerta dice «pidió ayuda»', fila?.passengerResponse);

    // ── 5b. El botón de pánico llega a la Torre de Control ───────────────────
    //
    // Antes el SOS solo escribía en `emergency_events`, que se mira a mano:
    // la tabla que la flota refresca cada 15 s no lo veía NUNCA.
    console.log('\n[5b] El botón de pánico llega a la Torre de Control');
    const alertasSos = () => prisma.safetyAlertLog.findMany({
      where: { kind: 'sos', serviceId: viaje.id },
    });
    const esperarSos = async (): Promise<number> => {
      // `_pushAlert` persiste sin `await` para no frenar el SOS.
      for (let i = 0; i < 20; i++) {
        const n = (await alertasSos()).length;
        if (n > 0) return n;
        await new Promise((r) => setTimeout(r, 100));
      }
      return 0;
    };

    // LA CONTRAPRUEBA PRIMERO: compartir el viaje con un familiar pasa por la
    // misma ruta. Si eso levantara una alerta, el panel se llenaría de falsas
    // emergencias hasta que nadie lo mire.
    const compartir = await pedir('POST', '/safety/sos', {
      token: tokCliente,
      body: { tripId: viaje.id, lat: 7.3754, lng: -72.6486, type: 'SHARE' },
    });
    check(compartir.status === 201, 'compartir el viaje se registra', compartir.status);
    await new Promise((r) => setTimeout(r, 400));
    check((await alertasSos()).length === 0, 'y NO levanta una emergencia');

    const panico = await pedir('POST', '/safety/sos', {
      token: tokCliente,
      body: { tripId: viaje.id, lat: 7.3754, lng: -72.6486, type: 'PANIC' },
    });
    check(panico.status === 201, 'el botón de pánico responde', panico.status);
    check((await esperarSos()) === 1, 'y levanta UNA alerta en la Torre de Control');
    const sos = (await alertasSos())[0];
    check(sos?.driverId === conductor.id, 'colgada del conductor del viaje', sos?.driverId);
    check(/PASAJERO/.test(sos?.detail ?? ''), 'dice quién la apretó', sos?.detail);
    limpiar.push(() => prisma.safetyAlertLog.deleteMany({ where: { kind: 'sos', serviceId: viaje.id } }));

    // Termina: la vista pública deja de dar posición aunque sea fresca.
    await prisma.driver.update({ where: { id: conductor.id }, data: { lastSeenAt: new Date() } });
    await pedir('POST', `/driver/trips/${viaje.id}/status`, { token: tokConductor, body: { status: 'completed' } });
    vista = datos<Record<string, unknown>>(await pedir('GET', `/safety/track/${s.shareToken}`));
    check(vista?.status === 'COMPLETED' && vista?.driverPosition === undefined, 'terminado, ya no dice dónde está el carro', vista?.status);

    // ── 6. Clave personal del conductor ──────────────────────────────────────
    console.log('\n[6] Clave personal del conductor');
    let r = await loginConductor(telConductor);
    check(datos<{ pinSetupRequired?: boolean }>(r)?.pinSetupRequired === true, 'sin clave, el login pide crearla');
    const tok = datos<{ token: string }>(r).token;
    check((await pedir('PUT', '/driver/clave', { token: tok, body: { nueva: '1234' } })).status === 400, '«1234» se rechaza');
    check((await pedir('PUT', '/driver/clave', { token: tok, body: { nueva: '4827' } })).status === 200, 'una clave buena se guarda');
    const dbClave = await prisma.driver.findUnique({ where: { id: conductor.id }, select: { loginPinHash: true } });
    check(!!dbClave?.loginPinHash && !dbClave.loginPinHash.includes('4827'), 'se guarda con hash, no en claro');
    const cambioMalo = await pedir('PUT', '/driver/clave', { token: tok, body: { nueva: '5918', actual: '0000' } });
    check(cambioMalo.status === 403, 'cambiarla con la actual equivocada es 403 (no 401: no saca de la app)', cambioMalo.status);

    r = await loginConductor(telConductor);
    const paso = datos<{ needsPin?: boolean; pinTicket?: string; token?: string }>(r);
    check(paso?.needsPin === true && !!paso.pinTicket && !paso.token, 'con clave, el código solo NO da sesión');
    const mal = await pedir('POST', '/auth/verify-pin', { body: { pinTicket: paso.pinTicket, pin: '9999' } });
    check(mal.status === 403 && mal.json.code === 'clave_incorrecta', 'clave equivocada: rechazo claro', mal.json);
    const bien = await pedir('POST', '/auth/verify-pin', { body: { pinTicket: paso.pinTicket, pin: '4827' } });
    check(!!datos<{ token?: string }>(bien)?.token, 'con la clave correcta, entra');
    check(datos<{ pinSetupRequired?: boolean }>(bien)?.pinSetupRequired === undefined, 'y ya no le pide crearla');
    const unPaso = await loginConductor(telConductor, '4827');
    check(!!datos<{ token?: string }>(unPaso)?.token, 'también en un solo paso (código + clave)');

    // Cinco fallos bloquean, incluso para la correcta.
    r = await loginConductor(telConductor);
    const pase2 = datos<{ pinTicket: string }>(r).pinTicket;
    for (let i = 0; i < 5; i++) await pedir('POST', '/auth/verify-pin', { body: { pinTicket: pase2, pin: '1357' } });
    const bloqueada = await pedir('POST', '/auth/verify-pin', { body: { pinTicket: pase2, pin: '4827' } });
    check(bloqueada.status === 429 && bloqueada.json.code === 'clave_bloqueada', 'tras cinco fallos queda bloqueada, aun con la buena', bloqueada.json);

    // El admin la restablece.
    await pedir('POST', '/admin/auth/send-otp', { body: { phone: ADMIN } });
    const adm = await pedir('POST', '/admin/auth/verify-otp', { body: { phone: ADMIN, otp: OTP } });
    const tokAdmin = datos<{ token: string }>(adm)?.token;
    const reset = await pedir('POST', '/admin/clave-personal/reset', { token: tokAdmin, body: { phone: telConductor } });
    check(datos<{ conductores: number }>(reset)?.conductores === 1, 'el admin la restablece', reset.json);
    r = await loginConductor(telConductor);
    check(!!datos<{ token?: string }>(r)?.token && datos<{ pinSetupRequired?: boolean }>(r)?.pinSetupRequired === true,
      'tras restablecerla entra y le pide crear una nueva');
    check((await pedir('POST', '/admin/clave-personal/reset', { body: { phone: telConductor } })).status === 401,
      'restablecer sin sesión de admin no se puede');

    // ── 7. Empresa ───────────────────────────────────────────────────────────
    console.log('\n[7] Clave personal en el portal de empresa');
    const telEmpresa = `+5730014${n}`;
    const op = await prisma.operator.create({
      data: { legalName: `Cootrans Clave ${n}`, nit: `NIT-${Date.now()}`, type: 'TAXI', status: 'ACTIVE', isVerified: true,
        members: { create: { phone: telEmpresa, role: 'OWNER' } } },
    });
    limpiar.push(async () => {
      await prisma.operatorMember.deleteMany({ where: { operatorId: op.id } });
      await prisma.operator.delete({ where: { id: op.id } });
    });
    const loginEmpresa = async () => {
      await sembrarCodigo(telEmpresa);
      return pedir('POST', '/operator/auth/verify-otp', { body: { phone: telEmpresa, otp: OTP } });
    };
    r = await loginEmpresa();
    const tokEmp = datos<{ token: string; pinSetupRequired?: boolean }>(r);
    check(tokEmp?.pinSetupRequired === true, 'sin clave, el portal la pide');
    const claveEmp = await pedir('GET', '/operator/clave', { token: tokEmp.token });
    check(datos<{ tiene: boolean; exigible: boolean }>(claveEmp)?.exigible === true, 'el portal sabe que es exigible');
    check((await pedir('PUT', '/operator/clave', { token: tokEmp.token, body: { nueva: '6042' } })).status === 200, 'la crea');
    r = await loginEmpresa();
    const paseEmp = datos<{ needsPin?: boolean; pinTicket?: string }>(r);
    check(paseEmp?.needsPin === true, 'el siguiente ingreso la pide');
    const entra = await pedir('POST', '/operator/auth/verify-pin', { body: { pinTicket: paseEmp.pinTicket, pin: '6042' } });
    check(!!datos<{ token?: string }>(entra)?.token, 'con la clave, entra al portal');
    const paseConductorEnEmpresa = await pedir('POST', '/operator/auth/verify-pin', { body: { pinTicket: pase2, pin: '4827' } });
    check(paseConductorEnEmpresa.status === 401, 'un pase de conductor no sirve en el portal de empresa');

    // ── 8. Negocio ───────────────────────────────────────────────────────────
    console.log('\n[8] Recuperar el enlace del negocio');
    const telNegocio = `+5730015${n}`;
    const biz = await prisma.business.create({
      data: { name: `Arepas Clave ${n}`, address: 'Calle 5', category: 'RESTAURANT', token: `tok-clave-${n}`, phone: telNegocio },
    });
    limpiar.push(() => prisma.business.delete({ where: { id: biz.id } }));
    const recuperar = async () => {
      await sembrarCodigo(telNegocio);
      return pedir('POST', '/business/recover/verify-otp', { body: { phone: telNegocio, otp: OTP } });
    };
    r = await recuperar();
    check(datos<{ businesses: unknown[]; pinSetupRequired?: boolean }>(r)?.pinSetupRequired === true,
      'sin clave, lo entrega pero avisa que la cree');
    check((await pedir('PUT', `/business/${biz.token}/clave`, { body: { nueva: '7315' } })).status === 200, 'el dueño crea su clave');
    r = await recuperar();
    const paseNeg = datos<{ needsPin?: boolean; pinTicket?: string; businesses?: unknown }>(r);
    check(paseNeg?.needsPin === true && paseNeg.businesses === undefined, 'con clave, el código solo NO entrega el enlace');
    const negMal = await pedir('POST', '/business/recover/verify-pin', { body: { pinTicket: paseNeg.pinTicket, pin: '1111' } });
    check(negMal.status === 403, 'clave equivocada no entrega nada', negMal.json);
    const negBien = await pedir('POST', '/business/recover/verify-pin', { body: { pinTicket: paseNeg.pinTicket, pin: '7315' } });
    const links = datos<{ businesses: Array<{ portalUrl: string }> }>(negBien)?.businesses ?? [];
    check(links.length === 1 && links[0]!.portalUrl.endsWith(`/negocio/${biz.token}`), 'con la clave, entrega su enlace', negBien.json);
  } catch (e) {
    fallos++;
    console.error('ERROR', e);
    console.error(((servidor as ChildProcess & { registros: string[] }).registros ?? []).slice(-30).join(''));
  } finally {
    await prisma.trip.deleteMany({ where: { passenger: { phone: { in: [telCliente, telOtro] } } } }).catch(() => {});
    await prisma.driverEarning.deleteMany({ where: { driver: { phone: telConductor } } }).catch(() => {});
    for (const f of limpiar.reverse()) await f().catch(() => {});
    await prisma.otpSession.deleteMany({ where: { phone: { startsWith: '+57300' }, code: OTP } }).catch(() => {});
    await prisma.vehicle.deleteMany({ where: { driver: { phone: telConductor } } }).catch(() => {});
    await prisma.driver.deleteMany({ where: { phone: telConductor } }).catch(() => {});
    await prisma.user.deleteMany({ where: { phone: { in: [telCliente, telOtro] } } }).catch(() => {});
    try { process.kill(-servidor.pid!, 'SIGTERM'); } catch { /* ya murió */ }
    await prisma.$disconnect();
  }

  console.log(`\n${ok} bien, ${fallos} mal`);
  process.exit(fallos > 0 ? 1 : 0);
}

void main();
