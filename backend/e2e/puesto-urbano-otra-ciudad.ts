/**
 * «Ver otra ciudad» en los puestos de taxi, POR HTTP y contra PostgreSQL real.
 *
 * POR QUÉ POR HTTP Y NO LLAMANDO AL SERVICIO. `e2e/puesto-urbano.ts` llama a
 * `buscarPuestosUrbanos` directamente, así que no toca el manejador de la ruta
 * — y el defecto de esta tanda vivía EXACTAMENTE ahí: el parámetro `ciudad` se
 * aceptaba sin validar y el nombre que la pantalla enseña salía del slug. Es el
 * mismo sitio donde se escondió el bug del mapa de sillas, que hacía imposible
 * comprar una silla desde la app mientras las pruebas del servicio pasaban en
 * verde.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *   • Que elegir la ciudad a mano devuelva su NOMBRE («Villa del Rosario») y no
 *     su slug («villa-del-rosario»), que es lo que la app pinta en el chip.
 *   • Que un municipio inventado se rechace diciéndolo, en vez de devolver una
 *     lista vacía — que en pantalla se lee como «no hay ningún taxi por
 *     puestos», acusando al servicio de algo que no pasa.
 *   • Que la ciudad elegida MANDE sobre las coordenadas. Si ganaran las
 *     coordenadas, la persona pediría una ciudad y vería otra, sin que nada en
 *     pantalla lo delatara.
 *   • Que sin ciudad y sin coordenadas la respuesta siga siendo la de antes
 *     (`city: null`), porque de eso depende el aviso «todavía no estamos en tu
 *     ciudad» y las apps ya instaladas no mandan el parámetro nuevo.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/puesto-urbano-otra-ciudad.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3117);
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

type Respuesta = { city: string | null; cityName: string | null; trips: unknown[] };

async function main() {
  const servidor = await arrancarServidor();
  try {
    // Dos municipios reales. El segundo tiene el nombre con espacios y el slug
    // con guiones, que es justo el caso que delata el defecto.
    await prisma.municipality.upsert({
      where: { slug: 'pamplona' },
      update: {},
      create: {
        slug: 'pamplona', name: 'Pamplona',
        department: 'Norte de Santander', lat: 7.3754, lng: -72.6486,
      },
    });
    await prisma.municipality.upsert({
      where: { slug: 'villa-del-rosario' },
      update: {},
      create: {
        slug: 'villa-del-rosario', name: 'Villa del Rosario',
        department: 'Norte de Santander', lat: 7.8339, lng: -72.4733,
      },
    });

    const token = await entrarComoCliente('+573009995510');

    console.log('\n[1] La ciudad elegida a mano devuelve su NOMBRE, no el slug');
    const r1 = await pedir('GET', '/client/pool/urbano?ciudad=villa-del-rosario', { token });
    const d1 = r1.json.data as Respuesta | undefined;
    check(r1.status === 200, 'responde 200', r1.status);
    check(d1?.city === 'villa-del-rosario', 'el slug vuelve tal cual', d1?.city);
    check(
      d1?.cityName === 'Villa del Rosario',
      'el nombre es el de verdad y no el slug (es lo que pinta el chip)',
      d1?.cityName,
    );

    console.log('\n[2] Un municipio inventado se RECHAZA diciéndolo');
    // Devolver lista vacía sería peor que un error: en pantalla se lee como
    // «no hay ningún taxi por puestos», que acusa al servicio de algo que no
    // pasa y manda a la persona a esperar.
    const r2 = await pedir('GET', '/client/pool/urbano?ciudad=narnia', { token });
    check(r2.status === 400, 'responde 400 y no 200 con lista vacía', r2.status);
    check(
      typeof r2.json.error === 'string' && r2.json.error.length > 0,
      'y dice el motivo en español',
      r2.json.error,
    );

    console.log('\n[3] La ciudad elegida MANDA sobre las coordenadas');
    // Coordenadas de Pamplona + ciudad Villa del Rosario. Si ganaran las
    // coordenadas, la persona pediría una ciudad y vería otra.
    const r3 = await pedir(
      'GET',
      '/client/pool/urbano?ciudad=villa-del-rosario&lat=7.3754&lng=-72.6486',
      { token },
    );
    const d3 = r3.json.data as Respuesta | undefined;
    check(d3?.city === 'villa-del-rosario', 'gana la ciudad pedida', d3?.city);
    check(d3?.cityName === 'Villa del Rosario', 'y su nombre', d3?.cityName);

    console.log('\n[4] Sin ciudad, las coordenadas siguen resolviendo la plaza');
    const r4 = await pedir('GET', '/client/pool/urbano?lat=7.3754&lng=-72.6486', { token });
    const d4 = r4.json.data as Respuesta | undefined;
    check(d4?.city === 'pamplona', 'Pamplona por coordenadas', d4?.city);
    check(d4?.cityName === 'Pamplona', 'con su nombre', d4?.cityName);

    console.log('\n[5] Sin nada, la respuesta de antes — las apps instaladas no mandan ciudad');
    const r5 = await pedir('GET', '/client/pool/urbano', { token });
    const d5 = r5.json.data as Respuesta | undefined;
    check(r5.status === 200, 'sigue siendo 200 y no un error', r5.status);
    check(d5?.city === null, 'city viene en null', d5?.city);
    check(
      Array.isArray(d5?.trips) && d5.trips.length === 0,
      'y la lista vacía, que es de lo que depende el aviso de cobertura',
    );

    console.log('\n[6] En medio del mar no hay plaza, y no se inventa ninguna');
    const r6 = await pedir('GET', '/client/pool/urbano?lat=0&lng=-30', { token });
    const d6 = r6.json.data as Respuesta | undefined;
    check(d6?.city === null, 'city en null a 3.000 km de cualquier centroide', d6?.city);

    console.log(`\n${ok} comprobaciones bien, ${fallos} mal`);
    if (fallos > 0) {
      console.error('\nREGISTROS DEL SERVIDOR:');
      console.error((servidor as ChildProcess & { registros: string[] }).registros.join(''));
    }
    process.exitCode = fallos > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
    // Matar el GRUPO: `npx` lanza un node hijo que sobrevive al kill del padre
    // y deja el puerto ocupado, con lo que la corrida siguiente mediría un
    // servidor viejo.
    if (servidor.pid) { try { process.kill(-servidor.pid, 'SIGKILL'); } catch { /* ya murió */ } }
  }
}

void main();
