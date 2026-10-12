/**
 * El mismo plato en varios tamaños, contra PostgreSQL real y POR HTTP.
 *
 * LO QUE SOLO SE VE EJECUTANDO. Las reglas —el precio base es el menor, no se
 * agrupan dos tamaños que se llaman igual— están probadas sobre la función
 * pura en `carta-variantes.test.ts`. Lo que ninguna prueba unitaria toca es lo
 * que de verdad importa aquí: que el producto quede creado UNA vez, con el
 * precio del tamaño más barato, y con su grupo de opciones COLGADO. Entre la
 * fila del CSV y el `optionGroup` hay un enlace por número de línea, y si se
 * descuadra el producto se crea sin tamaños —el cliente ve la picada a 39.000
 * sin poder elegir— sin un solo error por ningún lado.
 *
 * Y va por HTTP porque el enlace vive en el MANEJADOR, no en el servicio:
 * llamar a `applyProductImport` directamente no tocaría esa línea. Es el mismo
 * sitio donde se escondió el bug del mapa de sillas.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/tamanos-de-la-carta.ts
 */
import { spawn } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = 3017;
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

/** La foto da igual: con `CARTA_OCR_PROVIDER=fake` el texto es fijo. */
async function subirCarta(token: string) {
  const form = new FormData();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'carta.png');
  const r = await fetch(`${BASE}/business/${token}/products/carta-foto`, {
    method: 'POST',
    body: form,
  });
  return { status: r.status, json: (await r.json()) as { success: boolean; data?: unknown; error?: string } };
}

interface VarianteSugerida {
  nombre: string;
  seccion: string;
  precioBase: number;
  grupo: string;
  opciones: Array<{ nombre: string; precio: number; precioDelta: number }>;
  lineas: number[];
  faltanNombres: boolean;
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
    env: {
      ...process.env,
      PORT: String(PUERTO),
      NODE_ENV: 'development',
      CARTA_OCR_PROVIDER: 'fake',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const registros: string[] = [];
  servidor.stdout?.on('data', (b) => registros.push(String(b)));
  servidor.stderr?.on('data', (b) => registros.push(String(b)));

  const sello = Date.now();
  let negocioId = '';

  try {
    await esperarServidor();

    const negocio = await prisma.business.create({
      data: {
        name: `Picadas del sello ${sello}`,
        address: 'Calle 5 # 3-40',
        category: 'RESTAURANT',
        token: `tok-tam-${sello}`,
        phone: '+573000000911',
      },
    });
    negocioId = negocio.id;

    console.log('\n[1] La foto PROPONE agrupar el plato que viene por tamaños');
    let sugerida: VarianteSugerida | undefined;
    {
      const r = await subirCarta(negocio.token);
      check(r.status === 200, 'la ruta responde 200', { s: r.status, e: r.json.error });
      const data = r.json.data as { variantes?: VarianteSugerida[] } | undefined;
      const vs = data?.variantes ?? [];
      sugerida = vs.find((v) => v.nombre === 'Picada');
      check(!!sugerida, 'propone «Picada» como un solo plato', vs.map((v) => v.nombre));
      check(sugerida?.precioBase === 39000,
        'con el precio del tamaño MÁS BARATO como precio del producto',
        sugerida?.precioBase);
      check(
        JSON.stringify(sugerida?.opciones.map((o) => [o.nombre, o.precioDelta]))
          === JSON.stringify([['pequeña', 0], ['grande', 41000]]),
        'y los dos tamaños con su recargo, de menor a mayor',
        sugerida?.opciones,
      );
      check(sugerida?.faltanNombres === false,
        'ya tiene nombre cada tamaño: lo escribió la carta');
      check(sugerida?.lineas.length === 2,
        'y dice qué dos líneas se lleva, para que no salgan también sueltas',
        sugerida?.lineas);

      // El jugo trae dos precios en UNA línea: se sabe cuánto cuesta cada
      // tamaño y no cómo se llama, así que las opciones salen sin nombre.
      const jugo = vs.find((v) => v.nombre === 'Jugo natural');
      check(!!jugo, 'y propone también la línea con dos precios', vs.map((v) => v.nombre));
      check(jugo?.faltanNombres === true, 'marcada como «hay que bautizar los tamaños»');
      check(
        (jugo?.opciones ?? []).every((o) => o.nombre === ''),
        'con los nombres VACÍOS: inventarlos («Opción 1») sería escribirle la carta al dueño',
        jugo?.opciones,
      );

      const cuantos = await prisma.product.count({ where: { businessId: negocio.id } });
      check(cuantos === 0, 'LEER SIGUE SIN CREAR NADA', cuantos);
    }

    console.log('\n[2] Lo aprobado se crea como UN plato con su grupo de tamaños');
    {
      const r = await pedir('POST', `/business/${negocio.token}/products/carta-importar`, {
        filas: [{ nombre: 'Gaseosa', precio: 3500, seccion: 'Bebidas' }],
        variantes: [{
          nombre: 'Picada',
          seccion: 'Platos fuertes',
          grupo: 'Tamaño',
          precioBase: 39000,
          opciones: [
            { nombre: 'Pequeña', precioDelta: 0 },
            { nombre: 'Mediana', precioDelta: 7000 },
            { nombre: 'Grande', precioDelta: 41000 },
          ],
        }],
      });
      check(r.status === 200, 'responde 200', { s: r.status, e: r.json.error });
      const data = r.json.data as { creados?: number; conTamanos?: number } | undefined;
      check(data?.creados === 2, 'creó la gaseosa y la picada', data);
      check(data?.conTamanos === 1, 'y dice que una quedó con tamaños', data);

      const picadas = await prisma.product.findMany({
        where: { businessId: negocio.id, name: 'Picada' },
        include: { optionGroups: { include: { options: { orderBy: { sortOrder: 'asc' } } } } },
      });
      check(picadas.length === 1,
        'hay UNA picada, no tres: es lo que el dueño reportó de su catálogo',
        picadas.length);
      const picada = picadas[0];
      check(picada?.price === 39000, 'al precio del tamaño más barato', picada?.price);
      check(picada?.category === 'Platos fuertes', 'en su sección', picada?.category);

      const grupo = picada?.optionGroups[0];
      check(picada?.optionGroups.length === 1, 'con UN grupo de opciones', picada?.optionGroups.length);
      check(grupo?.name === 'Tamaño', 'que se llama Tamaño', grupo?.name);
      // Lo que hace que la app diga «Desde $39.000» y obligue a elegir: sin
      // `required` el cliente podría pedir una picada sin tamaño, y el precio
      // de la lista sería el que de verdad paga.
      check(grupo?.required === true, 'OBLIGATORIO: no se puede pedir sin elegir tamaño');
      check(grupo?.minSelect === 1 && grupo?.maxSelect === 1,
        'y exactamente uno', { min: grupo?.minSelect, max: grupo?.maxSelect });
      check(
        JSON.stringify((grupo?.options ?? []).map((o) => [o.name, o.priceDelta]))
          === JSON.stringify([['Pequeña', 0], ['Mediana', 7000], ['Grande', 41000]]),
        'los tres tamaños, en orden y con su recargo',
        grupo?.options,
      );
      check(
        (grupo?.options ?? []).every((o) => o.priceDelta >= 0),
        'ningún recargo negativo: el precio base es el más barato',
      );
    }

    console.log('\n[3] La app ve el plato como uno solo, con su «Desde»');
    {
      const r = await fetch(`${BASE}/client/businesses/${negocio.id}`);
      const j = (await r.json()) as {
        data?: { products?: Array<{ name: string; price: number; optionGroups?: Array<{
          name: string; required: boolean; options: Array<{ name: string; priceDelta: number }>;
        }> }> };
      };
      const productos = j.data?.products ?? [];
      const picada = productos.find((p) => p.name === 'Picada');
      check(!!picada, 'la picada llega al catálogo del cliente', productos.map((p) => p.name));
      check(productos.filter((p) => p.name.startsWith('Picada')).length === 1,
        'y es la única fila «Picada» de la carta',
        productos.map((p) => p.name));
      check(picada?.price === 39000, 'con el precio del más barato', picada?.price);
      const g = picada?.optionGroups?.[0];
      // `precioDesde` de la app es exactamente esto: un grupo OBLIGATORIO con
      // alguna opción que cuesta más. Si el DTO no lo expusiera, la fila
      // diría «$39.000» a secas y prometería un precio que la caja no cobra.
      check(
        g?.required === true && (g?.options ?? []).some((o) => o.priceDelta > 0),
        'y con lo que hace que la fila diga «Desde $39.000»',
        g,
      );
    }

    console.log('\n[4] Una variante a medias se RECHAZA y no crea nada');
    {
      const antes = await prisma.product.count({ where: { businessId: negocio.id } });
      const malas: Array<[string, unknown]> = [
        ['un tamaño sin nombre', {
          nombre: 'Lasaña', seccion: 'Platos fuertes', grupo: 'Tamaño', precioBase: 15000,
          opciones: [{ nombre: '', precioDelta: 0 }, { nombre: 'Grande', precioDelta: 5000 }],
        }],
        ['dos tamaños que se llaman igual', {
          nombre: 'Lasaña', seccion: 'Platos fuertes', grupo: 'Tamaño', precioBase: 15000,
          opciones: [{ nombre: 'Grande', precioDelta: 0 }, { nombre: 'GRANDE', precioDelta: 5000 }],
        }],
        ['un recargo negativo', {
          nombre: 'Lasaña', seccion: 'Platos fuertes', grupo: 'Tamaño', precioBase: 20000,
          opciones: [{ nombre: 'Pequeña', precioDelta: -5000 }, { nombre: 'Grande', precioDelta: 0 }],
        }],
        ['un solo tamaño', {
          nombre: 'Lasaña', seccion: 'Platos fuertes', grupo: 'Tamaño', precioBase: 15000,
          opciones: [{ nombre: 'Única', precioDelta: 0 }],
        }],
      ];
      for (const [que, variante] of malas) {
        const r = await pedir('POST', `/business/${negocio.token}/products/carta-importar`, {
          filas: [{ nombre: 'Patacón', precio: 8000, seccion: 'Entradas' }],
          variantes: [variante],
        });
        check(r.status === 400, `${que}: responde 400`, { s: r.status, e: r.json.error });
        check(/Lasaña/.test(r.json.error ?? ''), `${que}: el error dice cuál falla`, r.json.error);
      }
      // LA COMPROBACIÓN QUE JUSTIFICA EL BLOQUE: se sanea ANTES de escribir.
      // Si no, el patacón quedaría creado y la lasaña a medias — y el dueño
      // reintentaría, duplicando el patacón.
      const despues = await prisma.product.count({ where: { businessId: negocio.id } });
      check(despues === antes, 'y NADA se creó: ni la variante ni las filas que la acompañaban',
        { antes, despues });
      const patacon = await prisma.product.findFirst({
        where: { businessId: negocio.id, name: 'Patacón' },
      });
      check(patacon === null, 'el patacón que viajaba con ella tampoco');
    }

    console.log('\n[5] Sin variantes, el importador se comporta igual que antes');
    {
      const r = await pedir('POST', `/business/${negocio.token}/products/carta-importar`, {
        filas: [{ nombre: 'Empanadas (3)', precio: 6000, seccion: 'Entradas' }],
      });
      const data = r.json.data as { creados?: number; conTamanos?: number } | undefined;
      check(r.status === 200 && data?.creados === 1, 'crea la fila suelta', { s: r.status, data });
      check((data?.conTamanos ?? 0) === 0, 'y no dice que agrupó nada', data);
      const emp = await prisma.product.findFirst({
        where: { businessId: negocio.id, name: 'Empanadas (3)' },
        include: { optionGroups: true },
      });
      check(emp?.optionGroups.length === 0, 'sin grupos de opciones de la nada', emp?.optionGroups);
    }

    console.log(`\n${ok} comprobaciones bien, ${fallos} mal`);
    if (fallos > 0) console.log('\n--- registros del servidor ---\n' + registros.join(''));
    process.exitCode = fallos > 0 ? 1 : 0;
  } catch (err) {
    console.error(err);
    console.log('\n--- registros del servidor ---\n' + registros.join(''));
    process.exitCode = 1;
  } finally {
    if (negocioId) {
      await prisma.product.deleteMany({ where: { businessId: negocioId } });
      await prisma.business.deleteMany({ where: { id: negocioId } });
    }
    await prisma.$disconnect();
    // Matar el GRUPO: `kill` sobre `npx` deja vivo el node que cuelga de él, y
    // la corrida siguiente mediría ese servidor viejo.
    try { process.kill(-servidor.pid!, 'SIGKILL'); } catch { /* ya murió */ }
  }
}

void main();
