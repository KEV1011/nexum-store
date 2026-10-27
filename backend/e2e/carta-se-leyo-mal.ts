/**
 * «Se leyó mal»: la carta que el dueño reporta queda guardada para volverla
 * una prueba. Contra PostgreSQL real y por HTTP.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *   • Que el reporte recoja la lectura de ESA foto (lo que salió), aunque el
 *     dueño lo mande minutos después de mirar la vista previa.
 *   • Que otro negocio con el mismo código de lectura no se lleve la carta de
 *     nadie.
 *   • Que el admin la liste y la descargue, y que sin sesión de admin no.
 *   • Que reportar no toque el catálogo.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/carta-se-leyo-mal.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3121);
const BASE = `http://localhost:${PUERTO}`;
const OTP = '123456';
const ADMIN = '+573009998877';

let ok = 0;
let fallos = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

type Res = { status: number; json: { success?: boolean; data?: unknown; error?: string } };
async function leer(r: Response): Promise<Res> {
  let json: Res['json'] = {};
  try { json = (await r.json()) as Res['json']; } catch { /* sin JSON */ }
  return { status: r.status, json };
}
const datos = <T>(r: Res) => r.json.data as T;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const foto = () => new Blob([new Uint8Array(PNG_1X1)], { type: 'image/png' });

async function subirCarta(token: string): Promise<Res> {
  const form = new FormData();
  form.append('file', foto(), 'carta.png');
  return leer(await fetch(`${BASE}/business/${token}/products/carta-foto`, { method: 'POST', body: form }));
}

async function reportar(token: string, campos: { lecturaId?: string; comentario?: string; conFoto?: boolean }): Promise<Res> {
  const form = new FormData();
  if (campos.conFoto !== false) form.append('file', foto(), 'carta.png');
  if (campos.lecturaId) form.append('lecturaId', campos.lecturaId);
  form.append('comentario', campos.comentario ?? '');
  return leer(await fetch(`${BASE}/business/${token}/products/carta-reporte`, { method: 'POST', body: form }));
}

async function json(metodo: string, ruta: string, body?: unknown, token?: string): Promise<Res> {
  return leer(await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }));
}

async function arrancar(): Promise<ChildProcess> {
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
      CARTA_OCR_PROVIDER: 'fake',
      OTP_DEV_CODE: OTP,
      OTP_FALLBACK_CODE: OTP,
      ADMIN_PHONES: ADMIN,
      RATE_LIMIT_AUTH: '5000',
      JWT_SECRET: process.env['JWT_SECRET'] ?? 'e2e-secreto-largo-para-firmar-0123456789',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const registros: string[] = [];
  hijo.stdout?.on('data', (b: Buffer) => registros.push(b.toString()));
  hijo.stderr?.on('data', (b: Buffer) => registros.push(b.toString()));
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { if ((await fetch(`${BASE}/health`)).ok) return hijo; } catch { /* aún no */ }
  }
  console.error(registros.join(''));
  throw new Error('el servidor no arrancó');
}

function matar(s: ChildProcess) {
  try { if (s.pid) process.kill(-s.pid, 'SIGKILL'); } catch { s.kill('SIGKILL'); }
}

async function main() {
  const marca = `e2ereporte-${Date.now()}`;
  const crear = (n: string) => prisma.business.create({
    data: {
      name: `${marca} ${n}`, ownerName: 'Dueño', phone: `+57300${Math.floor(1e6 + Math.random() * 8e6)}`,
      address: 'Calle 5 # 3-40', category: 'RESTAURANT', token: `tok-${marca}-${n}`,
    },
  });
  const bar = await crear('Bar');
  const otro = await crear('Otro');

  const servidor = await arrancar();
  try {
    console.log('\n[1] La lectura trae su código');
    const lectura = await subirCarta(bar.token);
    const lecturaId = datos<{ lecturaId?: string }>(lectura)?.lecturaId ?? '';
    check(lectura.status === 200 && /^[0-9a-f]{24}$/.test(lecturaId), 'la vista previa devuelve un código de lectura', lectura.json);
    const filasLeidas = datos<{ lineas: unknown[] }>(lectura).lineas.length;

    console.log('\n[2] El dueño dice que se leyó mal');
    const r = await reportar(bar.token, { lecturaId, comentario: 'Los shots salieron sin precio' });
    check(r.status === 201, 'se guarda (201)', r.json);
    const fila = await prisma.cartaReporte.findUnique({ where: { id: datos<{ id: string }>(r).id } });
    check(fila?.businessId === bar.id, 'queda a nombre de su negocio');
    check(!!fila?.photoUrl, 'con la foto', fila?.photoUrl);
    check(fila?.comentario === 'Los shots salieron sin precio', 'con lo que dijo el dueño', fila?.comentario);
    const guardadas = (fila?.lectura as { lineas?: unknown[] } | null)?.lineas?.length;
    check(guardadas === filasLeidas, 'y con lo que salió de ESA lectura', { guardadas, filasLeidas });

    console.log('\n[3] Otro negocio con el mismo código no se lleva la carta');
    const ajeno = await reportar(otro.token, { lecturaId, comentario: 'intento' });
    const filaAjena = await prisma.cartaReporte.findUnique({ where: { id: datos<{ id: string }>(ajeno).id } });
    check(ajeno.status === 201 && filaAjena?.businessId === otro.id, 'su reporte queda a SU nombre');
    check(filaAjena?.lectura == null && filaAjena?.ocrRaw == null, 'sin la lectura del otro negocio', filaAjena?.lectura);

    console.log('\n[4] Sin foto ni código también se guarda (lo que diga el dueño sirve)');
    const solo = await reportar(bar.token, { comentario: 'la nota quedó como plato', conFoto: false });
    check(solo.status === 201, 'se guarda igual', solo.json);

    console.log('\n[5] El admin lo ve y lo descarga; sin sesión, no');
    check((await json('GET', '/admin/carta-reportes')).status === 401, 'sin sesión de admin: 401');
    await json('POST', '/admin/auth/send-otp', { phone: ADMIN });
    // En desarrollo el panel usa el código de desarrollo (`_adminCode`).
    const adm = await json('POST', '/admin/auth/verify-otp', { phone: ADMIN, otp: OTP });
    const tokAdmin = datos<{ token?: string }>(adm)?.token ?? '';
    check(!!tokAdmin, 'el admin entra', adm.json);
    const lista = await json('GET', '/admin/carta-reportes', undefined, tokAdmin);
    const suyos = datos<Array<{ id: string; negocio: string; comentario: string | null; filas: number }>>(lista)
      .filter((x) => x.negocio.startsWith(marca));
    check(suyos.length === 3, 'aparecen los tres reportes', suyos.length);
    const prueba = await json('GET', `/admin/carta-reportes/${datos<{ id: string }>(r).id}/prueba.json`, undefined, tokAdmin);
    const p = datos<{ comentario: string; lectura: { lineas: unknown[] }; negocio: string }>(prueba);
    check(prueba.status === 200 && p.comentario === 'Los shots salieron sin precio' && p.lectura.lineas.length === filasLeidas,
      'la prueba descargada trae lo que salió y lo que dijo el dueño', prueba.json);
    check((await json('GET', '/admin/carta-reportes/no-existe/prueba.json', undefined, tokAdmin)).status === 404, 'uno que no existe: 404');

    console.log('\n[6] Reportar no toca el catálogo');
    check(await prisma.product.count({ where: { businessId: { in: [bar.id, otro.id] } } }) === 0, 'ningún producto creado');

    console.log('\n[7] Es para avisar, no para subir fotos sin fin');
    let ultimo = 0;
    for (let i = 0; i < 9; i++) ultimo = (await reportar(bar.token, { comentario: `n${i}`, conFoto: false })).status;
    check(ultimo === 429, 'pasado el tope de la hora: 429', ultimo);
  } finally {
    matar(servidor);
    await prisma.cartaReporte.deleteMany({ where: { businessId: { in: [bar.id, otro.id] } } });
    await prisma.business.deleteMany({ where: { id: { in: [bar.id, otro.id] } } });
  }

  console.log(`\n${ok} bien · ${fallos} mal`);
  await prisma.$disconnect();
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
