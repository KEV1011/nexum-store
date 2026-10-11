/**
 * El escáner reconoce el producto, contra PostgreSQL real y POR HTTP.
 *
 * LO QUE SOLO SE VE EJECUTANDO. La regla —«el precio nunca»— está probada en
 * `sugerencia-codigo.test.ts` sobre la función pura, pero lo que de verdad
 * importa es que la CONSULTA no lo traiga y que la RUTA no lo devuelva: una
 * prueba unitaria no mira el `select` de Prisma ni el JSON del manejador, y es
 * justo donde el precio de la competencia se filtraría.
 *
 * Y va por HTTP porque el defecto que esto persigue vivió en un manejador —el
 * mapa de sillas, que se perdió `seats` entre la ruta y el servicio— y llamar
 * al servicio directamente no habría tocado ese código.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/sugerencia-codigo.ts
 */
import { spawn } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = 3011;
const BASE = `http://127.0.0.1:${PUERTO}`;

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

const EAN = '7702004003457';

interface Respuesta {
  success: boolean;
  data?: { id: string; name: string; price: number } | null;
  sugerencia?: { name: string; brand?: string; unit?: string; comercios: number } | null;
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

async function main() {
  // Si el puerto está ocupado se mediría un servidor VIEJO con el código de
  // antes, que es la trampa que ya costó varias corridas en este repo.
  try {
    await fetch(`${BASE}/health`);
    console.error(`El puerto ${PUERTO} ya está ocupado. Mátalo: fuser -k ${PUERTO}/tcp`);
    process.exit(1);
  } catch { /* libre, seguimos */ }

  const servidor = spawn('npx', ['tsx', 'src/index.ts'], {
    env: { ...process.env, PORT: String(PUERTO), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const registros: string[] = [];
  servidor.stdout?.on('data', (b) => registros.push(String(b)));
  servidor.stderr?.on('data', (b) => registros.push(String(b)));

  const sello = Date.now();
  const ids: string[] = [];

  try {
    await esperarServidor();

    // Tres comercios tienen el mismo EAN. Dos lo escribieron igual y uno con
    // una errata: el nombre propuesto tiene que ser el de los dos.
    const mio = await prisma.business.create({
      data: {
        name: `Tienda que escanea ${sello}`, address: 'Calle 5 # 3-40',
        category: 'SUPERMARKET', token: `tok-escanea-${sello}`, phone: '+573000000701',
      },
    });
    const vecino1 = await prisma.business.create({
      data: {
        name: `Vecino uno ${sello}`, address: 'Calle 6', category: 'SUPERMARKET',
        token: `tok-vec1-${sello}`, phone: '+573000000702',
      },
    });
    const vecino2 = await prisma.business.create({
      data: {
        name: `Vecino dos ${sello}`, address: 'Calle 7', category: 'SUPERMARKET',
        token: `tok-vec2-${sello}`, phone: '+573000000703',
      },
    });
    const vecino3 = await prisma.business.create({
      data: {
        name: `Vecino tres ${sello}`, address: 'Calle 8', category: 'SUPERMARKET',
        token: `tok-vec3-${sello}`, phone: '+573000000704',
      },
    });
    ids.push(mio.id, vecino1.id, vecino2.id, vecino3.id);

    await prisma.product.create({
      data: {
        businessId: vecino3.id, name: 'Coca Col 1.5', category: 'Bebidas',
        price: 9900, barcode: EAN, brand: 'Coca-Cola', unit: 'unidad',
      },
    });
    await prisma.product.create({
      data: {
        businessId: vecino1.id, name: 'Coca-Cola 1.5 L', category: 'Bebidas',
        price: 7500, barcode: EAN, brand: 'Coca-Cola', unit: 'unidad',
      },
    });
    await prisma.product.create({
      data: {
        businessId: vecino2.id, name: 'Coca-Cola 1.5 L', category: 'Gaseosas',
        price: 8200, barcode: EAN, brand: 'Coca-Cola', unit: 'unidad',
      },
    });

    console.log('\n[1] Escaneo un código que YO no tengo');
    const r1 = await fetch(`${BASE}/business/${mio.token}/products/barcode/${EAN}`);
    const j1 = (await r1.json()) as Respuesta;
    check(r1.status === 200, 'responde 200: «no lo tienes» no es un error', r1.status);
    check(j1.data === null, 'y dice que no lo tengo', j1.data);
    check(j1.sugerencia?.name === 'Coca-Cola 1.5 L',
      'PROPONE el nombre más repetido, no la errata del primero',
      j1.sugerencia?.name);
    check(j1.sugerencia?.comercios === 3, 'y dice en cuántos comercios está', j1.sugerencia?.comercios);
    check(j1.sugerencia?.brand === 'Coca-Cola', 'con la marca, que es del producto');
    check(j1.sugerencia?.unit === 'unidad', 'y la unidad de venta');

    console.log('\n[2] EL PRECIO NO SALE POR NINGÚN LADO');
    // Es la comprobación que justifica el script: proponerlo sería ponerle a
    // esta tienda el precio de su competencia, y un «Guardar» distraído la
    // dejaría vendiendo a 7.500 sin que nadie se entere.
    const crudo = JSON.stringify(j1.sugerencia ?? {});
    check(!crudo.includes('7500'), 'no viaja el precio del vecino 1', crudo);
    check(!crudo.includes('8200'), 'ni el del vecino 2');
    check(!crudo.includes('9900'), 'ni el del vecino 3');
    check(!/price/i.test(crudo), 'ni ningún campo que se llame precio', crudo);

    console.log('\n[3] Lo creo con MI precio y el código queda puesto');
    const r3 = await fetch(`${BASE}/business/${mio.token}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: j1.sugerencia?.name, price: 6800, category: 'Bebidas',
        barcode: EAN, unit: 'unidad', stock: 12,
      }),
    });
    const j3 = (await r3.json()) as { success: boolean; data?: { id: string; price: number } };
    check(r3.ok && j3.success, 'se crea', { status: r3.status, j3 });
    check(j3.data?.price === 6800, 'con el precio que puse YO, no el propuesto', j3.data?.price);

    console.log('\n[4] Vuelvo a escanearlo: ahora manda MI ficha');
    const r4 = await fetch(`${BASE}/business/${mio.token}/products/barcode/${EAN}`);
    const j4 = (await r4.json()) as Respuesta;
    check(j4.data?.id === j3.data?.id, 'me devuelve mi producto para reponer', j4.data?.name);
    check(j4.data?.price === 6800, 'con mi precio', j4.data?.price);
    check(j4.sugerencia === null || j4.sugerencia === undefined,
      'y YA NO propone nada: teniéndolo, proponer el nombre de otra tienda sería cambiárselo',
      j4.sugerencia);

    console.log('\n[5] Un código que nadie tiene no se inventa');
    const r5 = await fetch(`${BASE}/business/${mio.token}/products/barcode/7700000000001`);
    const j5 = (await r5.json()) as Respuesta;
    check(j5.data === null, 'no lo tengo');
    check(j5.sugerencia === null || j5.sugerencia === undefined,
      'y no se propone un nombre sacado del número', j5.sugerencia);

    console.log(`\n${ok} comprobaciones bien, ${fallos} mal`);
    if (fallos > 0) console.log('\n--- registros del servidor ---\n' + registros.join(''));
    process.exitCode = fallos > 0 ? 1 : 0;
  } catch (err) {
    console.error(err);
    console.log('\n--- registros del servidor ---\n' + registros.join(''));
    process.exitCode = 1;
  } finally {
    for (const id of ids) {
      await prisma.product.deleteMany({ where: { businessId: id } });
      await prisma.business.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
    // Matar el GRUPO: `kill` sobre `npx` deja vivo el node que cuelga de él, y
    // la corrida siguiente mediría ese servidor viejo.
    try { process.kill(-servidor.pid!, 'SIGKILL'); } catch { /* ya murió */ }
  }
}

void main();
