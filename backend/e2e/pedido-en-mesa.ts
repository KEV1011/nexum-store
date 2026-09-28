/**
 * E2E del pedido desde la mesa, contra PostgreSQL real y por HTTP.
 *
 * LO QUE SOLO SE VE EJECUTANDO, por orden de gravedad:
 *
 *  1. **Un pedido en mesa NO se despacha a ningún repartidor.** Es el error más
 *     caro de todos: mandaría una moto a recoger un plato que ya está en la
 *     mano de quien lo pidió, y habría que pagarle la carrera. Se comprueba
 *     sembrando un repartidor ONLINE con GPS fresco y capturando la oferta —
 *     mirar el estado del pedido no vale por sí solo, porque el ciclo de
 *     despacho no escribe en la base hasta que alguien acepta (ese falso
 *     positivo ya se cazó en la encomienda intermunicipal). Va con una
 *     CONTRAPRUEBA: se le pregunta al MISMO motor si ese repartidor sería
 *     candidato para un pedido de ese negocio. Sin ella, la comprobación
 *     pasaría igual con el despacho roto del todo o sin nadie cerca.
 *
 *  2. **No se cobra domicilio.** En la mesa no hay nada que llevar; cobrarlo
 *     sería cobrar un servicio que nadie prestó.
 *
 *  3. **El precio sale de la base, no del navegador.** Esta ruta es pública y
 *     sin cuenta, así que es la que más falta le hace.
 *
 *  4. **Una mesa que el dueño no declaró no puede pedir.** Sin esa guarda basta
 *     cambiar `?mesa=5` por `?mesa=99` para meterle a la cocina un plato que
 *     nadie sabe a dónde llevar.
 *
 *  5. **El pedido no sale DOS veces en el portal.** Un pedido en mesa también
 *     tiene `userId` nulo, que es el filtro de la lista de domicilios.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/pedido-en-mesa.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3119);
const BASE = `http://localhost:${PUERTO}`;

let fallos = 0;
function check(ok: boolean, nombre: string, detalle: unknown = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${JSON.stringify(detalle)}`}`);
  if (!ok) fallos++;
}

interface Res { status: number; json: { success?: boolean; data?: unknown; error?: string } }

async function pedir(metodo: string, path: string, body?: unknown): Promise<Res> {
  const r = await fetch(`${BASE}${path}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: Res['json'] = {};
  try { json = (await r.json()) as Res['json']; } catch { /* sin JSON */ }
  return { status: r.status, json };
}

const tel = () => `+5730${Math.floor(10000000 + Math.random() * 89999999)}`;

async function arrancarServidor(): Promise<ChildProcess> {
  try {
    const ocupado = await fetch(`${BASE}/health`);
    if (ocupado.ok) {
      throw new Error(
        `el puerto ${PUERTO} ya está ocupado (fuser -k ${PUERTO}/tcp) o la prueba ` +
          'mediría el servidor equivocado.',
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

function matar(s: ChildProcess): void {
  // `npx` lanza un node hijo: matar solo a npx deja el servidor vivo y la
  // corrida siguiente mediría el código viejo.
  try {
    if (s.pid) process.kill(-s.pid, 'SIGKILL');
  } catch { s.kill('SIGKILL'); }
}

async function main(): Promise<void> {
  const marca = `e2emesa-${Date.now()}`;

  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Restaurante`,
      ownerName: 'Dueña E2E',
      phone: tel(),
      address: 'Calle 5 # 3-40',
      category: 'RESTAURANT',
      token: `tok-${marca}`,
      lat: 7.3754,
      lng: -72.6486,
      citySlug: 'pamplona',
      deliveryFee: 3500,
      etaMinutes: 30,
    },
  });
  const plato = await prisma.product.create({
    data: {
      businessId: negocio.id, name: 'Bandeja paisa', price: 25000,
      category: 'Platos fuertes', isAvailable: true,
    },
  });

  // Repartidor listo para recibir despacho: ONLINE, verificado y con GPS
  // fresco a metros del negocio. Sin él, el punto 1 pasaría por accidente.
  const repartidor = await prisma.driver.create({
    data: {
      phone: tel(), name: 'Repartidor E2E', status: 'ONLINE',
      isVerified: true, acceptsOrders: true, acceptsTrips: true,
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: repartidor.id, type: 'MOTO', isActive: true,
      brand: 'Prueba', model: 'X', plate: `M${Math.floor(1000 + Math.random() * 8999)}`,
      year: 2021, color: 'Rojo',
    },
  });
  await prisma.$executeRaw`
    UPDATE "drivers"
    SET "geo" = ST_SetSRID(ST_MakePoint(-72.6486, 7.3754), 4326)::geography,
        "lastSeenAt" = now(), "lastLat" = 7.3754, "lastLng" = -72.6486
    WHERE "id" = ${repartidor.id}`;

  const servidor = await arrancarServidor();

  // El canal al conductor, interceptado dentro del PROCESO DEL SERVIDOR no se
  // puede: corre aparte. Se mira en la base si le quedó asignado, y además se
  // comprueba la contraprueba por el estado del pedido a domicilio.
  try {
    // ── Mesas ────────────────────────────────────────────────────────────────
    console.log('\n[1] El dueño declara sus mesas y recibe un código que NO es su token');
    let codigo = '';
    {
      const r = await pedir('PUT', `/business/${negocio.token}/mesas`, { tables: ['1', '2', 'Terraza 1'] });
      const data = r.json.data as { menuCode?: string; tables?: string[] } | undefined;
      codigo = data?.menuCode ?? '';
      check(r.status === 200, 'guarda las mesas', { s: r.status, e: r.json.error });
      check((data?.tables ?? []).length === 3, 'las tres mesas', data?.tables);
      check(codigo.length === 10, 'devuelve un código de carta', codigo);
      check(
        codigo !== negocio.token,
        'y NO es el token del portal (ese abre precios, pedidos y ajustes)',
      );
    }

    console.log('\n[2] La misma mesa escrita de dos formas se rechaza');
    {
      const r = await pedir('PUT', `/business/${negocio.token}/mesas`, { tables: ['Terraza 1', 'terraza 1'] });
      check(r.status === 400, 'se rechaza', r.status);
      check(/misma mesa/i.test(r.json.error ?? ''), 'diciendo cuáles son', r.json.error);
      const quedan = await prisma.business.findUnique({
        where: { id: negocio.id }, select: { tables: true },
      });
      check(
        (quedan?.tables as string[] | null)?.length === 3,
        'y las mesas anteriores siguen intactas',
        quedan?.tables,
      );
    }

    // ── La carta pública ─────────────────────────────────────────────────────
    console.log('\n[3] La carta se abre con el código, sin cuenta');
    {
      const r = await pedir('GET', `/carta/${codigo}`);
      const data = r.json.data as {
        business?: { name?: string; products?: unknown[] }; tables?: string[];
      } | undefined;
      check(r.status === 200, 'responde 200', r.status);
      check(data?.business?.name === negocio.name, 'con el nombre del local', data?.business?.name);
      check((data?.business?.products ?? []).length === 1, 'y su carta', data?.business?.products);
      check((data?.tables ?? []).length === 3, 'y sus mesas', data?.tables);
      // En minúsculas también: alguien lo va a teclear de un individual.
      const min = await pedir('GET', `/carta/${codigo.toLowerCase()}`);
      check(min.status === 200, 'el código sirve escrito en minúsculas', min.status);
    }

    console.log('\n[4] Una mesa que el dueño NO declaró no puede pedir');
    {
      const r = await pedir('POST', `/carta/${codigo}/pedido`, {
        mesa: '99', items: [{ productId: plato.id, quantity: 1 }],
      });
      check(r.status === 400, 'se rechaza', r.status);
      check(/mesa/i.test(r.json.error ?? ''), 'diciendo que no se reconoce', r.json.error);
      const cuantos = await prisma.order.count({ where: { businessId: negocio.id } });
      check(cuantos === 0, 'y no se creó ningún pedido', cuantos);
    }

    // ── El pedido de la mesa ─────────────────────────────────────────────────
    console.log('\n[5] El pedido de la mesa: sin domicilio, sin PIN y al precio de la BD');
    let pedidoMesa = '';
    {
      const r = await pedir('POST', `/carta/${codigo}/pedido`, {
        mesa: 'terraza 1',
        // Precio manipulado a propósito: el servidor tiene que ignorarlo.
        items: [{ productId: plato.id, quantity: 2, unitPrice: 1, notes: 'sin cebolla' }],
      });
      const data = r.json.data as { id?: string; tableLabel?: string; total?: number } | undefined;
      pedidoMesa = data?.id ?? '';
      check(r.status === 201, 'se crea', { s: r.status, e: r.json.error });
      check(data?.tableLabel === 'Terraza 1', 'con la etiqueta EXACTA del dueño', data?.tableLabel);
      check(data?.total === 50000, 'al precio del catálogo, no al que mandó el cliente', data?.total);

      const fila = await prisma.order.findUnique({
        where: { id: pedidoMesa },
        include: { lines: true },
      });
      check(fila?.mode === 'DINE_IN', 'marcado como pedido en mesa', fila?.mode);
      check(fila?.deliveryFee === 0, 'domicilio en CERO', fila?.deliveryFee);
      check(fila?.total === 50000, 'total sin domicilio', fila?.total);
      check(fila?.userId === null, 'sin cuenta: el comensal no instaló nada', fila?.userId);
      check(
        fila?.pickupPin === null && fila?.deliveryPin === null,
        'sin PIN de custodia: no hay repartidor a quien entregarle nada',
        { p: fila?.pickupPin, d: fila?.deliveryPin },
      );
      check(fila?.etaMinutes === null, 'sin tiempo prometido hasta que la cocina lo fije', fila?.etaMinutes);
      // La plaza del negocio, SELLADA: el dato existe y no copiarlo dejaba el
      // pedido fuera del panel por ciudad. Un null honesto es cuando no se
      // sabe, no cuando no se miró.
      check(
        fila?.originCitySlug === 'pamplona' && fila?.destCitySlug === 'pamplona',
        'lleva la plaza del local (se consume ahí: origen y destino son el mismo sitio)',
        { o: fila?.originCitySlug, d: fila?.destCitySlug },
      );
      check(fila?.isIntercity === false, 'y no se activa nada del camino de encomiendas');
      check(fila?.lines[0]?.notes === 'sin cebolla', 'la nota llega a la cocina', fila?.lines[0]?.notes);
      check(fila?.lines[0]?.unitPrice === 25000, 'el renglón al precio real', fila?.lines[0]?.unitPrice);
    }

    console.log('\n[6] La cocina lo acepta y fija el tiempo');
    {
      const r = await pedir('POST', `/business/${negocio.token}/client-orders/${pedidoMesa}/accept`, {
        prepMinutes: 15,
      });
      check(r.status === 200, 'lo acepta', { s: r.status, e: r.json.error });
      const fila = await prisma.order.findUnique({ where: { id: pedidoMesa } });
      check(fila?.status === 'PREPARING', 'pasa a preparándose', fila?.status);
      check(
        fila?.etaMinutes === 15,
        'el tiempo es el de la cocina, SIN sumarle trayecto de repartidor',
        fila?.etaMinutes,
      );
    }

    console.log('\n[7] La OFERTA, capturada: al de mesa NO le sale repartidor y al domicilio SÍ');
    {
      // Mirar `driverId` del pedido NO sirve para esto, y está comprobado: el
      // ciclo ofrece por WebSocket y, sin nadie conectado, nadie acepta — así
      // que queda en null con la guarda y sin ella. Quitando la guarda, esa
      // comprobación seguía en verde. Es el falso positivo de la encomienda
      // intermunicipal otra vez.
      //
      // Lo único que lo prueba es interceptar el canal al conductor, y para eso
      // hay que llamar al servicio EN ESTE proceso: el de HTTP corre aparte.
      const matching = await import('../src/services/matching.service');
      const mesaSrv = await import('../src/services/mesa.service');
      const cliente = await import('../src/services/client.service');

      const ofertas: Array<Record<string, unknown>> = [];
      matching.registerSendToDriver((_id, msg) => {
        ofertas.push(msg as Record<string, unknown>);
        return true;
      });

      // (a) Uno de mesa, por el camino real del comensal.
      const enMesa = await mesaSrv.crearPedidoEnMesa(codigo, {
        mesa: '1', items: [{ productId: plato.id, quantity: 1 }],
      });
      await cliente.acceptOrderByBusiness(negocio.id, enMesa.id, 15);
      await new Promise((res) => setTimeout(res, 900));
      check(
        !ofertas.some((m) => m['type'] === 'order_request'),
        'NO se ofrece a ningún repartidor: el plato lo lleva el mesero',
        ofertas.map((m) => m['type']),
      );

      // (b) CONTRAPRUEBA con un domicilio del MISMO negocio y el MISMO
      // repartidor. Sin ella, lo de arriba pasaría igual con el despacho roto
      // del todo o sin nadie cerca.
      ofertas.length = 0;
      const u = await prisma.user.create({ data: { phone: tel(), name: 'Cliente E2E' } });
      const domicilio = await prisma.order.create({
        data: {
          orderRef: `NX-${Math.floor(1000 + Math.random() * 8000)}`,
          userId: u.id,
          businessId: negocio.id,
          status: 'PENDING',
          deliveryAddress: 'Calle 6 # 4-10',
          deliveryLat: 7.376,
          deliveryLng: -72.649,
          subtotal: 25000,
          deliveryFee: 3500,
          total: 28500,
          lines: {
            create: [{
              productId: plato.id, productName: plato.name, quantity: 1,
              unitPrice: 25000, subtotal: 25000, optionIds: [],
            }],
          },
        },
      });
      await cliente.acceptOrderByBusiness(negocio.id, domicilio.id, 15);
      await new Promise((res) => setTimeout(res, 900));
      check(
        ofertas.some((m) => m['type'] === 'order_request'),
        'el domicilio SÍ se ofrece (el motor está vivo y ve al repartidor)',
        ofertas.map((m) => m['type']),
      );

      await prisma.orderLine.deleteMany({ where: { orderId: { in: [domicilio.id, enMesa.id] } } });
      await prisma.order.deleteMany({ where: { id: { in: [domicilio.id, enMesa.id] } } });
      await prisma.user.deleteMany({ where: { id: u.id } });
    }

  console.log('\n[8] El plato sale a la mesa: ahí se cierra');
    {
      const r = await pedir('POST', `/business/${negocio.token}/client-orders/${pedidoMesa}/servido`);
      check(r.status === 200, 'se marca servido', { s: r.status, e: r.json.error });
      const fila = await prisma.order.findUnique({ where: { id: pedidoMesa } });
      check(fila?.status === 'DELIVERED', 'queda entregado', fila?.status);
      check(fila?.deliveredAt !== null, 'con su hora', fila?.deliveredAt);

      const otra = await pedir('POST', `/business/${negocio.token}/client-orders/${pedidoMesa}/servido`);
      check(otra.status === 409, 'dos toques al botón no lo sirven dos veces', otra.status);
    }

    console.log('\n[8b] El comensal califica SIN CUENTA, y eso mueve la nota del local');
    {
      // Hasta ahora `rateClientOrder` exigía que el pedido fuera de la cuenta
      // de quien califica, así que un pedido en mesa no se podía calificar
      // NUNCA: la nota del restaurante salía solo de sus domicilios, que suele
      // ser la parte pequeña de lo que vende.
      const antes = await prisma.business.findUnique({
        where: { id: negocio.id }, select: { rating: true, ratingCount: true },
      });
      check(antes?.rating === null, 'el local nace SIN nota, no con un 5,0 de fábrica', antes);

      const r = await pedir(
        'POST', `/carta/${codigo}/pedido/${pedidoMesa}/calificar`, { estrellas: 4 },
      );
      check(r.status === 200, 'se guarda', { s: r.status, e: r.json.error });
      const despues = await prisma.business.findUnique({
        where: { id: negocio.id }, select: { rating: true, ratingCount: true },
      });
      check(despues?.rating === 4 && despues?.ratingCount === 1,
        'y el promedio del local se recalcula de las filas', despues);

      // Corregible, como en el resto de la plataforma.
      await pedir('POST', `/carta/${codigo}/pedido/${pedidoMesa}/calificar`, { estrellas: 5 });
      const corregida = await prisma.business.findUnique({
        where: { id: negocio.id }, select: { rating: true, ratingCount: true },
      });
      check(corregida?.rating === 5 && corregida?.ratingCount === 1,
        'corregir la estrella NO cuenta como una calificación más', corregida);

      // El id es la credencial: con el de otro local no se puede.
      const otro = await prisma.business.create({
        data: {
          name: `${marca} Vecino`, ownerName: 'Vecino', phone: tel(),
          address: 'Calle 7', category: 'RESTAURANT', token: `tok-v-${marca}`,
          menuCode: 'ZZZZZZZZZZ',
        },
      });
      const ajeno = await pedir(
        'POST', `/carta/ZZZZZZZZZZ/pedido/${pedidoMesa}/calificar`, { estrellas: 1 },
      );
      check(ajeno.status >= 400, 'no se puede calificar desde la carta de otro local', ajeno.status);
      const intacta = await prisma.business.findUnique({
        where: { id: negocio.id }, select: { rating: true },
      });
      check(intacta?.rating === 5, 'y la nota del primero no se movió', intacta);
      await prisma.business.delete({ where: { id: otro.id } });

      // El dueño tiene que poder distinguir de dónde viene la queja: «llegó
      // frío» del salón es su cocina, de un domicilio puede ser el repartidor.
      await pedir(
        'POST', `/carta/${codigo}/pedido/${pedidoMesa}/calificar`,
        { estrellas: 5, comentario: 'Todo muy bueno' },
      );
      const rev = await pedir('GET', `/business/${negocio.token}/reviews`);
      const comentarios = (rev.json.data as {
        comentarios?: Array<{ comentario: string; origen?: string }>;
      } | undefined)?.comentarios ?? [];
      const mio = comentarios.find((c) => c.comentario === 'Todo muy bueno');
      check(!!mio, 'el comentario del comensal LE LLEGA al dueño', comentarios);
      check(mio?.origen === 'salon', 'marcado como del SALÓN, no como domicilio', mio);
    }

    console.log('\n[9] El comensal consulta su pedido, y solo el suyo');
    {
      const r = await pedir('GET', `/carta/${codigo}/pedido/${pedidoMesa}`);
      check(r.status === 200, 'lo ve', r.status);
      const inventado = await pedir('GET', `/carta/${codigo}/pedido/cmnoexisteninguno000`);
      check(inventado.status === 404, 'un id que no existe: 404', inventado.status);
    }

    console.log('\n[10] En el portal aparece UNA vez, no dos');
    {
      // Un pedido en mesa también tiene `userId` nulo, que es justo el filtro de
      // la lista de domicilios: sin la guarda saldría en las dos listas y en
      // las cifras del día contado dos veces.
      const domi = await pedir('GET', `/business/${negocio.token}/orders`);
      const data = domi.json.data as {
        orders?: Array<{ id: string }>; stats?: { total?: number };
      } | undefined;
      check(
        !(data?.orders ?? []).some((o) => o.id === pedidoMesa),
        'NO está en la lista de domicilios',
        (data?.orders ?? []).map((o) => o.id),
      );

      // Las cifras del día tienen que CUADRAR entre sí. Al separar la lista de
      // domicilios (para que el de mesa no saliera dos veces), «Entregados»
      // dejó de contarlos mientras «En preparación» los seguía contando: el
      // dueño veía dos números del mismo día que se contradecían.
      const stats = data?.stats as {
        delivered?: number; enMesa?: number; servidosEnMesa?: number;
        ventaSalon?: number; ventaDomicilio?: number;
      } | undefined;
      check((stats?.enMesa ?? 0) >= 1, 'las cifras del día cuentan el de mesa aparte', stats);
      check((stats?.servidosEnMesa ?? 0) === 1, 'y sabe que ya se sirvió', stats);
      check(
        (stats?.ventaSalon ?? 0) === 50000,
        'con lo vendido en el SALÓN, que es lo que el dueño quiere saber',
        stats,
      );
      check(
        (stats?.ventaDomicilio ?? 0) === 0,
        'y sin mezclarlo con el domicilio',
        stats,
      );

      const online = await pedir('GET', `/business/${negocio.token}/client-orders`);
      const lista = online.json.data as Array<{ id: string; mode?: string; tableLabel?: string }>;
      const mio = lista.find((o) => o.id === pedidoMesa);
      check(!!mio, 'SÍ está en los pedidos del local');
      check(mio?.mode === 'DINE_IN', 'marcado como en mesa', mio?.mode);
      check(mio?.tableLabel === 'Terraza 1', 'con la mesa, que es lo que la cocina mira', mio?.tableLabel);
    }

    console.log('\n[11] Con el local cerrado no se puede pedir');
    {
      await prisma.business.update({
        where: { id: negocio.id }, data: { acceptingOrders: false },
      });
      const r = await pedir('POST', `/carta/${codigo}/pedido`, {
        mesa: '1', items: [{ productId: plato.id, quantity: 1 }],
      });
      check(r.status === 400, 'se rechaza', r.status);
      check(
        /no está tomando pedidos/i.test(r.json.error ?? ''),
        'diciendo el motivo, no un «no se pudo»',
        r.json.error,
      );
      await prisma.business.update({
        where: { id: negocio.id }, data: { acceptingOrders: true },
      });
    }

    console.log('\n[12] Un local sin mesas declaradas no acepta pedidos de mesa');
    {
      await prisma.business.update({ where: { id: negocio.id }, data: { tables: [] } });
      const r = await pedir('POST', `/carta/${codigo}/pedido`, {
        mesa: '1', items: [{ productId: plato.id, quantity: 1 }],
      });
      check(r.status === 400, 'se rechaza', r.status);
      check(/mesero/i.test(r.json.error ?? ''), 'y se le dice qué hacer', r.json.error);
    }
  } finally {
    matar(servidor);
  }

  // ── Limpieza ───────────────────────────────────────────────────────────────
  await prisma.orderLine.deleteMany({ where: { order: { businessId: negocio.id } } });
  await prisma.order.deleteMany({ where: { businessId: negocio.id } });
  await prisma.product.deleteMany({ where: { businessId: negocio.id } });
  await prisma.business.delete({ where: { id: negocio.id } });
  await prisma.vehicle.deleteMany({ where: { driverId: repartidor.id } });
  await prisma.driver.delete({ where: { id: repartidor.id } });

  console.log(`\n${fallos === 0 ? 'TODO EN VERDE' : 'HAY FALLOS'}: ${fallos} fallos`);
  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
