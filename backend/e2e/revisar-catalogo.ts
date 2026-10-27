/**
 * «Revisar mi catálogo», contra PostgreSQL real y por HTTP.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *   • Que revisar NO escriba nada: el catálogo queda igual hasta que el dueño
 *     pulsa «Guardar».
 *   • Que sin IA las reglas encuentren lo suyo (errata, ingredientes dentro
 *     del nombre, mayúsculas, sección repetida) y que los precios raros
 *     lleguen como AVISO, nunca como cambio.
 *   • Que con IA lo seguro nazca marcado, un adicional quede en aviso y el
 *     precio que propone no llegue.
 *   • Que guardar no toque el precio aunque se lo manden, no escriba en el
 *     catálogo de otro negocio y no pise lo que el dueño editó mientras tanto.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/revisar-catalogo.ts
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

async function post(ruta: string, cuerpo: unknown): Promise<Res> {
  const r = await fetch(`${BASE}${ruta}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  });
  let json: Res['json'] = {};
  try { json = (await r.json()) as Res['json']; } catch { /* sin JSON */ }
  return { status: r.status, json };
}

interface Valores { name?: string; description?: string; category?: string; suggestAsAddon?: boolean; price?: number }
interface Propuesta {
  id: string; productId: string; grupo: string; producto: string;
  antes: Valores; despues: Valores; razones: string[]; origen: string[]; marcada: boolean;
}
interface Aviso { tipo: string; productIds: string[]; texto: string }
interface Revision {
  revisados: number; propuestas: Propuesta[]; avisos: Aviso[];
  ia: { disponible: boolean; usada: boolean; motivo?: string };
}

async function arrancar(revisor: string | null): Promise<ChildProcess> {
  try {
    if ((await fetch(`${BASE}/health`)).ok) throw new Error(`el puerto ${PUERTO} ya está ocupado`);
  } catch (e) {
    if (e instanceof Error && e.message.includes('ocupado')) throw e;
  }
  const env: Record<string, string | undefined> = {
    ...process.env, PORT: String(PUERTO), NODE_ENV: 'development',
    JWT_SECRET: process.env['JWT_SECRET'] ?? 'e2e-secreto-largo-para-firmar-0123456789',
  };
  if (revisor) env['CARTA_IA_PROVIDER'] = revisor;
  else delete env['CARTA_IA_PROVIDER'];
  const hijo = spawn('npx', ['tsx', 'src/index.ts'], { detached: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const reg: string[] = [];
  hijo.stdout?.on('data', (b: Buffer) => reg.push(b.toString()));
  hijo.stderr?.on('data', (b: Buffer) => reg.push(b.toString()));
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { if ((await fetch(`${BASE}/health`)).ok) return hijo; } catch { /* aún no */ }
  }
  console.error(reg.join(''));
  throw new Error('el servidor no arrancó');
}

function matar(s: ChildProcess) {
  try { if (s.pid) process.kill(-s.pid, 'SIGKILL'); } catch { s.kill('SIGKILL'); }
}

async function main() {
  const marca = `e2erc-${Date.now()}`;
  const tel = () => `+57300${Math.floor(1e6 + Math.random() * 8e6)}`;
  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Asadero`, ownerName: 'Dueño E2E', phone: tel(),
      address: 'Calle 5 # 3-40', category: 'RESTAURANT', token: `tok-${marca}`,
    },
  });
  const otro = await prisma.business.create({
    data: {
      name: `${marca} Vecino`, ownerName: 'Vecino', phone: tel(),
      address: 'Calle 6', category: 'RESTAURANT', token: `tok2-${marca}`,
    },
  });
  const crear = (name: string, category: string, price: number, description?: string) =>
    prisma.product.create({ data: { businessId: negocio.id, name, category, price, ...(description && { description }) } });

  const sencilla = await crear('HAMBURGESA SENCILLA (carne, queso, tocineta)', 'Hamburguesas', 12_000);
  const doble = await crear('Hamburguesa doble', 'HAMBURGUESAS', 15_000, 'Doble carne y queso');
  await crear('Hamburguesa ranchera', 'Hamburguesas', 16_000, 'Carne, salchicha y queso');
  const gaseosa = await crear('Gaseosa', 'Hamburguesas', 3_500);
  const queso = await crear('Queso extra', 'Hamburguesas', 3_000);
  const bestia = await crear('La Bestia', 'Hamburguesas', 22_000, 'Triple carne');
  await crear('Picada', 'Picadas', 39_000);
  await crear('Picada', 'Picadas', 46_000);
  for (const [n, p] of [['Limonada', 4_000], ['Jugo de mora', 5_000], ['Agua', 3_000], ['Té helado', 4_500]] as const) {
    await crear(n, 'Bebidas', p);
  }
  const cerveza = await crear('Cerveza', 'Bebidas', 45_000);
  const ajeno = await prisma.product.create({ data: { businessId: otro.id, name: 'Plato del vecino', category: 'General', price: 9_000 } });

  const foto = async () => JSON.stringify(
    (await prisma.product.findMany({ where: { businessId: negocio.id }, orderBy: { id: 'asc' } }))
      .map((p) => [p.name, p.description, p.category, p.price, p.suggestAsAddon]),
  );

  console.log('\n[1] Sin IA: las reglas, y revisar no escribe nada');
  {
    const s = await arrancar(null);
    try {
      const antes = await foto();
      const r = await post(`/business/${negocio.token}/products/revisar-catalogo`, { ia: true });
      check(r.status === 200, 'responde 200', r.json);
      const rev = r.json.data as Revision;
      check(rev.revisados === 13, 'revisó los 13 productos', rev.revisados);
      check(rev.ia.disponible === false && rev.ia.usada === false, 'sin IA configurada, lo dice y no la usa', rev.ia);
      const pS = rev.propuestas.find((p) => p.productId === sencilla.id && p.grupo === 'texto');
      check(
        pS?.despues.name === 'Hamburguesa sencilla' && pS?.despues.description === 'carne, queso, tocineta',
        'separa ingredientes, quita el grito y corrige «Hamburgesa»', pS,
      );
      const pD = rev.propuestas.find((p) => p.productId === doble.id && p.grupo === 'seccion');
      check(pD?.despues.category === 'Hamburguesas', '«HAMBURGUESAS» se junta con «Hamburguesas»', pD);
      check(!rev.propuestas.some((p) => p.productId === bestia.id), 'no toca lo que está bien escrito');
      check(rev.propuestas.every((p) => !('price' in p.despues)), 'ninguna propuesta cambia un precio');
      check(
        rev.avisos.some((a) => a.tipo === 'precio_atipico' && a.productIds.includes(cerveza.id)),
        'la cerveza a $45.000 entre bebidas de $4.000 sale como AVISO', rev.avisos,
      );
      check(rev.avisos.some((a) => a.tipo === 'duplicado' && /tamaños/.test(a.texto)), 'las dos picadas: aviso de tamaños');
      check((await foto()) === antes, 'revisar no cambió nada en la base');
    } finally {
      matar(s);
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  const s = await arrancar('fake');
  try {
    console.log('\n[2] Con IA: encima de las reglas, con sus guardas');
    const r = await post(`/business/${negocio.token}/products/revisar-catalogo`, { ia: true });
    const rev = r.json.data as Revision;
    check(rev.ia.usada === true, 'la IA se usó', rev.ia);
    const pG = rev.propuestas.find((p) => p.productId === gaseosa.id && p.grupo === 'tipo');
    check(pG?.despues.suggestAsAddon === true && pG.marcada && pG.origen.includes('ia'),
      'la gaseosa pasa a «se ofrece al pagar», marcada (confianza alta)', pG);
    check(!rev.propuestas.some((p) => p.productId === queso.id && p.grupo === 'tipo'),
      'el queso extra NO se convierte solo en adicional');
    check(rev.avisos.some((a) => a.tipo === 'parece_adicional' && a.productIds.includes(queso.id)),
      'queda como aviso para el dueño', rev.avisos.map((a) => a.tipo));
    check(!JSON.stringify(rev.propuestas).includes('77777'), 'el precio que inventó la IA no llega');
    const sinIA = await post(`/business/${negocio.token}/products/revisar-catalogo`, { ia: false });
    check((sinIA.json.data as Revision).ia.usada === false, 'con ia:false no se gasta una llamada');

    console.log('\n[3] Guardar lo aprobado');
    // El dueño edita la sección de la doble MIENTRAS revisaba.
    await prisma.product.update({ where: { id: doble.id }, data: { category: 'Especiales' } });
    const marcadas = rev.propuestas.filter((p) => p.marcada);
    const cambios = [
      ...marcadas.map((p) => ({ productId: p.productId, antes: p.antes, despues: p.despues })),
      // Lo que el portal no manda, pero alguien podría: un precio, y un id ajeno.
      { productId: sencilla.id, antes: { price: 12_000, category: 'Hamburguesas' }, despues: { price: 1, category: 'Hamburguesas' } },
      { productId: ajeno.id, antes: { name: 'Plato del vecino' }, despues: { name: 'Hackeado' } },
    ];
    const a = await post(`/business/${negocio.token}/products/revisar-catalogo/aplicar`, { cambios });
    check(a.status === 200, 'responde 200', a.json);
    const res = a.json.data as { aplicados: number; omitidos: Array<{ productId: string; motivo: string }> };
    check(res.omitidos.some((o) => o.productId === doble.id && /Cambió/.test(o.motivo)),
      'no pisa la sección que el dueño cambió mientras revisaba', res.omitidos);
    check(res.omitidos.some((o) => o.productId === ajeno.id), 'el producto de otro negocio se omite', res.omitidos);

    const ds = await prisma.product.findUniqueOrThrow({ where: { id: sencilla.id } });
    check(ds.name === 'Hamburguesa sencilla' && ds.description === 'carne, queso, tocineta', 'el nombre quedó arreglado', ds);
    check(ds.price === 12_000, 'el precio NO cambió aunque lo mandaran', ds.price);
    check((await prisma.product.findUniqueOrThrow({ where: { id: doble.id } })).category === 'Especiales',
      'la doble conserva «Especiales»');
    check((await prisma.product.findUniqueOrThrow({ where: { id: gaseosa.id } })).suggestAsAddon === true,
      'la gaseosa quedó como «se ofrece al pagar»');
    check((await prisma.product.findUniqueOrThrow({ where: { id: ajeno.id } })).name === 'Plato del vecino',
      'el catálogo del vecino no se tocó');
    check((await prisma.product.findUniqueOrThrow({ where: { id: cerveza.id } })).price === 45_000,
      'el precio raro sigue como estaba: solo era un aviso');

    console.log('\n[4] Revisar otra vez: lo arreglado ya no sale');
    const r2 = await post(`/business/${negocio.token}/products/revisar-catalogo`, { ia: false });
    const rev2 = r2.json.data as Revision;
    check(!rev2.propuestas.some((p) => p.productId === sencilla.id), 'la sencilla ya no tiene nada que arreglar', rev2.propuestas);

    console.log('\n[5] Puertas');
    check((await post('/business/token-que-no-existe/products/revisar-catalogo', {})).status === 404, 'token ajeno → 404');
    check((await post('/business/token-que-no-existe/products/revisar-catalogo/aplicar', { cambios })).status === 404,
      'guardar con token ajeno → 404');
    check((await post(`/business/${negocio.token}/products/revisar-catalogo/aplicar`, { cambios: [] })).status === 400,
      'sin cambios → 400');
  } finally {
    matar(s);
    await prisma.product.deleteMany({ where: { businessId: { in: [negocio.id, otro.id] } } });
    await prisma.business.deleteMany({ where: { id: { in: [negocio.id, otro.id] } } });
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
