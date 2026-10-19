/**
 * Plato, adicional o acompañamiento: lo que la carta por foto deja escrito, contra
 * PostgreSQL real y POR HTTP.
 *
 * EL CASO QUE LO MOTIVÓ. Un local de arepas subió su carta y sus ADICIONALES
 * («Queso 3.000», «Huevo 2.000») quedaron como platos que se podían pedir
 * solos, mientras sus hamburguesas acabaron ofrecidas en «Acompaña tu pedido».
 * Las reglas puras están en `carta-rol.test.ts`; lo que solo se ve ejecutando
 * es lo que queda en la BASE: qué se creó como producto, qué como opción, a
 * qué platos se adjuntó y qué se ofrece al pagar.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/carta-roles.ts
 */
import { spawn } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = 3019;
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
  for (let i = 0; i < 60; i++) {
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
      name: `Arepas ${sufijo} ${sello}`,
      address: 'Calle 5 # 3-40',
      category: 'RESTAURANT',
      token: `tok-roles-${sufijo}-${sello}`,
      phone: `+5730000${String(sello).slice(-5)}`,
    },
  });
}

const CARTA = [
  { nombre: 'Arepa rellena', precio: 20000, seccion: 'Arepas', rol: 'plato' },
  { nombre: 'Arepa sencilla', precio: 8000, seccion: 'Arepas', rol: 'plato' },
  { nombre: 'Hamburguesa costeña', precio: 25000, seccion: 'Hamburguesas', rol: 'plato' },
  { nombre: 'Queso', precio: 3000, seccion: 'ADICIONALES', rol: 'adicional' },
  { nombre: 'Huevo', precio: 2000, seccion: 'ADICIONALES', rol: 'adicional' },
  { nombre: 'Gaseosa 350 ml', precio: 3500, seccion: 'Bebidas', rol: 'acompanamiento' },
];
const JUGO = {
  nombre: 'Jugo natural', seccion: 'Bebidas', precioBase: 5000, grupo: 'Tamaño', rol: 'acompanamiento',
  opciones: [{ nombre: 'Vaso', precioDelta: 0 }, { nombre: 'Jarra', precioDelta: 2000 }],
};

async function main() {
  try {
    await fetch(`${BASE}/health`);
    console.error(`El puerto ${PUERTO} ya está ocupado. Mátalo: fuser -k ${PUERTO}/tcp`);
    process.exit(1);
  } catch { /* libre */ }

  const servidor = spawn('npx', ['tsx', 'src/index.ts'], {
    env: { ...process.env, PORT: String(PUERTO), NODE_ENV: 'development' },
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

    // ── [1] Con destino elegido y un grupo que el dueño YA tenía ─────────────
    const a = await crearNegocio(sello, 'a');
    negocios.push(a.id);
    // El dueño ya había armado «Adicionales» a mano con el queso a 2.500.
    await prisma.optionGroup.create({
      data: {
        businessId: a.id, name: 'Adicionales', required: false, minSelect: 0, maxSelect: 1,
        options: { create: [{ name: 'Queso', priceDelta: 2500, sortOrder: 0 }] },
      },
    });

    console.log('\n[1] Importar la carta con sus tipos');
    const r = await pedir('POST', `/business/${a.token}/products/carta-importar`, {
      filas: CARTA,
      variantes: [JUGO],
      adicionales: [{ grupo: 'ADICIONALES', aplicarA: ['Arepas'] }],
    });
    check(r.status === 200 && r.json.success, 'la importación responde bien', r.json);
    const d = r.json.data as Record<string, number>;
    check(d?.acompanamientos === 2, 'dos productos se ofrecen al pagar (gaseosa y jugo)', d);
    check(d?.platosConAdicionales === 2, 'los adicionales quedan en las dos arepas', d);

    const productos = await prisma.product.findMany({
      where: { businessId: a.id },
      select: { id: true, name: true, suggestAsAddon: true },
    });
    const nombres = productos.map((p) => p.name).sort();
    check(
      JSON.stringify(nombres) === JSON.stringify(
        ['Arepa rellena', 'Arepa sencilla', 'Gaseosa 350 ml', 'Hamburguesa costeña', 'Jugo natural'],
      ),
      'los adicionales NO se crean como productos que se pueden pedir solos',
      nombres,
    );
    const de = (n: string) => productos.find((p) => p.name === n);
    check(de('Gaseosa 350 ml')?.suggestAsAddon === true, 'la gaseosa se ofrece en «Acompaña tu pedido»');
    check(de('Jugo natural')?.suggestAsAddon === true, 'el jugo con tamaños también');
    check(de('Hamburguesa costeña')?.suggestAsAddon === false, 'la hamburguesa NO se ofrece al pagar');
    check(de('Arepa rellena')?.suggestAsAddon === false, 'la arepa tampoco');

    // Los adicionales caen en una sección «ADICIONALES»: entera de adicionales,
    // así que el grupo se llama como ella.
    const grupos = await prisma.optionGroup.findMany({
      where: { businessId: a.id },
      include: { options: { orderBy: { sortOrder: 'asc' } }, usos: { select: { productId: true } } },
    });
    const adicionales = grupos.filter((g) => g.name.toLowerCase() === 'adicionales');
    check(adicionales.length === 1, 'NO se duplica el grupo que el dueño ya tenía', grupos.map((g) => g.name));
    const g = adicionales[0];
    const queso = g?.options.find((o) => o.name === 'Queso');
    check(queso?.priceDelta === 2500, 'el precio que el dueño puso a mano NO se pisa', queso);
    check(g?.options.some((o) => o.name === 'Huevo' && o.priceDelta === 2000) === true, 'se añade lo que faltaba (huevo)');
    check(g?.maxSelect === 2, 'era «hasta todas» y lo sigue siendo: queso Y huevo', g?.maxSelect);
    const usan = new Set(g?.usos.map((u) => u.productId));
    check(usan.has(de('Arepa rellena')!.id) && usan.has(de('Arepa sencilla')!.id), 'adjunto a las arepas');
    check(!usan.has(de('Hamburguesa costeña')!.id), 'NO adjunto a las hamburguesas: el dueño no lo eligió');
    check(!usan.has(de('Gaseosa 350 ml')!.id), 'NO adjunto a una bebida');

    console.log('\n[2] Lo que ve el portal: qué suena a acompañamiento');
    const lista = await pedir('GET', `/business/${a.token}/products`);
    const prods = (lista.json.data ?? []) as Array<{ name: string; pareceAcompanamiento?: boolean }>;
    const p = (n: string) => prods.find((x) => x.name === n);
    check(p('Gaseosa 350 ml')?.pareceAcompanamiento === true, 'la gaseosa suena a acompañamiento', p('Gaseosa 350 ml'));
    check(p('Hamburguesa costeña')?.pareceAcompanamiento === false, 'la hamburguesa NO', p('Hamburguesa costeña'));

    // ── [3] Sin decir a dónde: los adicionales van a TODOS los platos ─────────
    console.log('\n[3] Sin destino: todos los platos de la carta');
    const b = await crearNegocio(sello, 'b');
    negocios.push(b.id);
    const r2 = await pedir('POST', `/business/${b.token}/products/carta-importar`, { filas: CARTA });
    check(r2.status === 200, 'responde bien', r2.json);
    const grupoB = await prisma.optionGroup.findFirst({
      where: { businessId: b.id, name: 'ADICIONALES' },
      include: { options: true, usos: { include: { product: { select: { name: true } } } } },
    });
    check(grupoB?.options.length === 2, 'grupo nuevo con queso y huevo', grupoB?.options);
    check(grupoB?.required === false && grupoB?.maxSelect === 2, 'opcional y «hasta 2»', grupoB);
    const platosB = (grupoB?.usos ?? []).map((u) => u.product.name).sort();
    check(
      JSON.stringify(platosB) === JSON.stringify(['Arepa rellena', 'Arepa sencilla', 'Hamburguesa costeña']),
      'adjunto a los tres platos y a ninguna bebida',
      platosB,
    );

    // ── [4] Una app vieja que no manda tipos: todo plato, como antes ─────────
    console.log('\n[4] Sin tipos (portal anterior): se comporta como siempre');
    const c = await crearNegocio(sello, 'c');
    negocios.push(c.id);
    const r3 = await pedir('POST', `/business/${c.token}/products/carta-importar`, {
      filas: CARTA.map(({ rol: _rol, ...f }) => f),
    });
    check(r3.status === 200, 'responde bien', r3.json);
    const cuenta = await prisma.product.count({ where: { businessId: c.id } });
    check(cuenta === CARTA.length, 'las seis filas como productos, ninguna perdida', cuenta);
    const ofrecidos = await prisma.product.count({ where: { businessId: c.id, suggestAsAddon: true } });
    check(ofrecidos === 0, 'y nada se ofrece al pagar sin que nadie lo dijera', ofrecidos);

    // ── [5] Un «+ Tocineta» suelto y la sección ADICIONALES: UN grupo ────────
    console.log('\n[5] Un adicional suelto entre platos no crea un segundo grupo');
    const e = await crearNegocio(sello, 'e');
    negocios.push(e.id);
    const r5 = await pedir('POST', `/business/${e.token}/products/carta-importar`, {
      filas: [...CARTA, { nombre: '+ Tocineta', precio: 4000, seccion: 'Hamburguesas', rol: 'adicional' }],
    });
    check(r5.status === 200, 'responde bien', r5.json);
    const gruposE = await prisma.optionGroup.findMany({
      where: { businessId: e.id },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
    check(gruposE.length === 1, 'un solo grupo, no «Adicionales» y «ADICIONALES»', gruposE.map((x) => x.name));
    check(
      JSON.stringify(gruposE[0]?.options.map((o) => o.name)) === JSON.stringify(['Queso', 'Huevo', 'Tocineta']),
      'con las tres opciones, y «Tocineta» sin el «+»',
      gruposE[0]?.options.map((o) => o.name),
    );
  } catch (e) {
    fallos++;
    console.error('ERROR', e);
    console.error(registros.slice(-30).join(''));
  } finally {
    for (const id of negocios) {
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
