/**
 * E2E: pedir a la mesa desde la APP, contra PostgreSQL real y por HTTP.
 *
 * La app usa la MISMA ruta que la carta web del QR (`POST /carta/:código/
 * pedido`); lo único nuevo es que, con sesión, manda su token y el pedido
 * queda apuntado al comensal (`dinerUserId`). Lo que se comprueba:
 *
 *  1. Con token de cliente, el pedido queda en SU cuenta — y sale en Mesas /
 *     Cuentas del portal EXACTAMENTE igual que el del QR web (mismo modo,
 *     misma cuenta de mesa, `userId` nulo: no se cuela en la lista de
 *     domicilios del portal).
 *  2. Aparece en «Pedidos en el local» del cliente con el código de la carta,
 *     y NO en su lista de domicilios.
 *  3. Un token inválido, vencido o de conductor NO bloquea el pedido: pide
 *     como el comensal sin cuenta.
 *  4. Nunca se despacha a un repartidor aunque haya uno al lado (oferta
 *     capturada), con contraprueba de un domicilio del mismo local.
 *  5. Al comensal le llegan los avisos de la cocina con el código de la carta.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/mesa-desde-la-app.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3127);
const BASE = `http://localhost:${PUERTO}`;
const SECRETO = process.env['JWT_SECRET'] ?? 'e2e-secreto-largo-para-firmar-0123456789';
process.env['JWT_SECRET'] = SECRETO;

let fallos = 0;
function check(ok: boolean, nombre: string, detalle: unknown = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${JSON.stringify(detalle)}`}`);
  if (!ok) fallos++;
}

interface Res { status: number; json: { success?: boolean; data?: unknown; error?: string } }

async function pedir(metodo: string, path: string, body?: unknown, token?: string): Promise<Res> {
  const r = await fetch(`${BASE}${path}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
    if (ocupado.ok) throw new Error(`el puerto ${PUERTO} ya está ocupado (fuser -k ${PUERTO}/tcp)`);
  } catch (e) {
    if (e instanceof Error && e.message.includes('ya está ocupado')) throw e;
  }
  const hijo = spawn('npx', ['tsx', 'src/index.ts'], {
    detached: true,
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PUERTO), NODE_ENV: 'development', JWT_SECRET: SECRETO },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const registros: string[] = [];
  hijo.stdout?.on('data', (b: Buffer) => registros.push(b.toString()));
  hijo.stderr?.on('data', (b: Buffer) => registros.push(b.toString()));
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      if ((await fetch(`${BASE}/health`)).ok) return hijo;
    } catch { /* todavía no */ }
  }
  console.error(registros.join(''));
  throw new Error('el servidor no arrancó');
}

function matar(s: ChildProcess): void {
  try { if (s.pid) process.kill(-s.pid, 'SIGKILL'); } catch { s.kill('SIGKILL'); }
}

async function main(): Promise<void> {
  const marca = `e2eapp-${Date.now()}`;
  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Restaurante`, ownerName: 'Dueño E2E', phone: tel(),
      address: 'Calle 5 # 3-40', category: 'RESTAURANT', token: `tok-${marca}`,
      lat: 7.3754, lng: -72.6486, citySlug: 'pamplona', deliveryFee: 3500, etaMinutes: 30,
    },
  });
  const plato = await prisma.product.create({
    data: { businessId: negocio.id, name: 'Picada', price: 20000, category: 'Platos', isAvailable: true },
  });
  const comensal = await prisma.user.create({
    data: { phone: tel(), name: 'Comensal E2E', fcmToken: `fcm-${marca}` },
  });
  const tokenCliente = jwt.sign(
    { clientId: comensal.id, phone: comensal.phone, role: 'client' }, SECRETO, { expiresIn: '1h' },
  );

  // Repartidor ONLINE, verificado y con GPS fresco junto al local.
  const repartidor = await prisma.driver.create({
    data: {
      phone: tel(), name: 'Repartidor E2E', status: 'ONLINE',
      isVerified: true, acceptsOrders: true, acceptsTrips: true,
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: repartidor.id, type: 'MOTO', isActive: true, brand: 'P', model: 'X',
      plate: `M${Math.floor(1000 + Math.random() * 8999)}`, year: 2021, color: 'Rojo',
    },
  });
  await prisma.$executeRaw`
    UPDATE "drivers"
    SET "geo" = ST_SetSRID(ST_MakePoint(-72.6486, 7.3754), 4326)::geography,
        "lastSeenAt" = now(), "lastLat" = 7.3754, "lastLng" = -72.6486
    WHERE "id" = ${repartidor.id}`;

  const servidor = await arrancarServidor();
  try {
    const m = await pedir('PUT', `/business/${negocio.token}/mesas`, { tables: ['1', '2', '3'] });
    const codigo = (m.json.data as { menuCode?: string } | undefined)?.menuCode ?? '';
    check(codigo.length > 0, 'el local tiene código de carta', m.json);

    console.log('\n[1] Con sesión, el pedido queda en la cuenta del comensal');
    let deApp = '';
    let refApp = '';
    {
      const r = await pedir('POST', `/carta/${codigo}/pedido`, {
        mesa: '1', items: [{ productId: plato.id, quantity: 2 }],
      }, tokenCliente);
      const d = r.json.data as { id?: string; orderRef?: string; total?: number } | undefined;
      deApp = d?.id ?? '';
      refApp = d?.orderRef ?? '';
      check(r.status === 201, 'se crea', { s: r.status, e: r.json.error });
      check(d?.total === 40000, 'al precio de la base, sin domicilio', d?.total);
      const fila = await prisma.order.findUnique({ where: { id: deApp } });
      check(fila?.dinerUserId === comensal.id, 'apuntado al comensal', fila?.dinerUserId);
      check(fila?.userId === null, 'y SIN userId: no se cuela en los domicilios', fila?.userId);
    }

    console.log('\n[2] Sale en Mesas/Cuentas igual que el del QR web');
    {
      const web = await pedir('POST', `/carta/${codigo}/pedido`, {
        mesa: '2', items: [{ productId: plato.id, quantity: 2 }],
      });
      const idWeb = (web.json.data as { id?: string; orderRef?: string } | undefined)?.id ?? '';
      const refWeb = (web.json.data as { orderRef?: string } | undefined)?.orderRef ?? '';
      check(web.status === 201, 'el del QR web también se crea', web.status);
      const [a, w] = await Promise.all([
        prisma.order.findUnique({ where: { id: deApp } }),
        prisma.order.findUnique({ where: { id: idWeb } }),
      ]);
      check(a?.dinerUserId === comensal.id && w?.dinerUserId === null, 'solo el de la app tiene comensal');
      const campos = ['mode', 'status', 'deliveryFee', 'subtotal', 'total', 'userId', 'driverId',
        'pickupPin', 'deliveryPin', 'etaMinutes', 'isIntercity'] as const;
      const distintos = campos.filter((c) => a?.[c] !== w?.[c]);
      check(distintos.length === 0, 'el resto de la fila es idéntica', distintos);
      check(!!a?.tabId && !!w?.tabId && a.tabId !== w.tabId, 'cada uno en la cuenta de su mesa', {
        a: a?.tabId, w: w?.tabId,
      });
      const cuentas = await pedir('GET', `/business/${negocio.token}/cuentas`);
      const txt = JSON.stringify(cuentas.json.data ?? {});
      check(cuentas.status === 200, 'el portal abre Cuentas', cuentas.status);
      check(txt.includes(refApp) && txt.includes(refWeb), 'y los dos salen ahí', { refApp, refWeb });
      const pendientes = await pedir('GET', `/business/${negocio.token}/client-orders`);
      check(
        !JSON.stringify(pendientes.json.data ?? {}).includes(deApp) ||
          JSON.stringify(pendientes.json.data ?? {}).includes(idWeb),
        'en la lista de pedidos del portal sale igual que el del QR (los dos o ninguno)',
      );
    }

    console.log('\n[3] «Pedidos en el local» del cliente, y no en sus domicilios');
    {
      const r = await pedir('GET', '/client/mesa/pedidos', undefined, tokenCliente);
      const lista = (r.json.data as Array<{ id: string; codigo?: string }> | undefined) ?? [];
      check(r.status === 200, 'responde', { s: r.status, e: r.json.error });
      const mio = lista.find((p) => p.id === deApp);
      check(!!mio, 'sale su pedido', lista.map((p) => p.id));
      check(mio?.codigo === codigo, 'con el código de la carta para abrirlo', mio?.codigo);
      check(lista.length === 1, 'y solo el suyo (no el de la otra mesa)', lista.length);
      const sin = await pedir('GET', '/client/mesa/pedidos');
      check(sin.status === 401, 'sin sesión no lista nada', sin.status);
      const dom = await pedir('GET', '/client/orders', undefined, tokenCliente);
      check(!JSON.stringify(dom.json.data ?? {}).includes(deApp), 'no aparece en sus domicilios');
    }

    console.log('\n[4] Un token malo NO bloquea el pedido');
    {
      const malos = {
        basura: 'no-es-un-jwt',
        vencido: jwt.sign({ clientId: comensal.id, role: 'client' }, SECRETO, { expiresIn: -10 }),
        otraFirma: jwt.sign({ clientId: comensal.id, role: 'client' }, 'otro-secreto'),
        conductor: jwt.sign({ driverId: repartidor.id, role: 'driver' }, SECRETO),
      };
      for (const [nombre, t] of Object.entries(malos)) {
        const r = await pedir('POST', `/carta/${codigo}/pedido`, {
          mesa: '3', items: [{ productId: plato.id, quantity: 1 }],
        }, t);
        const id = (r.json.data as { id?: string } | undefined)?.id ?? '';
        const fila = id ? await prisma.order.findUnique({ where: { id } }) : null;
        check(r.status === 201 && fila?.dinerUserId === null, `token ${nombre}: pide igual, sin cuenta`, {
          s: r.status, d: fila?.dinerUserId, e: r.json.error,
        });
      }
    }

    console.log('\n[5] Nunca se despacha, y el comensal recibe los avisos');
    {
      const matching = await import('../src/services/matching.service');
      const mesaSrv = await import('../src/services/mesa.service');
      const cliente = await import('../src/services/client.service');
      const ofertas: Array<Record<string, unknown>> = [];
      matching.registerSendToDriver((_id, msg) => {
        ofertas.push(msg as Record<string, unknown>);
        return true;
      });
      const avisos: string[] = [];
      const log = console.log;
      console.log = (...a: unknown[]) => {
        const t = a.map(String).join(' ');
        if (t.includes('[Push:mock]')) avisos.push(t);
        else log(...a);
      };
      try {
        const p = await mesaSrv.crearPedidoEnMesa(codigo, {
          mesa: '1', comensalId: comensal.id, items: [{ productId: plato.id, quantity: 1 }],
        });
        await cliente.acceptOrderByBusiness(negocio.id, p.id, 12);
        await cliente.markOrderReadyByBusiness(negocio.id, p.id);
        await new Promise((res) => setTimeout(res, 900));
        check(!ofertas.some((o) => o['type'] === 'order_request'),
          'NO se ofrece a ningún repartidor', ofertas.map((o) => o['type']));
        const delComensal = avisos.filter((t) => t.includes(`user=${comensal.id}`));
        check(delComensal.some((t) => t.includes('type=mesa_preparing')), 'aviso «en la cocina»', avisos);
        check(delComensal.some((t) => t.includes('type=mesa_ready')), 'aviso «listo»', avisos);
        check(!delComensal.some((t) => /type=order_/.test(t)),
          'sin los avisos de domicilio («saldrá pronto»)', delComensal);

        // Contraprueba: un domicilio del MISMO local con el MISMO repartidor sí se ofrece.
        ofertas.length = 0;
        const dom = await prisma.order.create({
          data: {
            orderRef: `NX-${Math.floor(1000 + Math.random() * 8000)}`,
            userId: comensal.id, businessId: negocio.id, status: 'PENDING',
            deliveryAddress: 'Calle 6 # 4-10', deliveryLat: 7.376, deliveryLng: -72.649,
            subtotal: 20000, deliveryFee: 3500, total: 23500,
            lines: { create: [{ productId: plato.id, productName: plato.name, quantity: 1,
              unitPrice: 20000, subtotal: 20000, optionIds: [] }] },
          },
        });
        await cliente.acceptOrderByBusiness(negocio.id, dom.id, 10);
        await cliente.markOrderReadyByBusiness(negocio.id, dom.id);
        await new Promise((res) => setTimeout(res, 1500));
        check(ofertas.some((o) => o['type'] === 'order_request'),
          'contraprueba: el domicilio SÍ se le ofrece al repartidor', ofertas.map((o) => o['type']));
        matching.cancelSearchRetry(`order:${dom.id}`);
      } finally {
        console.log = log;
      }
    }
  } finally {
    matar(servidor);
    const ids = (await prisma.order.findMany({
      where: { businessId: negocio.id }, select: { id: true },
    })).map((o) => o.id);
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: ids } } }).catch(() => undefined);
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { businessId: negocio.id } });
    await prisma.tableTab.deleteMany({ where: { businessId: negocio.id } }).catch(() => undefined);
    await prisma.product.deleteMany({ where: { businessId: negocio.id } });
    await prisma.business.delete({ where: { id: negocio.id } }).catch(() => undefined);
    await prisma.vehicle.deleteMany({ where: { driverId: repartidor.id } });
    await prisma.driver.delete({ where: { id: repartidor.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: comensal.id } }).catch(() => undefined);
  }

  console.log(fallos === 0 ? '\nTODO EN VERDE' : `\n${fallos} FALLOS`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
