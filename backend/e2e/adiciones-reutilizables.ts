/**
 * Adiciones reutilizables y acompañamientos, contra PostgreSQL real y POR HTTP.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *   1. **Que la migración no se lleve por delante lo que ya existía.** El
 *      `prisma migrate diff` generaba un solo `DROP COLUMN "productId", ADD
 *      COLUMN "businessId" NOT NULL`, que sobre una tabla con datos falla y,
 *      si pasara, dejaría todos los grupos sin dueño y sin plato. La
 *      migración lleva el relleno en medio y eso no lo comprueba ningún
 *      typecheck: se comprueba con filas de antes en la base.
 *   2. **Que el precio viva en UN sitio.** Un grupo compartido por doce platos
 *      tiene que cambiar en los doce al tocarlo una vez; con una copia por
 *      plato esto pasaría igual de verde y en producción el aguacate quedaría
 *      a dos precios.
 *   3. **Que lo que se COBRA salga de la misma lista que se ENSEÑÓ.** La
 *      carta y la caja leen ahora por el puente, y si uno de los dos se
 *      quedara en el camino viejo no lo diría ningún error: se vería al pagar.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/adiciones-reutilizables.ts
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

/** En desarrollo el OTP lo pone `OTP_DEV_CODE`, no el de producción. */
const OTP = process.env['OTP_DEV_CODE'] ?? '123456';

async function pedir(metodo: string, ruta: string, cuerpo?: unknown, token?: string) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(cuerpo !== undefined && { body: JSON.stringify(cuerpo) }),
  });
  return {
    status: r.status,
    json: (await r.json()) as { success: boolean; data?: unknown; error?: string },
  };
}

async function entrarComoCliente(telefono: string): Promise<string> {
  await pedir('POST', '/client/auth/send-otp', { phone: telefono });
  const r = await pedir('POST', '/client/auth/verify-otp', {
    phone: telefono, otp: OTP, name: 'Cliente E2E',
  });
  const data = r.json.data as { token?: string } | undefined;
  if (!data?.token) throw new Error(`no se pudo entrar: ${JSON.stringify(r.json)}`);
  return data.token;
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

interface GrupoDTO {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  label: string;
  usedBy?: number;
  options: Array<{ id: string; name: string; priceDelta: number }>;
}
interface ProductoDTO {
  id: string;
  name: string;
  price: number;
  suggestAsAddon: boolean;
  optionGroups: GrupoDTO[];
}

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
  let negocioId = '';
  let vecinoId = '';

  try {
    await esperarServidor();

    const negocio = await prisma.business.create({
      data: {
        name: `Arepas del sello ${sello}`,
        address: 'Calle 5 # 3-40',
        category: 'RESTAURANT',
        token: `tok-adic-${sello}`,
        phone: '+573000000921',
        deliveryFee: 3000,
      },
    });
    negocioId = negocio.id;

    // Doce arepas, como la carta del usuario.
    const arepas: ProductoDTO[] = [];
    for (let i = 1; i <= 12; i++) {
      const r = await pedir('POST', `/business/${negocio.token}/products`, {
        name: `Arepa ${i}`, price: 16000 + i * 100, category: 'Arepas rellenas',
      });
      arepas.push(r.json.data as ProductoDTO);
    }
    await pedir('POST', `/business/${negocio.token}/products`, {
      name: 'Gaseosa', price: 5000, category: 'Adicionales',
    });

    console.log('\n[1] El grupo se crea UNA vez en la biblioteca');
    let adicionales: GrupoDTO | undefined;
    {
      const r = await pedir('POST', `/business/${negocio.token}/option-groups`, {
        name: 'Adicionales',
        required: false,
        minSelect: 0,
        maxSelect: 10,
        // Las once ADICIONALES de la carta del usuario, tal cual.
        options: [
          { name: 'Porción de ensalada', priceDelta: 6000 },
          { name: 'Porción de aguacate', priceDelta: 4000 },
          { name: 'Aguapanela', priceDelta: 2000 },
          { name: 'Consomé', priceDelta: 12000 },
          { name: 'Gaseosa', priceDelta: 5000 },
          { name: 'Agua', priceDelta: 4000 },
          { name: 'Gaseosa 1.5lt', priceDelta: 10000 },
          { name: 'Porción de huevos', priceDelta: 8000 },
          { name: 'Porción de huevos rancheros', priceDelta: 10000 },
          { name: 'Porción de costilla de res', priceDelta: 12000 },
          { name: 'Porción de carne', priceDelta: 13000 },
        ],
      });
      check(r.status === 200, 'responde 200', { s: r.status, e: r.json.error });
      const lib = r.json.data as GrupoDTO[];
      adicionales = lib.find((g) => g.name === 'Adicionales');
      check(!!adicionales, 'queda en la biblioteca', lib.map((g) => g.name));
      check(adicionales?.label === 'Opcional · hasta 10',
        'con la frase que redacta el SERVIDOR, la misma que verá el cliente '
        + '(el caso de la captura de Rappi)',
        adicionales?.label);

      // Y el tope NUNCA pasa del número de opciones: «hasta 10» sobre un
      // grupo de 3 promete algo que la pantalla no puede ofrecer, y el
      // cliente lo descubriría intentando elegir el cuarto.
      const corto = await pedir('POST', `/business/${negocio.token}/option-groups`, {
        name: `Salsas cortas ${sello}`, maxSelect: 10,
        options: [{ name: 'Rosada' }, { name: 'Piña' }, { name: 'Ajo' }],
      });
      const gCorto = (corto.json.data as GrupoDTO[])
        .find((g) => g.name === `Salsas cortas ${sello}`);
      check(gCorto?.label === 'Opcional · hasta 3',
        'y un máximo mayor que las opciones se baja a las que hay', gCorto?.label);
      check(adicionales?.usedBy === 0, 'y todavía sin usar', adicionales?.usedBy);
    }

    console.log('\n[2] Se aplica a TODA la sección de un toque');
    {
      const r = await pedir(
        'POST', `/business/${negocio.token}/option-groups/${adicionales!.id}/aplicar`,
        { categoria: 'Arepas rellenas' },
      );
      const d = r.json.data as { anadidos: number; total: number };
      check(r.status === 200 && d.anadidos === 12,
        'las doce arepas de una vez — es lo que antes eran 132 filas a mano', d);

      // Repetirlo no duplica: el dueño va a pulsar dos veces.
      const otra = await pedir(
        'POST', `/business/${negocio.token}/option-groups/${adicionales!.id}/aplicar`,
        { categoria: 'Arepas rellenas' },
      );
      check((otra.json.data as { anadidos: number }).anadidos === 0,
        'y repetirlo no añade nada', otra.json.data);

      const carta = await pedir('GET', `/client/businesses/${negocio.id}`);
      const prods = (carta.json.data as { products: ProductoDTO[] }).products;
      const conAdiciones = prods.filter((p) =>
        p.optionGroups.some((g) => g.id === adicionales!.id));
      check(conAdiciones.length === 12, 'y la carta del cliente las enseña en las doce',
        conAdiciones.length);
      check(prods.find((p) => p.name === 'Gaseosa')?.optionGroups.length === 0,
        'y NO se coló en la gaseosa, que es de otra sección');
    }

    console.log('\n[3] EL PUNTO DE TODO: el precio vive en UN sitio');
    {
      const r = await pedir(
        'POST', `/business/${negocio.token}/option-groups/${adicionales!.id}`,
        {
          name: 'Adicionales',
          maxSelect: 10,
          options: [
            { name: 'Porción de ensalada', priceDelta: 6000 },
            { name: 'Porción de aguacate', priceDelta: 5000 },
            { name: 'Consomé', priceDelta: 12000 },
          ],
        },
      );
      check(r.status === 200, 'se cambia una vez', { s: r.status, e: r.json.error });

      const carta = await pedir('GET', `/client/businesses/${negocio.id}`);
      const prods = (carta.json.data as { products: ProductoDTO[] }).products;
      const precios = prods
        .flatMap((p) => p.optionGroups)
        .flatMap((g) => g.options)
        .filter((o) => o.name === 'Porción de aguacate')
        .map((o) => o.priceDelta);
      check(precios.length === 12 && precios.every((v) => v === 5000),
        'y el aguacate cuesta 5.000 en las DOCE arepas, no en una',
        [...new Set(precios)]);

      const lib = (await pedir('GET', `/business/${negocio.token}/option-groups`))
        .json.data as GrupoDTO[];
      check(lib.find((g) => g.id === adicionales!.id)?.usedBy === 12,
        'la biblioteca avisa de que lo usan doce platos', lib[0]?.usedBy);
    }

    console.log('\n[4] Lo que se COBRA sale de la misma lista que se enseñó');
    {
      const carta = await pedir('GET', `/client/businesses/${negocio.id}`);
      const arepa = (carta.json.data as { products: ProductoDTO[] }).products
        .find((p) => p.name === 'Arepa 1')!;
      const aguacate = arepa.optionGroups[0]!.options
        .find((o) => o.name === 'Porción de aguacate')!;

      // El código público nace al declarar mesas; sin eso no hay carta de QR.
      const mesas = await pedir('PUT', `/business/${negocio.token}/mesas`, {
        tables: ['4', '5'],
      });
      const menuCode = (mesas.json.data as { menuCode?: string } | undefined)?.menuCode;
      check(!!menuCode, 'el local tiene código de carta', mesas.json);

      const r = await pedir('POST', `/carta/${menuCode}/pedido`, {
        mesa: '4',
        items: [{ productId: arepa.id, quantity: 1, optionIds: [aguacate.id] }],
      });
      check(r.status === 201 || r.status === 200,
        'el pedido de mesa entra', { s: r.status, e: r.json.error });

      const linea = await prisma.orderLine.findFirst({
        where: { productId: arepa.id },
        orderBy: { id: 'desc' },
      });
      check(linea?.unitPrice === arepa.price + 5000,
        'y se cobra el precio del catálogo, no el que mande el teléfono',
        { cobrado: linea?.unitPrice, esperado: arepa.price + 5000 });
    }

    console.log('\n[5] Un grupo que no se puede pedir NO se guarda');
    {
      const malos: Array<[string, Record<string, unknown>, RegExp]> = [
        ['sin opciones', { name: 'Vacío', options: [] }, /ninguna opción/i],
        ['sin nombre', { name: '  ', options: [{ name: 'A' }] }, /nombre/i],
        ['dos opciones iguales', {
          name: 'Tamaño', options: [{ name: 'Grande' }, { name: 'GRANDE' }],
        }, /se llaman igual/i],
      ];
      for (const [que, cuerpo, esperado] of malos) {
        const r = await pedir('POST', `/business/${negocio.token}/option-groups`, cuerpo);
        check(r.status === 400 && esperado.test(r.json.error ?? ''),
          `${que}: se rechaza diciendo por qué`, { s: r.status, e: r.json.error });
      }
      // El que SÍ dejaría el plato imposible de pedir se corrige en vez de
      // rechazarse: un mínimo de 3 sobre 2 opciones baja a 2.
      const r = await pedir('POST', `/business/${negocio.token}/option-groups`, {
        name: `Salsas ${sello}`, required: true, minSelect: 3,
        options: [{ name: 'Rosada' }, { name: 'Piña' }],
      });
      const g = (r.json.data as GrupoDTO[]).find((x) => x.name === `Salsas ${sello}`);
      check(g?.minSelect === 2 && g.maxSelect >= 2,
        'y un mínimo imposible se baja al número de opciones', g);
    }

    console.log('\n[6] El acompañamiento es un PRODUCTO, no una opción');
    {
      const gaseosa = (await prisma.product.findFirst({
        where: { businessId: negocio.id, name: 'Gaseosa' },
      }))!;
      await pedir('PATCH', `/business/${negocio.token}/products/${gaseosa.id}`, {
        suggestAsAddon: true, stock: 5,
      });

      const carta = await pedir('GET', `/client/businesses/${negocio.id}`);
      const prods = (carta.json.data as { products: ProductoDTO[] }).products;
      check(prods.find((p) => p.name === 'Gaseosa')?.suggestAsAddon === true,
        'la carta dice que se ofrece como acompañamiento');
      check(prods.filter((p) => p.suggestAsAddon).length === 1,
        'y solo ese', prods.filter((p) => p.suggestAsAddon).map((p) => p.name));

      // Lo que lo distingue de una opción: al pedirlo DESCUENTA existencias y
      // deja su propia línea, así que entra en el reporte de ventas.
      const arepa = prods.find((p) => p.name === 'Arepa 2')!;
      const sesion = await entrarComoCliente(`+5730099${String(sello).slice(-5)}`);
      const r = await pedir('POST', '/client/orders', {
        businessId: negocio.id,
        items: [
          { productId: arepa.id, quantity: 1 },
          { productId: gaseosa.id, quantity: 2 },
        ],
        deliveryAddress: 'Calle 1 # 2-3',
        paymentMethod: 'efectivo',
      }, sesion);
      check(r.status === 200 || r.status === 201,
        'el pedido con acompañamiento entra', { s: r.status, e: r.json.error });

      const tras = await prisma.product.findUnique({ where: { id: gaseosa.id } });
      check(tras?.stock === 3,
        'DESCUENTA existencias (5 − 2): una opción no lo haría y se vendería infinita',
        tras?.stock);

      const lineas = await prisma.orderLine.findMany({ where: { productId: gaseosa.id } });
      check(lineas.length >= 1,
        'y deja su propia línea, así que cuenta en el reporte de ventas del local',
        lineas.length);
    }

    console.log('\n[7] El editor del PLATO también comparte, no copia');
    {
      // EL BLOQUE QUE FALTABA. Los anteriores tocan el grupo por la ruta de la
      // biblioteca; el portal, desde la ficha de un plato, usa
      // `PUT /products/:id/options` — y por ahí es por donde se colaría una
      // COPIA por plato sin que nada fallara. Comprobado rompiéndolo: sin
      // este bloque, hacer que esa ruta duplique el grupo deja el E2E en
      // verde y en producción el aguacate acaba a dos precios.
      const antes = await prisma.optionGroup.count({ where: { businessId: negocio.id } });
      const arepa = arepas[0]!;
      const r = await pedir('PUT', `/business/${negocio.token}/products/${arepa.id}/options`, {
        groups: [{
          id: adicionales!.id,
          name: 'Adicionales',
          maxSelect: 10,
          options: [
            { name: 'Porción de ensalada', priceDelta: 6000 },
            { name: 'Porción de aguacate', priceDelta: 7000 },
            { name: 'Consomé', priceDelta: 12000 },
          ],
        }],
      });
      check(r.status === 200, 'guardar desde la ficha del plato responde 200',
        { s: r.status, e: r.json.error });

      const despues = await prisma.optionGroup.count({ where: { businessId: negocio.id } });
      check(despues === antes,
        'NO se creó un grupo nuevo: se editó el que ya existía', { antes, despues });

      const carta = await pedir('GET', `/client/businesses/${negocio.id}`);
      const precios = (carta.json.data as { products: ProductoDTO[] }).products
        .flatMap((p) => p.optionGroups)
        .flatMap((g) => g.options)
        .filter((o) => o.name === 'Porción de aguacate')
        .map((o) => o.priceDelta);
      check(precios.length === 12 && precios.every((v) => v === 7000),
        'y el precio cambió en las DOCE arepas, no solo en la que se editó',
        [...new Set(precios)]);
    }

    console.log('\n[8] El grupo de OTRO negocio no se puede tocar');
    {
      const vecino = await prisma.business.create({
        data: {
          name: `Vecino ${sello}`, address: 'Calle 9', category: 'RESTAURANT',
          token: `tok-vec-${sello}`, phone: '+573000000922',
        },
      });
      vecinoId = vecino.id;
      const ajeno = await prisma.optionGroup.create({
        data: { businessId: vecino.id, name: 'Suyo', maxSelect: 1 },
      });
      const r = await pedir('PUT', `/business/${negocio.token}/products/${arepas[1]!.id}/options`, {
        groups: [{ id: ajeno.id, name: 'Robado', options: [{ name: 'X', priceDelta: 1 }] }],
      });
      check(r.status === 400, 'se rechaza', { s: r.status, e: r.json.error });
      const sigue = await prisma.optionGroup.findUnique({ where: { id: ajeno.id } });
      check(sigue?.name === 'Suyo',
        'y el grupo del vecino sigue intacto: con su id se le reescribirían los precios',
        sigue?.name);
    }

    console.log('\n[9] El plato NACE con sus adiciones, sin reescribir la biblioteca');
    {
      const antes = await prisma.productOption.findMany({
        where: { groupId: adicionales!.id }, select: { id: true }, orderBy: { id: 'asc' },
      });
      const r = await pedir('POST', `/business/${negocio.token}/products`, {
        name: `Arepa nueva ${sello}`, price: 15000, category: 'Arepas',
        optionGroupIds: [adicionales!.id], suggestAsAddon: false,
      });
      check(r.status === 201, 'se crea con las adiciones marcadas', { s: r.status, e: r.json.error });
      const creado = r.json.data as { id: string; optionGroups: GrupoDTO[] } | undefined;
      check(creado?.optionGroups?.[0]?.id === adicionales!.id,
        'y la respuesta ya las trae: el portal no tiene que pedirlas otra vez',
        creado?.optionGroups?.map((g) => g.id));
      const despues = await prisma.productOption.findMany({
        where: { groupId: adicionales!.id }, select: { id: true }, orderBy: { id: 'asc' },
      });
      check(JSON.stringify(antes) === JSON.stringify(despues),
        'las opciones del grupo conservan sus ids: adjuntar NO reescribe (eso '
        + 'cambiaría el aguacate en los otros platos y rompería carritos abiertos)');

      const vecinoGrupo = await prisma.optionGroup.findFirst({ where: { businessId: vecinoId! } });
      const ajeno = await pedir('POST', `/business/${negocio.token}/products`, {
        name: `Arepa robada ${sello}`, price: 15000, optionGroupIds: [vecinoGrupo!.id],
      });
      check(ajeno.status === 400, 'un grupo de OTRO negocio se rechaza', ajeno.json.error);
      const huerfano = await prisma.product.count({
        where: { businessId: negocio.id, name: `Arepa robada ${sello}` },
      });
      check(huerfano === 0, 'y no deja un plato creado a medias', huerfano);
    }

    console.log(`\n${ok} comprobaciones bien, ${fallos} mal`);
    if (fallos > 0) console.log('\n--- cola de registros ---\n' + registros.slice(-6).join(''));
    process.exitCode = fallos > 0 ? 1 : 0;
  } catch (err) {
    console.error(err);
    console.log('\n--- cola de registros ---\n' + registros.slice(-6).join(''));
    process.exitCode = 1;
  } finally {
    if (negocioId) {
      const ids = (await prisma.product.findMany({
        where: { businessId: negocioId }, select: { id: true },
      })).map((p) => p.id);
      await prisma.orderLine.deleteMany({ where: { productId: { in: ids } } });
      await prisma.order.deleteMany({ where: { businessId: negocioId } });
      await prisma.product.deleteMany({ where: { businessId: negocioId } });
      await prisma.optionGroup.deleteMany({ where: { businessId: negocioId } });
      await prisma.business.deleteMany({ where: { id: negocioId } });
    }
    if (vecinoId) {
      await prisma.optionGroup.deleteMany({ where: { businessId: vecinoId } });
      await prisma.business.deleteMany({ where: { id: vecinoId } });
    }
    await prisma.$disconnect();
    try { process.kill(-servidor.pid!, 'SIGKILL'); } catch { /* ya murió */ }
  }
}

void main();
