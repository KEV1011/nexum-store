/**
 * E2E de la compra a otra ciudad y de la categoría «Tiendas».
 *
 * LO QUE DE VERDAD SE PRUEBA, y por qué este guion existe: **que la pantalla
 * y la caja digan el MISMO número**. La app no puede calcular el envío por su
 * cuenta —en un pedido a otra ciudad hay dos cobros, el flete del bus y el
 * domicilio urbano en destino, y el segundo solo se cobra si se pide entrega
 * a la puerta—, así que pregunta a `GET /client/businesses/:id/envio`. Si esa
 * ruta y `placeClientOrder` calcularan por separado, el cliente vería un
 * total y pagaría otro: el fallo que este repositorio ya pagó una vez con la
 * promoción de la tienda. Aquí se cotiza por HTTP, se crea el pedido por
 * HTTP, y se comparan peso a peso.
 *
 * Lo demás:
 *  - la categoría STORE existe de punta a punta (registro → listado público);
 *  - un destino no declarado se RECHAZA diciendo a dónde sí se despacha, y el
 *    rechazo es el mismo en la cotización y al crear el pedido;
 *  - sin coordenadas el pedido es LOCAL —un dato que falta no lo convierte en
 *    intermunicipal ni le cobra un flete de más—;
 *  - con última milla reaparece el domicilio; sin ella vale cero.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/comprar-a-otra-ciudad.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3123);
const BASE = `http://localhost:${PUERTO}`;
const OTP = '123456';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

type Res = { status: number; json: { success?: boolean; data?: unknown; error?: string } };
async function pedir(
  metodo: string,
  ruta: string,
  opts: { body?: unknown; token?: string } = {},
): Promise<Res> {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: Res['json'] = {};
  try { json = (await r.json()) as Res['json']; } catch { /* sin JSON */ }
  return { status: r.status, json };
}

async function arrancarServidor(): Promise<ChildProcess> {
  // Un servidor huérfano en el puerto haría que la corrida midiera el código
  // viejo y diera un verde mentiroso. Ya pasó.
  try {
    const ocupado = await fetch(`${BASE}/health`);
    if (ocupado.ok) {
      throw new Error(
        `el puerto ${PUERTO} ya está ocupado (fuser -k ${PUERTO}/tcp).`,
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
      OTP_DEV_CODE: OTP,
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
  // `npx` lanza un node hijo: matar solo a npx deja el servidor vivo.
  try {
    if (s.pid) process.kill(-s.pid, 'SIGKILL');
  } catch { s.kill('SIGKILL'); }
}

const sufijo = () => Math.floor(10000 + Math.random() * 89999);

const CUCUTA = { slug: 'cucuta', name: 'Cúcuta', department: 'Norte de Santander', lat: 7.8939, lng: -72.5078 };
const BUCARAMANGA = { slug: 'bucaramanga', name: 'Bucaramanga', department: 'Santander', lat: 7.1193, lng: -73.1227 };
const BOGOTA = { slug: 'bogota', name: 'Bogotá', department: 'Cundinamarca', lat: 4.711, lng: -74.0721 };

async function entrarComoCliente(telefono: string): Promise<string> {
  await pedir('POST', '/client/auth/send-otp', { body: { phone: telefono } });
  const r = await pedir('POST', '/client/auth/verify-otp', {
    body: { phone: telefono, otp: OTP, name: 'Mayorista E2E' },
  });
  const data = r.json.data as { token?: string } | undefined;
  if (!data?.token) throw new Error(`no se pudo entrar: ${JSON.stringify(r.json)}`);
  return data.token;
}

interface Cotizacion {
  intercity: boolean;
  destCity: string | null;
  destCityLabel: string | null;
  intercityFee: number;
  deliveryFee: number;
  envioTotal: number;
  lastMile: boolean;
  puedeUltimaMilla: boolean;
  etaMinutes: number;
  promisedAt: string | null;
  rechazo: string | null;
}

async function cotizar(
  bizId: string,
  q: { lat?: number; lng?: number; lastMile?: boolean },
): Promise<Cotizacion> {
  const params = new URLSearchParams();
  if (q.lat != null) params.set('lat', String(q.lat));
  if (q.lng != null) params.set('lng', String(q.lng));
  params.set('lastMile', String(q.lastMile === true));
  const r = await pedir('GET', `/client/businesses/${bizId}/envio?${params}`);
  return r.json.data as Cotizacion;
}

async function main() {
  const servidor = await arrancarServidor();
  const marca = `e2etienda-${Date.now()}`;

  try {
    for (const m of [CUCUTA, BUCARAMANGA, BOGOTA]) {
      await prisma.municipality.upsert({
        where: { slug: m.slug },
        update: { name: m.name, department: m.department, lat: m.lat, lng: m.lng, isActive: true },
        create: { ...m, isActive: true },
      });
    }

    // ── 1. La categoría «Tiendas» existe de punta a punta ───────────────────
    console.log('\n[1] La tienda de mercancía se registra y sale como tienda');
    const reg = await pedir('POST', '/business/register', {
      body: {
        name: `${marca} Almacén`,
        ownerName: 'Dueño Mayorista',
        phone: `+5730099${sufijo()}`,
        address: 'Avenida 0 # 10-50',
        category: 'store',
      },
    });
    check(reg.status === 201, 'una tienda de mercancía se puede registrar', reg.json);
    const creado = reg.json.data as { id: string; category: string } | undefined;
    check(creado?.category === 'store', 'y queda con la categoría store', creado?.category);

    const invalida = await pedir('POST', '/business/register', {
      body: {
        name: `${marca} Rara`, ownerName: 'X', phone: `+5730099${sufijo()}`,
        address: 'Calle 1', category: 'ferreteria',
      },
    });
    check(
      invalida.status === 400 && (invalida.json.error ?? '').includes('Categoría no válida'),
      'una categoría inventada se rechaza en español, no con un error de base',
      invalida.json,
    );

    // El almacén vende desde Cúcuta a Bucaramanga, con corte y plazo.
    const FLETE = 28_000;
    const DOMICILIO = 6_500;
    await prisma.business.update({
      where: { id: creado!.id },
      data: {
        citySlug: CUCUTA.slug,
        lat: CUCUTA.lat,
        lng: CUCUTA.lng,
        deliveryFee: DOMICILIO,
        etaMinutes: 35,
        shipsTo: [{ city: BUCARAMANGA.slug, fee: FLETE, etaHours: 24 }] as never,
      },
    });

    const publico = await pedir('GET', `/client/businesses/${creado!.id}`);
    const bizPub = publico.json.data as { category: string; shipsTo?: unknown[] };
    check(bizPub.category === 'store', 'la app lo recibe como «store»', bizPub.category);
    check(
      (bizPub.shipsTo ?? []).length === 1,
      'y con su destino declarado, para poder anunciarlo',
      bizPub.shipsTo,
    );

    const producto = await prisma.product.create({
      data: {
        businessId: creado!.id,
        name: 'Nevera 300 L',
        description: 'Con congelador',
        price: 1_850_000,
        category: 'Electrodomésticos',
        isAvailable: true,
      },
    });

    const token = await entrarComoCliente(`+5730077${sufijo()}`);
    const items = [{ productId: producto.id, quantity: 1, unitPrice: producto.price }];

    // ── 2. La cotización y la caja dan el MISMO número ──────────────────────
    console.log('\n[2] Lo que enseña la pantalla es lo que cobra la caja');
    const q = await cotizar(creado!.id, {
      lat: BUCARAMANGA.lat, lng: BUCARAMANGA.lng,
    });
    check(q.intercity, 'la cotización reconoce que cruza de ciudad');
    check(q.destCityLabel === 'Bucaramanga', 'y dice el nombre legible, no el slug', q.destCityLabel);
    check(q.intercityFee === FLETE, `el flete es el declarado (${FLETE})`, q.intercityFee);
    check(
      q.deliveryFee === 0,
      'y el domicilio urbano NO se cobra: la recoge en la taquilla',
      q.deliveryFee,
    );
    check(q.promisedAt != null, 'se promete un instante concreto, no «24 horas»');
    check(q.puedeUltimaMilla, 'con coordenadas, la entrega a la puerta se puede ofrecer');

    const pedido = await pedir('POST', '/client/orders', {
      token,
      body: {
        businessId: creado!.id,
        deliveryAddress: 'Carrera 27 # 36-20, Bucaramanga',
        deliveryLat: BUCARAMANGA.lat,
        deliveryLng: BUCARAMANGA.lng,
        items,
      },
    });
    check(pedido.status === 201, 'el pedido a otra ciudad se crea', pedido.json);
    const creadoPedido = pedido.json.data as { id: string };
    const enBD = await prisma.order.findUnique({ where: { id: creadoPedido.id } });

    check(enBD?.isIntercity === true, 'y queda sellado como intermunicipal');
    check(
      enBD?.intercityFee === q.intercityFee,
      'EL FLETE COBRADO ES EL COTIZADO',
      { cotizado: q.intercityFee, cobrado: enBD?.intercityFee },
    );
    check(
      enBD?.deliveryFee === q.deliveryFee,
      'EL DOMICILIO COBRADO ES EL COTIZADO',
      { cotizado: q.deliveryFee, cobrado: enBD?.deliveryFee },
    );
    check(
      enBD?.total === enBD!.subtotal + q.envioTotal,
      'y el total es el subtotal más el envío cotizado',
      { total: enBD?.total, subtotal: enBD?.subtotal, envio: q.envioTotal },
    );
    check(
      enBD?.promisedAt != null,
      'la promesa se sella con el pedido, no se recalcula al mirarlo',
    );
    // Independiente de la cotización: las propias filas del pedido tienen que
    // cuadrar entre sí. Si el total sale de un cálculo y los renglones de
    // otro, el recibo no suma y nadie sabe cuál de los dos miente.
    check(
      enBD!.total ===
        enBD!.subtotal - (enBD!.promoDiscount ?? 0)
          + enBD!.deliveryFee + (enBD!.intercityFee ?? 0),
      'y el recibo cuadra consigo mismo: subtotal − promo + domicilio + flete',
      {
        total: enBD?.total, subtotal: enBD?.subtotal,
        domicilio: enBD?.deliveryFee, flete: enBD?.intercityFee,
      },
    );

    // ── 3. Con entrega a la puerta reaparece el domicilio ───────────────────
    console.log('\n[3] La entrega a la puerta en destino sí se cobra');
    const qPuerta = await cotizar(creado!.id, {
      lat: BUCARAMANGA.lat, lng: BUCARAMANGA.lng, lastMile: true,
    });
    check(qPuerta.lastMile, 'la cotización la acepta');
    check(
      qPuerta.deliveryFee === DOMICILIO,
      `y entonces el domicilio vuelve a cobrarse (${DOMICILIO})`,
      qPuerta.deliveryFee,
    );
    check(
      qPuerta.envioTotal === FLETE + DOMICILIO,
      'el envío es la suma de los dos, cada uno en su renglón',
      qPuerta.envioTotal,
    );

    const pedidoPuerta = await pedir('POST', '/client/orders', {
      token,
      body: {
        businessId: creado!.id,
        deliveryAddress: 'Carrera 27 # 36-20, Bucaramanga',
        deliveryLat: BUCARAMANGA.lat,
        deliveryLng: BUCARAMANGA.lng,
        lastMile: true,
        items,
      },
    });
    const enBD2 = await prisma.order.findUnique({
      where: { id: (pedidoPuerta.json.data as { id: string }).id },
    });
    check(enBD2?.lastMile === true, 'y el pedido queda sellado con entrega a la puerta');
    check(
      enBD2?.deliveryFee === qPuerta.deliveryFee,
      'CON PUERTA, EL DOMICILIO COBRADO TAMBIÉN ES EL COTIZADO',
      { cotizado: qPuerta.deliveryFee, cobrado: enBD2?.deliveryFee },
    );

    // ── 4. Un destino no declarado se rechaza igual en los dos sitios ───────
    console.log('\n[4] A donde el comercio NO despacha, se dice a dónde sí');
    const qBogota = await cotizar(creado!.id, { lat: BOGOTA.lat, lng: BOGOTA.lng });
    check(qBogota.rechazo != null, 'la cotización lo rechaza antes de confirmar');
    check(
      (qBogota.rechazo ?? '').includes(BUCARAMANGA.slug),
      'y nombra las ciudades a las que sí despacha',
      qBogota.rechazo,
    );

    const pedidoBogota = await pedir('POST', '/client/orders', {
      token,
      body: {
        businessId: creado!.id,
        deliveryAddress: 'Calle 100 # 15-20, Bogotá',
        deliveryLat: BOGOTA.lat,
        deliveryLng: BOGOTA.lng,
        items,
      },
    });
    check(pedidoBogota.status === 400, 'y la caja lo rechaza también', pedidoBogota.status);
    check(
      pedidoBogota.json.error === qBogota.rechazo,
      'CON EL MISMO MOTIVO, PALABRA POR PALABRA',
      { cotizacion: qBogota.rechazo, caja: pedidoBogota.json.error },
    );

    // ── 5. Sin coordenadas, el pedido es LOCAL ──────────────────────────────
    console.log('\n[5] Un dato que falta no convierte el pedido en intermunicipal');
    const qSinPunto = await cotizar(creado!.id, {});
    check(!qSinPunto.intercity, 'sin coordenadas la cotización es local');
    check(
      qSinPunto.deliveryFee === DOMICILIO && qSinPunto.intercityFee === 0,
      'cobra el domicilio de siempre y ningún flete',
      qSinPunto,
    );
    check(
      !qSinPunto.puedeUltimaMilla,
      'y la entrega a la puerta no se ofrece: no hay a dónde mandar a nadie',
    );

    const pedidoSinPunto = await pedir('POST', '/client/orders', {
      token,
      body: {
        businessId: creado!.id,
        deliveryAddress: 'Una dirección escrita a mano',
        items,
      },
    });
    const enBD3 = await prisma.order.findUnique({
      where: { id: (pedidoSinPunto.json.data as { id: string }).id },
    });
    check(enBD3?.isIntercity === false, 'y el pedido nace local, sin flete');
    check(
      enBD3?.deliveryFee === qSinPunto.deliveryFee,
      'SIN PUNTO, EL COBRO TAMBIÉN COINCIDE',
      { cotizado: qSinPunto.deliveryFee, cobrado: enBD3?.deliveryFee },
    );

    // ── 6. Un comercio sin destinos lo dice de otra forma ───────────────────
    console.log('\n[6] El comercio que solo entrega en su ciudad lo dice así');
    const soloLocal = await prisma.business.create({
      data: {
        name: `${marca} Solo Local`,
        ownerName: 'Dueña',
        phone: `+5730098${sufijo()}`,
        address: 'Calle 9 # 2-10',
        category: 'STORE',
        token: `tok-${marca}-local`,
        citySlug: CUCUTA.slug,
        lat: CUCUTA.lat,
        lng: CUCUTA.lng,
      },
    });
    const qLocal = await cotizar(soloLocal.id, { lat: BUCARAMANGA.lat, lng: BUCARAMANGA.lng });
    check(
      (qLocal.rechazo ?? '').includes('solo entrega dentro de su ciudad'),
      'sin destinos declarados no se abre a todo el país: se cierra y se explica',
      qLocal.rechazo,
    );
  } finally {
    matar(servidor);
    await prisma.$disconnect();
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Comprobaciones: ${ok} en verde, ${fallos} en rojo`);
  if (fallos > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
