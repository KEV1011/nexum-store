/**
 * E2E de la caja del turno y de «para llevar», contra PostgreSQL real.
 *
 * LO QUE SOLO SE VE EJECUTANDO, por orden de gravedad:
 *
 *  1. **Un pedido PARA LLEVAR no se despacha a ningún repartidor.** Es el
 *     error caro: el local pagaría una carrera por algo que el cliente viene
 *     a recoger al mostrador. La guarda vieja era `mode !== 'DINE_IN'`, o sea
 *     una lista de lo que NO se reparte, y añadir un modo la dejaba obsoleta
 *     en silencio. Se comprueba sembrando un repartidor ONLINE con GPS fresco
 *     y mirando que no le quede asignado, CON CONTRAPRUEBA: un domicilio con
 *     el mismo repartidor sí entra al ciclo.
 *
 *  2. **La caja solo cuenta el EFECTIVO.** Meter lo pagado con Nequi daría un
 *     faltante enorme todos los días y a la semana nadie miraría el arqueo.
 *
 *  3. **Los domicilios NO entran al cajón**: esa plata la cobró el repartidor
 *     en la puerta del cliente, no está en el local.
 *
 *  4. **Una sola caja abierta.** Dos reparten las ventas del turno entre dos
 *     arqueos: ninguno cuadra y el faltante de una es el sobrante de la otra.
 *
 *  5. **Para llevar NO abre cuenta de mesa**: se paga y se va.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/caja-y-para-llevar.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';
import * as matching from '../src/services/matching.service';
import { acceptOrderByBusiness } from '../src/services/client.service';
import { crearPedidoEnMesa } from '../src/services/mesa.service';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3137);
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
  try {
    if (s.pid) process.kill(-s.pid, 'SIGKILL');
  } catch { s.kill('SIGKILL'); }
}

interface CajaDTO {
  id: string; numero: number; openingFloat: number;
  ventasEfectivo: number; ventasElectronicas: number; esperado: number;
  countedCash: number | null; difference: number | null;
  veredicto: string | null; mesasAbiertas: number; avisos: string[];
  closedAt: string | null;
}

async function main(): Promise<void> {
  const marca = `e2ecaja-${Date.now()}`;

  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Restaurante`, ownerName: 'Dueña E2E', phone: tel(),
      address: 'Calle 5 # 3-40', category: 'RESTAURANT', token: `tok-${marca}`,
      lat: 7.3754, lng: -72.6486, citySlug: 'pamplona', etaMinutes: 20,
      tables: ['1'], deliveryFee: 3500,
    },
  });
  const plato = await prisma.product.create({
    data: {
      businessId: negocio.id, name: 'Bandeja paisa', price: 30000,
      category: 'Platos', isAvailable: true,
    },
  });

  // Repartidor listo: ONLINE, verificado y con GPS fresco a metros del local.
  // Sin él, la comprobación [1] pasaría por accidente.
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
  let codigo = '';

  try {
    {
      const r = await pedir('PUT', `/business/${negocio.token}/mesas`, { tables: ['1'] });
      codigo = (r.json.data as { menuCode?: string } | undefined)?.menuCode ?? '';
      if (!codigo) throw new Error('no se pudo crear el código de carta');
    }

    console.log('\n[1] Un pedido PARA LLEVAR no se despacha a ningún repartidor');
    let llevarId = '';
    {
      // SE LLAMA EN PROCESO y se captura la OFERTA, no el `driverId`. Mirar
      // la base no sirve: el ciclo de despacho no escribe nada hasta que
      // alguien acepta, así que `driverId === null` pasa igual con la guarda
      // rota. Ese falso positivo se cazó aquí restaurando `mode !== 'DINE_IN'`
      // y viendo que el E2E seguía en verde.
      const ofertas: Array<Record<string, unknown>> = [];
      matching.registerSendToDriver((_id, msg) => {
        ofertas.push(msg as Record<string, unknown>);
        return true;
      });

      const creado = await crearPedidoEnMesa(codigo, {
        mesa: null, paraLlevar: true,
        items: [{ productId: plato.id, quantity: 1 }],
      });
      llevarId = creado.id;

      const enBd = await prisma.order.findUnique({
        where: { id: llevarId },
        select: { mode: true, deliveryFee: true, tabId: true },
      });
      check(enBd?.mode === 'TAKEAWAY', 'queda marcado como para llevar', enBd?.mode);
      check(enBd?.deliveryFee === 0, 'y no cobra domicilio', enBd?.deliveryFee);
      // Se paga y se va: no acumula rondas.
      check(enBd?.tabId === null, 'no abre cuenta de mesa', enBd?.tabId);

      // Aceptarlo es lo que dispara el ciclo de despacho.
      await acceptOrderByBusiness(negocio.id, llevarId, 10);
      await new Promise((r2) => setTimeout(r2, 1200));

      // EL ERROR CARO: el local pagaría una carrera por algo que el cliente
      // viene a recoger al mostrador.
      check(
        !ofertas.some((o) => o['type'] === 'order_request'),
        'y NO se le ofrece a ningún repartidor',
        ofertas.map((o) => o['type']),
      );

      // CONTRAPRUEBA en el mismo sitio: un DOMICILIO del mismo local, con el
      // mismo repartidor, SÍ genera oferta. Sin ella esto pasaría igual con
      // el despacho roto del todo o con el repartidor demasiado lejos.
      ofertas.length = 0;
      const dom = await prisma.order.create({
        data: {
          businessId: negocio.id, orderRef: `DM-${Date.now() % 100000}`,
          customerName: 'Cliente', deliveryAddress: 'Calle 9 # 2-20',
          deliveryLat: 7.3754, deliveryLng: -72.6486,
          mode: 'DELIVERY', status: 'PENDING',
          subtotal: 30000, deliveryFee: 3500, total: 33500,
        },
      });
      await prisma.orderLine.create({
        data: {
          orderId: dom.id, productId: plato.id, productName: plato.name,
          quantity: 1, unitPrice: 30000, subtotal: 30000,
        },
      });
      await acceptOrderByBusiness(negocio.id, dom.id, 10);
      await new Promise((r2) => setTimeout(r2, 1200));
      check(
        ofertas.some((o) => o['type'] === 'order_request'),
        'CONTRAPRUEBA: un domicilio del mismo local SÍ se ofrece',
        ofertas.map((o) => o['type']),
      );
      await prisma.orderLine.deleteMany({ where: { orderId: dom.id } });
      await prisma.orderEvent.deleteMany({ where: { orderId: dom.id } });
      await prisma.order.delete({ where: { id: dom.id } });
    }

    console.log('\n[3] Abrir la caja');
    let caja: CajaDTO | undefined;
    {
      const r = await pedir('POST', `/business/${negocio.token}/caja/abrir`, {
        openingFloat: 50000, openedBy: 'Cajera E2E',
      });
      check(r.status === 200, 'se abre', { s: r.status, e: r.json.error });
      caja = (r.json.data as { caja?: CajaDTO }).caja;
      check(caja?.openingFloat === 50000, 'con su base', caja?.openingFloat);
      check(caja?.esperado === 50000, 'y el esperado arranca en la base', caja?.esperado);

      // [4]: dos cajas reparten las ventas entre dos arqueos.
      const otra = await pedir('POST', `/business/${negocio.token}/caja/abrir`, {});
      check(otra.status === 400, 'y no se abre una segunda', otra.status);
      check(/ya hay una caja/i.test(otra.json.error ?? ''), 'diciendo por qué', otra.json.error);
    }

    console.log('\n[4] Solo el EFECTIVO entra al cajón');
    {
      // Una cuenta de mesa cobrada en efectivo y otra con Nequi.
      await pedir('POST', `/carta/${codigo}/pedido`, {
        mesa: '1', items: [{ productId: plato.id, quantity: 2 }],
      });
      const abiertas = await pedir('GET', `/business/${negocio.token}/cuentas`);
      const cta = ((abiertas.json.data as { cuentas?: Array<{ id: string }> }).cuentas ?? [])[0];
      await pedir('POST', `/business/${negocio.token}/cuentas/${cta!.id}/cerrar`, {
        paymentMethod: 'efectivo',
      });

      // Y el para llevar de [1], entregado y pagado con Nequi.
      await prisma.order.update({
        where: { id: llevarId },
        data: { status: 'DELIVERED', deliveredAt: new Date(), paymentMethod: 'nequi' },
      });

      const r = await pedir('GET', `/business/${negocio.token}/caja`);
      const c = (r.json.data as { abierta?: CajaDTO }).abierta;
      check(c?.ventasEfectivo === 60000, 'el efectivo suma la cuenta de mesa', c?.ventasEfectivo);
      // LA REGLA: lo de Nequi no está en el cajón.
      check(c?.ventasElectronicas === 30000, 'y lo electrónico va APARTE', c?.ventasElectronicas);
      check(c?.esperado === 110000, 'el esperado es base + efectivo, sin Nequi', c?.esperado);
    }

    console.log('\n[5] Los DOMICILIOS no entran al cajón');
    {
      // Esa plata la cobró el repartidor en la puerta del cliente.
      const dom = await prisma.order.create({
        data: {
          businessId: negocio.id, orderRef: `DM-${Date.now() % 100000}`,
          customerName: 'Cliente', deliveryAddress: 'Calle 9 # 2-20',
          mode: 'DELIVERY', status: 'DELIVERED', deliveredAt: new Date(),
          subtotal: 40000, deliveryFee: 3500, total: 43500,
          paymentMethod: 'efectivo',
        },
      });
      const r = await pedir('GET', `/business/${negocio.token}/caja`);
      const c = (r.json.data as { abierta?: CajaDTO }).abierta;
      check(c?.esperado === 110000, 'el esperado NO se mueve con un domicilio', c?.esperado);
      await prisma.order.delete({ where: { id: dom.id } });
    }

    console.log('\n[6] Cerrar la caja y ver si cuadra');
    {
      const sinContar = await pedir('POST', `/business/${negocio.token}/caja/cerrar`, {});
      check(sinContar.status === 400, 'no se cierra sin contar', sinContar.status);

      // Faltan 20.000: es el caso que hay que ver escrito.
      const r = await pedir('POST', `/business/${negocio.token}/caja/cerrar`, {
        countedCash: 90000, closedBy: 'Cajera E2E', notes: 'Se pagó el gas',
      });
      check(r.status === 200, 'se cierra', { s: r.status, e: r.json.error });
      const c = (r.json.data as { caja?: CajaDTO }).caja;
      check(c?.difference === -20000, 'y la diferencia es el faltante', c?.difference);
      check(c?.veredicto === 'falta', 'dicho con su palabra', c?.veredicto);

      const otra = await pedir('POST', `/business/${negocio.token}/caja/cerrar`, {
        countedCash: 110000,
      });
      check(otra.status === 400, 'cerrarla dos veces se rechaza', otra.status);

      // Y ahora SÍ se puede abrir otra: el turno siguiente.
      const nueva = await pedir('POST', `/business/${negocio.token}/caja/abrir`, {
        openingFloat: 50000,
      });
      check(nueva.status === 200, 'y el turno siguiente abre su caja', nueva.status);
      const n = (nueva.json.data as { caja?: CajaDTO }).caja;
      check(n?.numero === 2, 'con el número siguiente del día', n?.numero);
      // El esperado del turno nuevo NO arrastra lo del anterior.
      check(n?.esperado === 50000, 'y empieza limpio', n?.esperado);
    }
  } finally {
    matar(servidor);
    const pedidos = await prisma.order.findMany({
      where: { businessId: negocio.id }, select: { id: true },
    });
    const ids = pedidos.map((p) => p.id);
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { businessId: negocio.id } });
    await prisma.tableTab.deleteMany({ where: { businessId: negocio.id } });
    await prisma.product.deleteMany({ where: { businessId: negocio.id } });
    await prisma.business.delete({ where: { id: negocio.id } });
    await prisma.vehicle.deleteMany({ where: { driverId: repartidor.id } });
    await prisma.driver.delete({ where: { id: repartidor.id } });
    await prisma.$disconnect();
  }

  console.log(`\n${fallos === 0 ? '✅ TODO EN VERDE' : `❌ ${fallos} fallo(s)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
