/**
 * Quién manda el envío y qué declara, contra PostgreSQL real y por HTTP.
 *
 * EL HUECO QUE ESTO CIERRA. Un envío guardaba el nombre de la CUENTA y una
 * descripción de texto libre. Si abrían el vehículo en la carretera y
 * dentro había algo que no debería ir, la plataforma no podía decir quién
 * lo entregó ni qué dijo que era — y responde quien maneja. Operando en
 * Norte de Santander eso no es un hueco de producto, es exposición penal.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *  1. **Se guarda de verdad y llega al CONDUCTOR.** De nada sirve una
 *     constancia que el que carga el camión no puede leer: es él quien
 *     tiene que contrastar el documento con la persona que tiene enfrente.
 *  2. **Sin aceptar la lista no hay envío declarado.** Guardar categoría y
 *     valor sin la aceptación deja la constancia a medias, que es la que
 *     no sirve en un reclamo.
 *  3. **Una app VIEJA sigue enviando.** Es lo que impide que esta tanda
 *     deje sin servicio a quien no ha actualizado.
 *  4. **Con el interruptor encendido sí se exige**, y el motivo lo dice.
 *  5. **Un viaje de PASAJEROS no guarda remitente** aunque la app lo mande:
 *     una «declaración de contenido» en una carrera de taxi haría que el
 *     registro afirmara algo que no pasó.
 *  6. **La lista se puede leer sin sesión**, que es la única forma de que
 *     alguien la lea ANTES de enviar.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/remitente-y-declaracion.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';
import { VERSION_LISTA_NO_ADMITIDA } from '../src/lib/remitente';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3133);
const BASE = `http://localhost:${PUERTO}`;
const OTP = '424242';
const ORIGEN = { lat: 7.3754, lng: -72.6486 };
const DESTINO = { lat: 7.3800, lng: -72.6400 };

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

async function arrancarServidor(exigir: boolean): Promise<ChildProcess> {
  try {
    const ocupado = await fetch(`${BASE}/health`);
    if (ocupado.ok) {
      throw new Error(`el puerto ${PUERTO} ya está ocupado. Mátalo (fuser -k ${PUERTO}/tcp).`);
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
      ENVIO_EXIGIR_REMITENTE: exigir ? 'true' : 'false',
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

function matar(s: ChildProcess) {
  try {
    if (s.pid) process.kill(-s.pid, 'SIGKILL');
  } catch { s.kill('SIGKILL'); }
}

async function entrarComoCliente(telefono: string, nombre: string): Promise<string> {
  await pedir('POST', '/client/auth/send-otp', { body: { phone: telefono } });
  const r = await pedir('POST', '/client/auth/verify-otp', {
    body: { phone: telefono, otp: OTP, name: nombre },
  });
  const data = r.json.data as { token?: string } | undefined;
  if (!data?.token) throw new Error(`cliente no pudo entrar: ${JSON.stringify(r.json)}`);
  return data.token;
}

const suf = Math.floor(10000 + Math.random() * 89999);
const telCliente = `+5730095${suf}`;
// Segundo cliente: el límite antifraude es POR cuenta y toda esta prueba
// crea solicitudes seguidas. Sin separarlo, el 429 se confundiría con un
// rechazo del remitente.
const telFletero = `+5730096${suf}`;

const REMITENTE = {
  tipoDoc: 'CC',
  documento: '1.090.123-456',
  nombre: 'Jorge Bodeguero',
  telefono: '+573001112233',
};
const DECLARACION = {
  categoria: 'repuestos',
  valorDeclarado: 1_800_000,
  aceptaRestricciones: true,
};

const ENVIO_BASE = {
  serviceType: 'envios',
  originAddress: 'Bodega centro',
  destinationAddress: 'Calle 9 # 2-15',
  originLat: ORIGEN.lat, originLng: ORIGEN.lng,
  destLat: DESTINO.lat, destLng: DESTINO.lng,
  recipientName: 'Ana Gómez',
  recipientPhone: '+573002223344',
  packageDescription: 'Caja de repuestos',
  paymentMethod: 'efectivo',
};

const FLETE_BASE = {
  originAddress: 'Bodega Cúcuta',
  destAddress: 'Bodega Bucaramanga',
  originCity: 'cucuta',
  destCity: 'bucaramanga',
  cargoDescription: 'Rollos de tela',
  weightKg: 4000,
  vehicleType: 'TURBO',
  offeredPrice: 900000,
};

async function main() {
  // ── Fase A: interruptor APAGADO (como está hoy en producción) ───────────
  let servidor = await arrancarServidor(false);
  const creados: string[] = [];
  const fletes: string[] = [];
  let clienteId = '';
  let fleteroId = '';

  try {
    const token = await entrarComoCliente(telCliente, 'Remitente E2E');
    clienteId = (await prisma.user.findUnique({ where: { phone: telCliente } }))?.id ?? '';
    const tokenFletero = await entrarComoCliente(telFletero, 'Fletero E2E');
    fleteroId = (await prisma.user.findUnique({ where: { phone: telFletero } }))?.id ?? '';

    // ── 1. La lista se lee SIN sesión ──────────────────────────────────────
    console.log('\n[1] La lista de lo que no se transporta');
    const lista = await pedir('GET', '/legal/envios');
    const datos = lista.json.data as {
      versionLista?: number;
      noAdmitido?: Array<{ que: string; porque: string }>;
      categorias?: Array<{ valor: string; etiqueta: string }>;
    } | undefined;
    check(lista.status === 200, 'se lee sin token', { status: lista.status });
    check((datos?.noAdmitido?.length ?? 0) > 5,
      'trae los renglones', datos?.noAdmitido?.length);
    check(datos?.noAdmitido?.every((r) => r.porque.length > 20) === true,
      'cada uno dice POR QUÉ, no solo «prohibido»');
    check(datos?.versionLista === VERSION_LISTA_NO_ADMITIDA,
      'con su versión, que es lo que hace comprobable la constancia', datos?.versionLista);
    check((datos?.categorias?.length ?? 0) > 5,
      'y el catálogo con el que se declara sale del servidor', datos?.categorias?.length);

    // ── 2. El envío con remitente ──────────────────────────────────────────
    console.log('\n[2] El envío urbano: quién lo entrega y qué declara');
    const antes = new Date();
    const envio = await pedir('POST', '/client/trips/request', {
      token,
      body: { ...ENVIO_BASE, remitente: REMITENTE, declaracion: DECLARACION },
    });
    const creado = envio.json.data as { id?: string; senderName?: string } | undefined;
    check(envio.status === 201, 'el envío se crea', { status: envio.status, err: envio.json.error });
    if (creado?.id) creados.push(creado.id);

    const enBD = await prisma.trip.findUnique({ where: { id: creado?.id ?? '' } });
    check(enBD?.senderName === 'Jorge Bodeguero',
      'queda quién entregó', enBD?.senderName);
    check(enBD?.senderDocNumber === '1090123456',
      'con el documento limpio de puntos y guiones', enBD?.senderDocNumber);
    check(enBD?.cargoCategory === 'repuestos' && enBD?.declaredValue === 1_800_000,
      'y qué declaró que va dentro',
      { cat: enBD?.cargoCategory, valor: enBD?.declaredValue });
    check(enBD?.cargoTermsVersion === VERSION_LISTA_NO_ADMITIDA,
      'sellando la versión de la lista que se le mostró', enBD?.cargoTermsVersion);
    check(!!enBD?.declaredAt && enBD.declaredAt >= antes,
      'y la hora la pone el servidor, no el teléfono', enBD?.declaredAt);

    // ── 3. Llega a quien carga ─────────────────────────────────────────────
    console.log('\n[3] El conductor que recoge puede contrastar el documento');
    const visto = creado as Record<string, unknown> | undefined;
    check(visto?.['senderName'] === 'Jorge Bodeguero',
      'el DTO del viaje trae el remitente', visto?.['senderName']);
    check(visto?.['senderDocType'] === 'CC' && visto?.['senderDocNumber'] === '1090123456',
      'con su documento', { t: visto?.['senderDocType'], d: visto?.['senderDocNumber'] });
    check(visto?.['cargoCategoryLabel'] === 'Repuestos y autopartes',
      'y la categoría en español, redactada por el servidor',
      visto?.['cargoCategoryLabel']);

    // ── 4. Sin aceptar la lista, no hay envío declarado ────────────────────
    console.log('\n[4] Quien no acepta la lista');
    const sinAceptar = await pedir('POST', '/client/trips/request', {
      token,
      body: {
        ...ENVIO_BASE,
        remitente: REMITENTE,
        declaracion: { categoria: 'repuestos', valorDeclarado: 500000 },
      },
    });
    check(sinAceptar.status === 400, 'se rechaza', { status: sinAceptar.status });
    check((sinAceptar.json.error ?? '').toLowerCase().includes('acepta'),
      'diciendo que hay que aceptarla', sinAceptar.json.error);

    const categoriaInventada = await pedir('POST', '/client/trips/request', {
      token,
      body: { ...ENVIO_BASE, remitente: REMITENTE, declaracion: { categoria: 'cositas', aceptaRestricciones: true } },
    });
    check(categoriaInventada.status === 400,
      'y una categoría inventada tampoco entra', { status: categoriaInventada.status });

    const medioRemitente = await pedir('POST', '/client/trips/request', {
      token,
      body: { ...ENVIO_BASE, remitente: { nombre: 'Jorge' }, declaracion: DECLARACION },
    });
    check(medioRemitente.status === 400,
      'un remitente sin documento se rechaza: parece identificación y no lo es',
      { status: medioRemitente.status, err: medioRemitente.json.error });

    // ── 5. La app vieja sigue enviando ─────────────────────────────────────
    console.log('\n[5] El cliente con el APK de hace dos meses');
    const viejo = await pedir('POST', '/client/trips/request', { token, body: ENVIO_BASE });
    const vCreado = viejo.json.data as { id?: string } | undefined;
    check(viejo.status === 201,
      'su envío se crea igual', { status: viejo.status, err: viejo.json.error });
    if (vCreado?.id) creados.push(vCreado.id);
    const vBD = await prisma.trip.findUnique({ where: { id: vCreado?.id ?? '' } });
    check(vBD?.senderName === null && vBD?.declaredAt === null,
      'sin inventar un remitente ni una declaración que nadie hizo',
      { n: vBD?.senderName, d: vBD?.declaredAt });

    // ── 6. Un viaje de PASAJEROS no guarda remitente ───────────────────────
    console.log('\n[6] Una carrera de taxi');
    const taxi = await pedir('POST', '/client/trips/request', {
      token,
      body: {
        serviceType: 'taxi',
        originAddress: 'Parque', destinationAddress: 'Terminal',
        originLat: ORIGEN.lat, originLng: ORIGEN.lng,
        destLat: DESTINO.lat, destLng: DESTINO.lng,
        paymentMethod: 'efectivo',
        // Una app confundida lo manda; no es culpa del pasajero.
        remitente: REMITENTE, declaracion: DECLARACION,
      },
    });
    const tCreado = taxi.json.data as { id?: string } | undefined;
    check(taxi.status === 201, 'se crea sin rechazarla', { status: taxi.status, err: taxi.json.error });
    if (tCreado?.id) creados.push(tCreado.id);
    const tBD = await prisma.trip.findUnique({ where: { id: tCreado?.id ?? '' } });
    check(tBD?.senderName === null && tBD?.cargoCategory === null && tBD?.declaredAt === null,
      'y NO guarda una declaración de contenido: en un taxi no hay nada que declarar',
      { n: tBD?.senderName, c: tBD?.cargoCategory });

    // ── 7. El flete de carga ───────────────────────────────────────────────
    console.log('\n[7] El flete de carga');
    const flete = await pedir('POST', '/client/freight/request', {
      token: tokenFletero,
      body: { ...FLETE_BASE, remitente: REMITENTE, declaracion: { categoria: 'ropa_calzado', aceptaRestricciones: true, valorDeclarado: 40_000_000 } },
    });
    const fCreado = flete.json.data as Record<string, unknown> | undefined;
    check(flete.status === 201, 'se publica', { status: flete.status, err: flete.json.error });
    if (typeof fCreado?.['id'] === 'string') fletes.push(fCreado['id']);
    check(fCreado?.['senderName'] === 'Jorge Bodeguero',
      'la flota ve quién entrega antes de decidir si lo toma', fCreado?.['senderName']);
    check(fCreado?.['cargoCategoryLabel'] === 'Ropa y calzado',
      'y qué dice que es', fCreado?.['cargoCategoryLabel']);
    const fBD = await prisma.freightRequest.findUnique({ where: { id: String(fCreado?.['id'] ?? '') } });
    check(fBD?.senderDocNumber === '1090123456' && fBD?.declaredValue === 40_000_000,
      'guardado en la base', { d: fBD?.senderDocNumber, v: fBD?.declaredValue });

    const fleteTope = await pedir('POST', '/client/freight/request', {
      token: tokenFletero,
      body: { ...FLETE_BASE, remitente: REMITENTE, declaracion: { categoria: 'ropa_calzado', aceptaRestricciones: true, valorDeclarado: 9_000_000_000 } },
    });
    check(fleteTope.status === 400,
      'un cero de más en el valor se rechaza', { status: fleteTope.status, err: fleteTope.json.error });

    const fleteViejo = await pedir('POST', '/client/freight/request', { token: tokenFletero, body: FLETE_BASE });
    check(fleteViejo.status === 201,
      'y la flota con app vieja sigue publicando', { status: fleteViejo.status });
    const fvId = (fleteViejo.json.data as { id?: string } | undefined)?.id;
    if (fvId) fletes.push(fvId);

    // ── /health lo publica ─────────────────────────────────────────────────
    const salud = await (await fetch(`${BASE}/health`)).json() as Record<string, unknown>;
    check(salud['envioConRemitente'] === 'apagado',
      '/health dice que el interruptor está apagado', salud['envioConRemitente']);
  } finally {
    if (fallos > 0) {
      const regs = (servidor as ChildProcess & { registros?: string[] }).registros ?? [];
      console.log('\n── Registros ──\n' + regs.join('').slice(-3000));
    }
    matar(servidor);
  }

  // ── Fase B: interruptor ENCENDIDO ────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 1200));
  servidor = await arrancarServidor(true);
  try {
    console.log('\n[8] Con la exigencia encendida');
    const token = await entrarComoCliente(telCliente, 'Remitente E2E');
    const sinNada = await pedir('POST', '/client/trips/request', { token, body: ENVIO_BASE });
    check(sinNada.status === 400,
      'el envío sin remitente se rechaza', { status: sinNada.status });
    check((sinNada.json.error ?? '').toLowerCase().includes('documento'),
      'diciendo qué falta', sinNada.json.error);

    const conTodo = await pedir('POST', '/client/trips/request', {
      token, body: { ...ENVIO_BASE, remitente: REMITENTE, declaracion: DECLARACION },
    });
    check(conTodo.status === 201,
      'y con remitente y declaración sí entra', { status: conTodo.status, err: conTodo.json.error });
    const cId = (conTodo.json.data as { id?: string } | undefined)?.id;
    if (cId) creados.push(cId);

    const tokenF = await entrarComoCliente(telFletero, 'Fletero E2E');
    const fleteSin = await pedir('POST', '/client/freight/request', { token: tokenF, body: FLETE_BASE });
    check(fleteSin.status === 400,
      'el flete sin remitente también', { status: fleteSin.status, err: fleteSin.json.error });

    const salud = await (await fetch(`${BASE}/health`)).json() as Record<string, unknown>;
    check(salud['envioConRemitente'] === 'activo',
      '/health lo refleja', salud['envioConRemitente']);
  } finally {
    if (fallos > 0) {
      const regs = (servidor as ChildProcess & { registros?: string[] }).registros ?? [];
      console.log('\n── Registros ──\n' + regs.join('').slice(-3000));
    }
    matar(servidor);
  }

  // ── Limpieza ─────────────────────────────────────────────────────────────
  if (fletes.length > 0) await prisma.freightRequest.deleteMany({ where: { id: { in: fletes } } });
  for (const id of [clienteId, fleteroId].filter(Boolean)) {
    await prisma.freightRequest.deleteMany({ where: { clientId: id } });
    await prisma.trip.deleteMany({ where: { passengerId: id } });
    await prisma.user.delete({ where: { id } }).catch(() => undefined);
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
