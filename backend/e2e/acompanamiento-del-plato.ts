/**
 * Lo que VIENE con el plato, contra PostgreSQL real y POR HTTP.
 *
 * EL REPORTE: «no solucionamos lo que muchos restaurantes ofrecen,
 * acompañamiento de papa a la francesa como ejemplo». Las reglas puras están
 * en `carta-acompanamiento.test.ts`; lo que solo se ve ejecutando es lo que
 * queda en la BASE y lo que pasa al PEDIR:
 *
 *   - la papa no se crea como producto, sino como grupo obligatorio «elige 1»
 *     a $0, adjunto SOLO a los platos que la traen;
 *   - «acompañados de vegetales y papa» llega a la descripción de cada
 *     sándwich, que es donde el cliente lo lee;
 *   - un pedido sin escoger se rechaza, y escogiendo se cobra el precio del
 *     plato (la papa va incluida) o el recargo si la carta lo tenía;
 *   - un «Acompañamiento" que el dueño ya tenía gana opciones pero sigue
 *     siendo «elige 1».
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/acompanamiento-del-plato.ts
 */
import { spawn } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = 3023;
const BASE = `http://127.0.0.1:${PUERTO}`;

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    ...(cuerpo !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }),
  });
  return { status: r.status, json: (await r.json()) as { success: boolean; data?: unknown; error?: string } };
}

async function esperarServidor(): Promise<void> {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* todavía no levanta */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('El servidor no levantó.');
}

async function crearNegocio(sello: number, sufijo: string) {
  return prisma.business.create({
    data: {
      name: `Sanduchería ${sufijo} ${sello}`,
      address: 'Calle 5 # 3-40',
      category: 'RESTAURANT',
      token: `tok-guarn-${sufijo}-${sello}`,
      phone: `+5730011${String(sello).slice(-4)}${sufijo.length}`,
    },
  });
}

interface OpcionDTO { id: string; name: string; priceDelta: number }
interface GrupoDTO { id: string; name: string; label?: string; required: boolean; minSelect: number; maxSelect: number; options: OpcionDTO[] }
interface ProductoDTO { id: string; name: string; price: number; description?: string; optionGroups: GrupoDTO[] }

/** La carta del reporte, tal como la deja la vista previa del portal. */
const CARTA = {
  filas: [
    { nombre: 'Sandwich criollo', precio: 19000, seccion: 'Sándwiches', rol: 'plato', descripcion: 'Pan argentino, jamón, queso' },
    { nombre: 'Sandwich proteína', precio: 23000, seccion: 'Sándwiches', rol: 'plato', descripcion: '' },
    { nombre: 'Bandeja paisa', precio: 28000, seccion: 'Platos fuertes', rol: 'plato', descripcion: '' },
    { nombre: 'Churrasco', precio: 32000, seccion: 'Platos fuertes', rol: 'plato', descripcion: '' },
    // «Acompañamientos: papa a la francesa, patacón o arroz» bajo los platos fuertes.
    { nombre: 'Papa a la francesa', precio: null, seccion: 'Platos fuertes', rol: 'guarnicion' },
    { nombre: 'Patacón', precio: null, seccion: 'Platos fuertes', rol: 'guarnicion' },
    { nombre: 'Arroz', precio: null, seccion: 'Platos fuertes', rol: 'guarnicion' },
    { nombre: 'Gaseosa', precio: 3500, seccion: 'Bebidas', rol: 'acompanamiento', descripcion: '' },
  ],
  notas: [
    { texto: 'Acompañado de vegetales frescos, porción de papa a la francesa', seccion: 'Sándwiches' },
  ],
};

async function main() {
  try {
    await fetch(`${BASE}/health`);
    console.error(`El puerto ${PUERTO} ya está ocupado. Mátalo: fuser -k ${PUERTO}/tcp`);
    process.exit(1);
  } catch { /* libre */ }

  const servidor = spawn('npx', ['tsx', 'src/index.ts'], {
    env: { ...process.env, PORT: String(PUERTO), NODE_ENV: 'development', CARTA_OCR_PROVIDER: 'fake' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const registros: string[] = [];
  servidor.stdout?.on('data', (b) => registros.push(String(b)));
  servidor.stderr?.on('data', (b) => registros.push(String(b)));

  const sello = Date.now();
  const negocios: string[] = [];

  try {
    await esperarServidor();

    // ── [1] La carta del reporte ────────────────────────────────────────────
    const a = await crearNegocio(sello, 'a');
    negocios.push(a.id);

    console.log('\n[1] Importar la carta con su acompañamiento y su nota');
    const r = await pedir('POST', `/business/${a.token}/products/carta-importar`, CARTA);
    check(r.status === 200 && r.json.success, 'la importación responde bien', r.json);
    const d = r.json.data as Record<string, number>;
    check(d?.creados === 5, 'cinco productos: cuatro platos y la gaseosa', d);
    check(d?.platosConGuarnicion === 2, 'el acompañamiento queda en los DOS platos fuertes', d);
    check(d?.notas === 1, 'y la nota se aplicó', d);

    const nombres = (await prisma.product.findMany({ where: { businessId: a.id }, select: { name: true } }))
      .map((p) => p.name);
    check(!nombres.includes('Papa a la francesa') && !nombres.includes('Patacón'),
      'la papa NO se creó como producto (no se vende sola)', nombres);

    const grupo = await prisma.optionGroup.findFirst({
      where: { businessId: a.id, name: 'Acompañamiento' },
      include: { options: { orderBy: { sortOrder: 'asc' } }, usos: { include: { product: true } } },
    });
    check(!!grupo && grupo.required && grupo.minSelect === 1 && grupo.maxSelect === 1,
      'es un grupo OBLIGATORIO «elige 1»', grupo && { r: grupo.required, min: grupo.minSelect, max: grupo.maxSelect });
    check(grupo?.options.map((o) => `${o.name}:${o.priceDelta}`).join(',') === 'Papa a la francesa:0,Patacón:0,Arroz:0',
      'con sus tres opciones a $0: viene incluido', grupo?.options.map((o) => [o.name, o.priceDelta]));
    const con = (grupo?.usos ?? []).map((x) => x.product.name).sort();
    check(con.join(',') === 'Bandeja paisa,Churrasco',
      'adjunto SOLO a los platos fuertes: a un sándwich no se le ofrece arroz', con);

    console.log('\n[2] La nota llega a la descripción de cada sándwich');
    const porNombre = async (n: string) => prisma.product.findFirst({ where: { businessId: a.id, name: n } });
    const criollo = await porNombre('Sandwich criollo');
    const proteina = await porNombre('Sandwich proteína');
    const bandeja = await porNombre('Bandeja paisa');
    check(criollo?.description === 'Pan argentino, jamón, queso. Acompañado de vegetales frescos, porción de papa a la francesa',
      'al que ya tenía ingredientes se le añade detrás', criollo?.description);
    check(proteina?.description === 'Acompañado de vegetales frescos, porción de papa a la francesa',
      'al que no tenía, la nota es su descripción', proteina?.description);
    check(!bandeja?.description, 'y a la bandeja, que es de otra sección, no le llega', bandeja?.description);

    console.log('\n[3] El cliente lo ve como una elección obligatoria');
    const carta = await pedir('GET', `/client/businesses/${a.id}`);
    const prods = (carta.json.data as { products: ProductoDTO[] }).products;
    const bandejaDTO = prods.find((p) => p.name === 'Bandeja paisa')!;
    const g = bandejaDTO.optionGroups.find((x) => x.name === 'Acompañamiento');
    check(g?.label === 'Obligatorio · elige 1', 'la frase dice qué hacer', g?.label);

    console.log('\n[4] Al pedir: sin escoger no entra; escogiendo, la papa va incluida');
    const mesas = await pedir('PUT', `/business/${a.token}/mesas`, { tables: ['1'] });
    const menuCode = (mesas.json.data as { menuCode?: string } | undefined)?.menuCode;
    check(!!menuCode, 'el local tiene carta de mesa', mesas.json);
    // `optionIds: []` es lo que manda la app (y la carta del QR) cuando el
    // cliente no escogió nada. Sin el campo entra por la rama de las apps
    // viejas, que no saben de opciones — esa sigue abierta a propósito.
    const sinEscoger = await pedir('POST', `/carta/${menuCode}/pedido`, {
      mesa: '1', items: [{ productId: bandejaDTO.id, quantity: 1, optionIds: [] }],
    });
    check(sinEscoger.status === 400 && /acompañamiento/i.test(sinEscoger.json.error ?? ''),
      'sin escoger el acompañamiento NO entra, y se dice qué falta', { s: sinEscoger.status, e: sinEscoger.json.error });
    const papa = g!.options.find((o) => o.name === 'Papa a la francesa')!;
    const conPapa = await pedir('POST', `/carta/${menuCode}/pedido`, {
      mesa: '1', items: [{ productId: bandejaDTO.id, quantity: 1, optionIds: [papa.id] }],
    });
    check(conPapa.status === 200 || conPapa.status === 201, 'escogiendo la papa, entra', { s: conPapa.status, e: conPapa.json.error });
    const linea = await prisma.orderLine.findFirst({ where: { productId: bandejaDTO.id }, orderBy: { id: 'desc' } });
    check(linea?.unitPrice === 28000, 'y se cobra el precio del plato: la papa va incluida', linea?.unitPrice);

    // ── [2] El dueño ya tenía «Acompañamiento» ─────────────────────────────
    console.log('\n[5] Un «Acompañamiento» que el dueño ya tenía sigue siendo «elige 1»');
    const b = await crearNegocio(sello, 'bb');
    negocios.push(b.id);
    await prisma.optionGroup.create({
      data: {
        businessId: b.id, name: 'Acompañamiento', required: true, minSelect: 1, maxSelect: 1,
        options: { create: [{ name: 'Papa a la francesa', priceDelta: 0, sortOrder: 0 }] },
      },
    });
    const rb = await pedir('POST', `/business/${b.token}/products/carta-importar`, { filas: CARTA.filas });
    check(rb.status === 200, 'la importación responde bien', rb.json);
    const gb = await prisma.optionGroup.findMany({ where: { businessId: b.id }, include: { options: true } });
    check(gb.length === 1, 'no se duplica el grupo', gb.map((x) => x.name));
    check(gb[0]?.options.length === 3, 'gana las opciones que le faltaban (patacón y arroz)', gb[0]?.options.map((o) => o.name));
    check(gb[0]?.maxSelect === 1,
      'y sigue siendo «elige 1»: subirle el máximo dejaría pedir papa Y arroz Y patacón', gb[0]?.maxSelect);

    // ── [3] Lo que el dueño decide en la vista previa ──────────────────────
    console.log('\n[6] A dónde va y cuántas se escogen lo decide el dueño');
    const c = await crearNegocio(sello, 'ccc');
    negocios.push(c.id);
    const rc = await pedir('POST', `/business/${c.token}/products/carta-importar`, {
      filas: [
        ...CARTA.filas.filter((f) => f.rol !== 'guarnicion'),
        { nombre: 'Papa criolla', precio: null, seccion: 'Escoge tu acompañamiento', rol: 'guarnicion' },
        { nombre: 'Yuca frita', precio: 2000, seccion: 'Escoge tu acompañamiento', rol: 'guarnicion' },
        { nombre: 'Ensalada', precio: null, seccion: 'Escoge tu acompañamiento', rol: 'guarnicion' },
      ],
      guarniciones: [{ grupo: 'Escoge tu acompañamiento', aplicarA: ['Sándwiches'], elige: 2 }],
    });
    check(rc.status === 200, 'la importación responde bien', rc.json);
    const gc = await prisma.optionGroup.findFirst({
      where: { businessId: c.id, name: 'Escoge tu acompañamiento' },
      include: { options: true, usos: { include: { product: true } } },
    });
    check(gc?.maxSelect === 2 && gc.minSelect === 1, 'el cliente escoge hasta 2', gc && [gc.minSelect, gc.maxSelect]);
    check(gc?.options.find((o) => o.name === 'Yuca frita')?.priceDelta === 2000,
      'la yuca lleva su recargo, como en la carta', gc?.options.map((o) => [o.name, o.priceDelta]));
    check((gc?.usos ?? []).map((x) => x.product.name).sort().join(',') === 'Sandwich criollo,Sandwich proteína',
      'y va donde el dueño dijo, no a todos', (gc?.usos ?? []).map((x) => x.product.name));

    console.log('\n[7] Un grupo imposible se rechaza ANTES de crear nada');
    const d7 = await crearNegocio(sello, 'dddd');
    negocios.push(d7.id);
    const muchas = Array.from({ length: 41 }, (_, i) => ({
      nombre: `Opción ${i + 1}`, precio: null, seccion: 'Acompañamientos', rol: 'guarnicion',
    }));
    const r7 = await pedir('POST', `/business/${d7.token}/products/carta-importar`, {
      filas: [CARTA.filas[0], ...muchas],
    });
    check(r7.status === 400 && /demasiadas/i.test(r7.json.error ?? ''), 'se dice por qué', r7.json);
    check(await prisma.product.count({ where: { businessId: d7.id } }) === 0,
      'y no quedó ningún plato a medias sin su acompañamiento');

    console.log('\n[8] La lectura de la foto devuelve las notas');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'carta.jpg');
    const lec = await fetch(`${BASE}/business/${a.token}/products/carta-foto`, { method: 'POST', body: form });
    const lj = (await lec.json()) as { data?: { notas?: unknown } };
    check(Array.isArray(lj.data?.notas), 'la respuesta trae `notas` para la vista previa', lj);
  } catch (e) {
    fallos++;
    console.error(e);
    console.error(registros.slice(-20).join(''));
  } finally {
    for (const id of negocios) {
      await prisma.orderLine.deleteMany({ where: { order: { businessId: id } } }).catch(() => {});
      await prisma.order.deleteMany({ where: { businessId: id } }).catch(() => {});
      await prisma.productOptionGroup.deleteMany({ where: { product: { businessId: id } } }).catch(() => {});
      await prisma.optionGroup.deleteMany({ where: { businessId: id } }).catch(() => {});
      await prisma.product.deleteMany({ where: { businessId: id } }).catch(() => {});
      await prisma.business.delete({ where: { id } }).catch(() => {});
    }
    try { process.kill(-servidor.pid!, 'SIGTERM'); } catch { /* ya murió */ }
    await prisma.$disconnect();
  }
  console.log(`\n${ok} bien, ${fallos} mal`);
  process.exit(fallos > 0 ? 1 : 0);
}

void main();
