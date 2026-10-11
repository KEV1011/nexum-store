/**
 * La identidad del local en su carta, POR HTTP y contra PostgreSQL real.
 *
 * POR HTTP Y NO LLAMANDO AL SERVICIO, que en este repo ya escondió tres bugs
 * (el mapa de sillas, el `?ciudad=` de los puestos urbanos y el saneo de la
 * carta): lo que se prueba aquí es el camino completo —ruta, servicio, mapper
 * y DTO— porque el defecto típico de esta clase de tanda es que el dato se
 * guarde bien y no llegue a la pantalla.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *   • Que lo que el dueño sube aparezca en la carta pública, que es otro
 *     endpoint y otro mapper.
 *   • Que un color inválido NO se guarde: si se guardara, la carta pintaría
 *     un `style` que el navegador ignora y el dueño vería su carta en verde
 *     sin entender por qué.
 *   • Que el tope de fotos se respete y DIGA el motivo en vez de tirar la más
 *     antigua en silencio.
 *   • Que un local sin marca declarada siga comportándose EXACTAMENTE como
 *     hasta hoy — es la mitad que rompería a todos los negocios ya
 *     registrados.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/marca-del-local.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3121);
const BASE = `http://localhost:${PUERTO}`;

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

type Res = { status: number; json: { success?: boolean; data?: unknown; error?: string } };
async function pedir(metodo: string, ruta: string, body?: unknown): Promise<Res> {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: Res['json'] = {};
  try { json = (await r.json()) as Res['json']; } catch { /* no JSON */ }
  return { status: r.status, json };
}

/** Sube un PNG de 1×1 por multipart, que es como lo manda el portal. */
async function subirImagen(ruta: string): Promise<Res> {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'foto.png');
  const r = await fetch(`${BASE}${ruta}`, { method: 'POST', body: fd });
  let json: Res['json'] = {};
  try { json = (await r.json()) as Res['json']; } catch { /* no JSON */ }
  return { status: r.status, json };
}

async function arrancarServidor(): Promise<ChildProcess> {
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
      ...process.env,
      PORT: String(PUERTO),
      NODE_ENV: 'development',
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
    try { if ((await fetch(`${BASE}/health`)).ok) return hijo; } catch { /* todavía no */ }
  }
  console.error(registros.join(''));
  throw new Error('el servidor no arrancó');
}

interface CartaBiz {
  name: string;
  logoUrl?: string;
  tagline?: string;
  gallery?: string[];
  marca?: { color: string; sobre: string; suave: string };
}

async function main() {
  const servidor = await arrancarServidor();
  const sello = Date.now();
  try {
    const biz = await prisma.business.create({
      data: {
        name: `Parrilla E2E ${sello}`,
        address: 'Calle 5 # 3-40',
        category: 'RESTAURANT',
        token: `tok-marca-${sello}`,
        menuCode: `MRC${sello}`.slice(-8).toUpperCase(),
        phone: '+573000000111',
      },
    });
    const T = biz.token;
    const carta = async (): Promise<CartaBiz> => {
      const r = await pedir('GET', `/carta/${biz.menuCode}`);
      return (r.json.data as { business: CartaBiz }).business;
    };

    console.log('\n[1] Un local SIN marca se comporta como hasta hoy');
    // Es la mitad que rompería a todos los negocios ya registrados: la carta
    // tiene que seguir saliendo, sin logo, sin frase, sin galería y con el
    // verde de ZIPA (= `marca` ausente, no un verde enviado como si lo hubiera
    // elegido el local).
    const vacia = await carta();
    check(vacia.name.includes('Parrilla E2E'), 'la carta se sirve igual', vacia.name);
    check(vacia.logoUrl === undefined, 'sin logo no se inventa ninguno');
    check(vacia.tagline === undefined, 'sin frase no se inventa ninguna');
    check(vacia.gallery === undefined, 'sin fotos no viaja una galería vacía');
    check(vacia.marca === undefined, 'sin color propio NO se manda paleta', vacia.marca);

    console.log('\n[2] El dueño pone su color y su frase');
    const g1 = await pedir('PUT', `/business/${T}/marca`, {
      brandColor: '#E11D48', tagline: '  🍖 Parrilla de leña desde 1998  ',
    });
    check(g1.json.success === true, 'se guarda', g1.json);
    const conMarca = await carta();
    check(conMarca.marca?.color === '#e11d48', 'el color llega normalizado a minúscula', conMarca.marca);
    check(conMarca.marca?.sobre === '#ffffff', 'y con el texto que se lee encima ya resuelto', conMarca.marca);
    check(
      conMarca.tagline === 'Parrilla de leña desde 1998',
      'la frase llega sin el emoji y sin espacios de sobra',
      conMarca.tagline,
    );

    console.log('\n[3] Un color que no es color se RECHAZA');
    // Guardarlo dejaría la carta pintando un `style` que el navegador ignora,
    // y el dueño vería su carta en verde sin entender por qué.
    const malo = await pedir('PUT', `/business/${T}/marca`, { brandColor: 'granate' });
    check(malo.status === 400, 'responde 400', malo.status);
    check(typeof malo.json.error === 'string' && /#RRGGBB/.test(malo.json.error!),
      'y dice el formato que espera', malo.json.error);
    check((await carta()).marca?.color === '#e11d48', 'el color bueno de antes sigue puesto');

    console.log('\n[4] Logo: se sube, llega a la carta y se puede quitar');
    const l = await subirImagen(`/business/${T}/logo`);
    check(l.status === 201, 'se sube', l.status);
    const conLogo = await carta();
    check(typeof conLogo.logoUrl === 'string' && conLogo.logoUrl.length > 0,
      'y llega a la carta pública', conLogo.logoUrl);
    const sinLogo = await pedir('DELETE', `/business/${T}/logo`);
    check(sinLogo.json.success === true, 'se quita');
    check((await carta()).logoUrl === undefined, 'y la carta vuelve a no tenerlo');

    console.log('\n[5] Fotos del local: se acumulan y el tope DICE el motivo');
    for (let i = 0; i < 6; i++) {
      const r = await subirImagen(`/business/${T}/fotos`);
      if (r.status !== 201) { check(false, `la foto ${i + 1} debía subirse`, r.json); break; }
    }
    const seis = await carta();
    check(seis.gallery?.length === 6, 'seis fotos en la galería', seis.gallery?.length);
    const septima = await subirImagen(`/business/${T}/fotos`);
    check(septima.status === 400, 'la séptima se rechaza', septima.status);
    check(
      typeof septima.json.error === 'string' && /máximo/i.test(septima.json.error!),
      'diciendo que llegó al tope, no tirando la más antigua en silencio',
      septima.json.error,
    );
    const primera = seis.gallery![0]!;
    await pedir('DELETE', `/business/${T}/fotos`, { url: primera });
    const cinco = await carta();
    check(cinco.gallery?.length === 5, 'quitar una deja cinco', cinco.gallery?.length);
    check(!cinco.gallery?.includes(primera), 'y es la que se pidió quitar');

    console.log('\n[6] Quitar el color devuelve la carta al verde de ZIPA');
    await pedir('PUT', `/business/${T}/marca`, { brandColor: null });
    check((await carta()).marca === undefined, 'la paleta deja de viajar');

    console.log(`\n${ok} comprobaciones bien, ${fallos} mal`);
    if (fallos > 0) {
      console.error('\nREGISTROS DEL SERVIDOR:');
      console.error((servidor as ChildProcess & { registros: string[] }).registros.join(''));
    }
    process.exitCode = fallos > 0 ? 1 : 0;
  } finally {
    await prisma.business.deleteMany({ where: { token: { startsWith: `tok-marca-${sello}` } } });
    await prisma.$disconnect();
    // Matar el GRUPO: `npx` deja un node colgando que ocuparía el puerto y la
    // corrida siguiente mediría un servidor viejo.
    if (servidor.pid) { try { process.kill(-servidor.pid, 'SIGKILL'); } catch { /* ya murió */ } }
  }
}

void main();
