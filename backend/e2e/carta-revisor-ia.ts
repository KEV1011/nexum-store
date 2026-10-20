/**
 * El agente que revisa la carta, contra PostgreSQL real y por HTTP.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *   • Que la lectura avise al portal de que hay revisor, y que sin revisor
 *     todo siga como antes (la ruta lo dice con un 503, no con una lista vacía).
 *   • Que lo de confianza alta llegue YA aplicado y lo dudoso como sugerencia.
 *   • Que un precio que NO está impreso en la carta no llegue al dueño, ni
 *     aplicado ni sugerido: es la regla cara de toda la función.
 *   • Que revisar no cree NADA en el catálogo, y que lo revisado salga por el
 *     importador de siempre con el tipo que dejó la IA.
 *   • Que la instrucción del dueño («la bandeja es un adicional») se aplique.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/carta-revisor-ia.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';
import {
  aplicarCambio,
  filaParaRevisar,
  type CambioIA,
  type FilaDePantalla,
} from '../../app/negocio/[token]/catalogo/revision-ia';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3119);
const BASE = `http://localhost:${PUERTO}`;

let fallos = 0;
let ok = 0;
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

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const foto = () => new Blob([new Uint8Array(PNG_1X1)], { type: 'image/png' });

async function leerCarta(token: string): Promise<Res> {
  const form = new FormData();
  form.append('file', foto(), 'carta.png');
  return leer(await fetch(`${BASE}/business/${token}/products/carta-foto`, { method: 'POST', body: form }));
}

async function revisar(token: string, datos: unknown): Promise<Res> {
  const form = new FormData();
  form.append('file', foto(), 'carta.png');
  form.append('datos', JSON.stringify(datos));
  return leer(await fetch(`${BASE}/business/${token}/products/carta-revisar`, { method: 'POST', body: form }));
}

async function corregir(token: string, cuerpo: unknown): Promise<Res> {
  return leer(await fetch(`${BASE}/business/${token}/products/carta-corregir`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  }));
}

async function arrancar(revisor: string | null): Promise<ChildProcess> {
  try {
    if ((await fetch(`${BASE}/health`)).ok) throw new Error(`el puerto ${PUERTO} ya está ocupado`);
  } catch (e) {
    if (e instanceof Error && e.message.includes('ocupado')) throw e;
  }
  const env: Record<string, string | undefined> = {
    ...process.env, PORT: String(PUERTO), NODE_ENV: 'development', CARTA_OCR_PROVIDER: 'fake',
    JWT_SECRET: process.env['JWT_SECRET'] ?? 'e2e-secreto-largo-para-firmar-0123456789',
  };
  if (revisor) env['CARTA_IA_PROVIDER'] = revisor;
  else delete env['CARTA_IA_PROVIDER'];
  const hijo = spawn('npx', ['tsx', 'src/index.ts'], { detached: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const reg: string[] = [];
  hijo.stdout?.on('data', (b: Buffer) => reg.push(b.toString()));
  hijo.stderr?.on('data', (b: Buffer) => reg.push(b.toString()));
  (hijo as ChildProcess & { reg: string[] }).reg = reg;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { if ((await fetch(`${BASE}/health`)).ok) return hijo; } catch { /* aún no */ }
  }
  console.error(reg.join(''));
  throw new Error('el servidor no arrancó');
}

function matar(s: ChildProcess) {
  try { if (s.pid) process.kill(-s.pid, 'SIGKILL'); } catch { s.kill('SIGKILL'); }
}

interface Linea { linea: number; nombre: string; precio: number | null; seccion: string; descripcion?: string; rol?: string }

async function main() {
  const marca = `e2eia-${Date.now()}`;
  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Restaurante`, ownerName: 'Dueña E2E', phone: `+57300${Math.floor(1e6 + Math.random() * 8e6)}`,
      address: 'Calle 5 # 3-40', category: 'RESTAURANT', token: `tok-${marca}`,
    },
  });

  console.log('\n[1] Sin revisor configurado, la lectura sigue igual y la revisión lo dice');
  {
    const s = await arrancar(null);
    try {
      const r = await leerCarta(negocio.token);
      check(r.status === 200, 'la carta se lee igual', r.status);
      check((r.json.data as { revisorIA?: boolean }).revisorIA === false, 'y avisa que NO hay revisor');
      const rv = await revisar(negocio.token, { filas: [{ linea: 1, nombre: 'X', precio: 1000 }] });
      check(rv.status === 503, 'pedir la revisión responde 503, no una lista vacía', rv.status);
      const salud = (await (await fetch(`${BASE}/health`)).json()) as { cartaIA?: string };
      check(salud.cartaIA === 'apagado', '/health dice cartaIA: apagado', salud.cartaIA);
    } finally {
      matar(s);
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  const s = await arrancar('fake');
  try {
    console.log('\n[2] La lectura anuncia el revisor');
    const r = await leerCarta(negocio.token);
    const data = r.json.data as { lineas: Linea[]; secciones: string[]; textoCrudo: string; revisorIA: boolean };
    check(data.revisorIA === true, 'revisorIA: true');
    const salud = (await (await fetch(`${BASE}/health`)).json()) as { cartaIA?: string };
    check(salud.cartaIA === 'pruebas', '/health dice cartaIA: pruebas', salud.cartaIA);

    let pantalla: FilaDePantalla[] = data.lineas.map((l, i) => ({
      id: i, linea: l.linea, nombre: l.nombre, precio: l.precio == null ? '' : String(l.precio),
      descripcion: l.descripcion ?? '', seccion: l.seccion, rol: (l.rol ?? 'plato') as FilaDePantalla['rol'],
    }));
    // El lector ya acierta con la gaseosa en BEBIDAS; aquí se simula que se
    // equivocó, que es exactamente el caso para el que existe el revisor.
    pantalla = pantalla.map((f) => (/gaseosa/i.test(f.nombre) ? { ...f, rol: 'plato' } : f));
    const antesDeRevisar = await prisma.product.count({ where: { businessId: negocio.id } });

    console.log('\n[3] La revisión: lo seguro aplicado, lo dudoso sugerido, lo inventado fuera');
    const rv = await revisar(negocio.token, {
      filas: pantalla.map(filaParaRevisar), secciones: data.secciones, textoCrudo: data.textoCrudo,
    });
    check(rv.status === 200, 'responde 200', rv);
    const rev = rv.json.data as { aplicadas: CambioIA[]; sugerencias: CambioIA[]; descartadas: number };
    const gaseosa = pantalla.find((f) => /gaseosa/i.test(f.nombre))!;
    const patacon = pantalla.find((f) => /patac/i.test(f.nombre))!;
    check(
      rev.aplicadas.some((c) => c.linea === gaseosa.linea && c.filas[0]!.despues!.rol === 'acompanamiento'),
      'la bebida llega YA corregida (confianza alta)', rev.aplicadas.map((c) => c.titulo),
    );
    check(
      rev.sugerencias.some((c) => c.linea === patacon.linea) && !rev.aplicadas.some((c) => c.linea === patacon.linea),
      'lo de confianza media llega como sugerencia, sin aplicarse', rev.sugerencias.map((c) => c.titulo),
    );
    const todas = [...rev.aplicadas, ...rev.sugerencias].flatMap((c) => c.filas);
    check(!todas.some((f) => f.despues?.precio === 77_777), 'el precio que no está impreso NO llega al dueño');
    check(rev.descartadas >= 1, 'y queda contado como descartado', rev.descartadas);
    check(
      (await prisma.product.count({ where: { businessId: negocio.id } })) === antesDeRevisar,
      'revisar no crea nada en el catálogo',
    );

    // El portal aplica lo que llegó aplicado.
    for (const c of rev.aplicadas) {
      const x = aplicarCambio(pantalla, c);
      check(x.ok, `el portal aplica «${c.titulo}»`);
      pantalla = x.filas;
    }

    console.log('\n[4] El dueño dice con sus palabras qué quedó mal');
    const bandeja = pantalla.find((f) => /bandeja/i.test(f.nombre))!;
    const corto = await corregir(negocio.token, { filas: [], instruccion: 'x' });
    check(corto.status === 400, 'una instrucción vacía se rechaza', corto.status);
    const co = await corregir(negocio.token, {
      filas: pantalla.map(filaParaRevisar), secciones: data.secciones, textoCrudo: data.textoCrudo,
      instruccion: `la ${bandeja.nombre.toLowerCase()} es un adicional`,
    });
    const cor = co.json.data as { aplicadas: CambioIA[] };
    check(co.status === 200 && cor.aplicadas.some((c) => c.linea === bandeja.linea), 'lo pedido llega aplicado', co.json);
    for (const c of cor.aplicadas) pantalla = aplicarCambio(pantalla, c).filas;

    const ajeno = await corregir('token-que-no-existe', { filas: pantalla.map(filaParaRevisar), instruccion: 'la gaseosa es bebida' });
    check(ajeno.status === 404, 'con un token ajeno no se revisa nada', ajeno.status);

    console.log('\n[5] Lo revisado sale por el importador de siempre');
    const listas = pantalla.filter((f) => f.nombre && (f.precio !== '' || f.rol === 'guarnicion'));
    const imp = await leer(await fetch(`${BASE}/business/${negocio.token}/products/carta-importar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filas: listas.map((f) => ({ ...filaParaRevisar(f) })),
      }),
    }));
    check(imp.status === 200, 'el importador acepta la carta revisada', imp.json);
    const prodGaseosa = await prisma.product.findFirst({ where: { businessId: negocio.id, name: { contains: 'Gaseosa' } } });
    check(prodGaseosa?.suggestAsAddon === true, 'la gaseosa quedó como «se ofrece al pagar»', prodGaseosa);
    const prodBandeja = await prisma.product.findFirst({ where: { businessId: negocio.id, name: { contains: 'Bandeja' } } });
    check(prodBandeja === null, 'la bandeja NO se creó como producto: el dueño dijo que es adicional', prodBandeja?.name);
  } finally {
    matar(s);
  }

  await prisma.product.deleteMany({ where: { businessId: negocio.id } }).catch(() => undefined);
  console.log(`\n${ok} bien · ${fallos} mal\n`);
  await prisma.$disconnect();
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
