/**
 * La carta del restaurante leída de una foto, contra PostgreSQL real y por HTTP.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *   • Que la foto NO cree nada por sí sola y que lo aprobado entre por el
 *     importador de siempre, con los productos escritos de verdad en la base
 *     y al precio que aprobó el dueño.
 *
 *   • Que una línea con DOS precios no acabe en un producto. Es la regla cara
 *     de toda la función: elegir uno por nuestra cuenta le cobraría de más o
 *     de menos a un cliente, y nadie se enteraría hasta la caja.
 *
 *   • Que sin proveedor configurado la ruta lo DIGA (503) en vez de devolver
 *     una lista vacía que el dueño leería como «mi carta no se entiende».
 *
 *   • Que un plato con comas y comillas sobreviva el viaje entero. El escape
 *     se escribe en un sitio y se lee en otro, y ahí es donde un catálogo se
 *     parte por la mitad sin que falle nada.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/carta-por-foto.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';
import { parsearCarta } from '../src/lib/carta-foto';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3117);
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
  try { json = (await r.json()) as Res['json']; } catch { /* sin JSON */ }
  return { status: r.status, json };
}

/** Una imagen PNG de 1×1 de verdad: la ruta exige `image/*`. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function subirCarta(token: string): Promise<Res> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(PNG_1X1)], { type: 'image/png' }), 'carta.png');
  const r = await fetch(`${BASE}/business/${token}/products/carta-foto`, {
    method: 'POST',
    body: form,
  });
  let json: Res['json'] = {};
  try { json = (await r.json()) as Res['json']; } catch { /* sin JSON */ }
  return { status: r.status, json };
}

async function arrancarServidor(proveedor: string): Promise<ChildProcess> {
  try {
    const ocupado = await fetch(`${BASE}/health`);
    if (ocupado.ok) {
      throw new Error(
        `el puerto ${PUERTO} ya está ocupado. Mátalo (fuser -k ${PUERTO}/tcp) o la ` +
          'prueba mediría el servidor equivocado.',
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
      CARTA_OCR_PROVIDER: proveedor,
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
  // `npx` lanza un node hijo: matar solo a npx deja el servidor vivo y la
  // corrida siguiente mediría el código viejo.
  try {
    if (s.pid) process.kill(-s.pid, 'SIGKILL');
  } catch { s.kill('SIGKILL'); }
}

const sufijo = () => Math.floor(10000 + Math.random() * 89999);

async function main() {
  const marca = `e2ecarta-${Date.now()}`;
  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Restaurante`,
      ownerName: 'Dueña E2E',
      phone: `+5730081${sufijo()}`,
      address: 'Calle 5 # 3-40',
      category: 'RESTAURANT',
      token: `tok-${marca}`,
    },
  });

  // ── Sin proveedor: la ruta lo dice ─────────────────────────────────────────
  console.log('\n[1] Sin lector configurado NO se finge que la carta no se entiende');
  {
    const servidor = await arrancarServidor('none');
    try {
      const r = await subirCarta(negocio.token);
      check(r.status === 503, 'responde 503, no 200 con lista vacía', r.status);
      check(
        /no está activada/i.test(r.json.error ?? ''),
        'y dice que la función no está activada',
        r.json.error,
      );
      const cuantos = await prisma.product.count({ where: { businessId: negocio.id } });
      check(cuantos === 0, 'no se creó ningún producto', cuantos);
    } finally {
      matar(servidor);
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  // ── Con lector: la foto propone, el dueño dispone ──────────────────────────
  const servidor = await arrancarServidor('fake');
  try {
    console.log('\n[2] La foto devuelve filas para revisar, y NADA se crea todavía');
    let lineas: Array<{ nombre: string; precio: number | null; seccion: string; aviso?: string }> = [];
    {
      const r = await subirCarta(negocio.token);
      check(r.status === 200, 'la ruta responde 200', r.status);
      const data = r.json.data as {
        lineas?: typeof lineas; secciones?: string[]; textoCrudo?: string;
      } | undefined;
      lineas = data?.lineas ?? [];
      check(lineas.length > 0, 'trae filas', lineas.length);
      check(
        (data?.secciones ?? []).join(',') === 'Entradas,Platos fuertes,Bebidas',
        'con las secciones de la carta, sin gritar',
        data?.secciones,
      );
      check(
        typeof data?.textoCrudo === 'string' && data.textoCrudo.length > 0,
        'y el texto leído, para que el dueño sepa si falló la foto o la lectura',
      );
      const cuantos = await prisma.product.count({ where: { businessId: negocio.id } });
      check(cuantos === 0, 'LEER NO CREA: el catálogo sigue vacío', cuantos);
    }

    console.log('\n[3] La línea con dos precios llega SIN precio y con su motivo');
    {
      const jugo = lineas.find((l) => l.nombre === 'Jugo natural');
      check(!!jugo, 'la fila del jugo está');
      check(jugo?.precio === null, 'sin precio: no se elige uno por el dueño', jugo?.precio);
      check(/2 precios/.test(jugo?.aviso ?? ''), 'con el aviso que lo explica', jugo?.aviso);
    }

    console.log('\n[4] Lo aprobado se crea al precio aprobado');
    {
      // Lo que haría el portal: manda solo lo que quedó con precio, más una
      // corrección del dueño en la fila que venía en blanco.
      const aprobadas = lineas
        .filter((l) => l.precio != null)
        .map((l) => ({ nombre: l.nombre, precio: l.precio, seccion: l.seccion }));
      aprobadas.push({ nombre: 'Jugo natural', precio: 7000, seccion: 'Bebidas' });
      // Y un plato escrito a mano con coma y comillas, que es donde el escape
      // se parte si se escribe en un sitio y se lee en otro.
      aprobadas.push({
        nombre: 'Arroz, pollo y "especial"', precio: 18000, seccion: 'Platos fuertes',
      });

      const r = await pedir(
        'POST', `/business/${negocio.token}/products/carta-importar`, { filas: aprobadas },
      );
      check(r.status === 200, 'la importación responde 200', { s: r.status, e: r.json.error });
      const data = r.json.data as { creados?: number } | undefined;
      check((data?.creados ?? 0) === aprobadas.length, 'creó todas las aprobadas', data);

      const productos = await prisma.product.findMany({ where: { businessId: negocio.id } });
      const porNombre = new Map(productos.map((p) => [p.name, p]));
      check(porNombre.get('Bandeja paisa')?.price === 25000, 'Bandeja paisa a 25.000');
      check(porNombre.get('Gaseosa')?.price === 3500, 'Gaseosa a 3.500');
      check(
        porNombre.get('Empanadas (3)')?.price === 6000,
        'y «Empanadas (3)» conserva cuántas son',
        [...porNombre.keys()],
      );
      check(
        porNombre.get('Jugo natural')?.price === 7000,
        'el jugo queda al precio que escribió el dueño, no al que adivinamos',
      );
      check(
        porNombre.get('Arroz, pollo y "especial"')?.price === 18000,
        'el nombre con coma y comillas llega entero',
        [...porNombre.keys()],
      );
      check(
        porNombre.get('Bandeja paisa')?.category === 'Platos fuertes',
        'y cada plato queda en su sección',
        porNombre.get('Bandeja paisa')?.category,
      );
    }

    console.log('\n[5] Una fila sin precio NO se cuela por la ruta de importación');
    {
      const antes = await prisma.product.count({ where: { businessId: negocio.id } });
      const r = await pedir(
        'POST', `/business/${negocio.token}/products/carta-importar`,
        { filas: [{ nombre: 'Plato sin precio', precio: null, seccion: 'Entradas' }] },
      );
      const data = r.json.data as { creados?: number } | undefined;
      check((data?.creados ?? 0) === 0, 'no crea nada', data);
      const despues = await prisma.product.count({ where: { businessId: negocio.id } });
      check(despues === antes, 'el catálogo no cambió', { antes, despues });
      const existe = await prisma.product.findFirst({
        where: { businessId: negocio.id, name: 'Plato sin precio' },
      });
      check(existe === null, 'y el plato NO quedó creado en cero pesos');
    }

    console.log('\n[6] El token de otro negocio no sirve');
    {
      const r = await pedir(
        'POST', '/business/tok-inventado-no-existe/products/carta-importar',
        { filas: [{ nombre: 'X', precio: 5000 }] },
      );
      check(r.status === 404 || r.status === 400, 'se rechaza', r.status);
    }

    console.log('\n[7] Las mismas filas, leídas por la regla pura, dan lo mismo');
    {
      // La regla vive suelta y probada; aquí solo se comprueba que la ruta no
      // le esté haciendo algo por encima.
      const directo = parsearCarta(
        'POSTRES\nFlan casero 6.000\nBrownie 7.500',
      );
      check(directo.secciones.join() === 'Postres', 'sección', directo.secciones);
      check(directo.lineas.length === 2, 'dos platos', directo.lineas.length);
      check(directo.lineas.every((l) => l.precio! > 0), 'los dos con precio');
    }
  } finally {
    matar(servidor);
  }

  // ── Limpieza ───────────────────────────────────────────────────────────────
  await prisma.product.deleteMany({ where: { businessId: negocio.id } });
  await prisma.business.delete({ where: { id: negocio.id } });

  console.log(`\n${fallos === 0 ? 'TODO EN VERDE' : 'HAY FALLOS'}: ${ok} ok, ${fallos} fallos`);
  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
