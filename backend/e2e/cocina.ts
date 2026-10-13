/**
 * E2E de la pantalla de la cocina, contra PostgreSQL real y por HTTP.
 *
 * OJO AL ESCRIBIR AQUÍ: `Order.readyAt` y `Order.acceptedAt` YA EXISTÍAN, y
 * `markOrderReadyByBusiness` ya los escribe avisando al repartidor y al
 * cliente. La primera versión de esta pantalla se inventó una columna propia
 * y su propio marcado, que habría dejado dos caminos con efectos distintos
 * según por dónde se tocara el botón. Lo nuevo es la LISTA y el deshacer.
 *
 * LO QUE SOLO SE VE EJECUTANDO, por orden de gravedad:
 *
 *  1. **Mesa y domicilio salen en la MISMA lista.** Es la decisión que ordena
 *     toda la pantalla: a la cocina le da igual el destino para cocinar, y dos
 *     listas la obligarían a decidir ella el orden. El portal del dueño los
 *     lleva aparte (`mode: 'DELIVERY'` en su consulta), así que es fácil que
 *     alguien copie ese filtro aquí y deje los pedidos de mesa fuera — la
 *     cocina no los vería y nadie los cocinaría.
 *
 *  2. **El reloj cuenta desde que el negocio ACEPTÓ.** Si contara desde
 *     `createdAt`, el rato que el pedido pasó en el mostrador esperando a que
 *     lo aceptaran se le cargaría a la cocina. Solo se ve con un pedido que de
 *     verdad haya estado un rato en PENDING.
 *
 *  3. **Marcar listo NO mueve el estado logístico.** Si lo moviera, el
 *     repartidor dejaría de ir o el pedido se cerraría antes de salir. Es la
 *     razón de que «listo» sea una marca aparte y no un `OrderStatus`.
 *
 *  4. **El token de un local no marca el pedido de otro.** La ruta es pública
 *     salvo por el token, así que la pertenencia tiene que comprobarse.
 *
 *  5. **Lo que el cliente dijo de viva voz llega entero.** Las notas y las
 *     opciones son lo único que, si se pierde, obliga a rehacer el plato.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/cocina.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import WebSocket from 'ws';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3127);
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

/**
 * Se conecta al socket del NEGOCIO y recoge lo que llegue.
 *
 * Es el canal que mueve el portal y la pantalla de cocina. Hasta esta tanda
 * solo traía `new_order`: los cambios de estado no llegaban, y por eso la
 * cocina marcaba un plato listo y el portal no se movía.
 */
function escucharNegocio(token: string): {
  recibidos: Array<Record<string, unknown>>;
  listo: Promise<void>;
  cerrar: () => void;
} {
  const ws = new WebSocket(`ws://localhost:${PUERTO}`);
  const recibidos: Array<Record<string, unknown>> = [];
  const listo = new Promise<void>((resolve, reject) => {
    const limite = setTimeout(() => reject(new Error('el socket no autenticó')), 10000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'business_auth', token })));
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(String(raw)) as Record<string, unknown>;
        recibidos.push(m);
        if (m['type'] === 'business_auth_ok') { clearTimeout(limite); resolve(); }
      } catch { /* mensaje ilegible */ }
    });
    ws.on('error', reject);
  });
  return { recibidos, listo, cerrar: () => ws.close() };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PedidoCocinaDTO {
  id: string;
  mode: string;
  tableLabel: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  lineas: Array<{ productName: string; quantity: number; optionsSummary: string | null; notes: string | null }>;
}

async function main(): Promise<void> {
  const marca = `e2ecocina-${Date.now()}`;

  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Restaurante`, ownerName: 'Dueña E2E', phone: tel(),
      address: 'Calle 5 # 3-40', category: 'RESTAURANT', token: `tok-${marca}`,
      lat: 7.3754, lng: -72.6486, citySlug: 'pamplona',
      deliveryFee: 3500, etaMinutes: 20,
    },
  });
  // Un SEGUNDO local, para comprobar que su token no toca lo ajeno.
  const vecino = await prisma.business.create({
    data: {
      name: `${marca} Vecino`, ownerName: 'Otro', phone: tel(),
      address: 'Calle 6 # 1-10', category: 'RESTAURANT', token: `tok-vec-${marca}`,
      lat: 7.3755, lng: -72.6487, citySlug: 'pamplona',
    },
  });
  const plato = await prisma.product.create({
    data: {
      businessId: negocio.id, name: 'Bandeja paisa', price: 25000,
      category: 'Platos fuertes', isAvailable: true,
    },
  });

  const servidor = await arrancarServidor();

  try {
    // Se siembran tres pedidos a mano para controlar los tiempos con
    // precisión: por HTTP no se puede hacer que un pedido lleve 40 minutos.
    const hace = (m: number) => new Date(Date.now() - m * 60000);

    async function sembrar(opts: {
      mode: 'DELIVERY' | 'DINE_IN';
      tableLabel?: string;
      estado: 'PENDING' | 'PREPARING' | 'IN_TRANSIT' | 'DELIVERED';
      /** Minutos que lleva EN COCINA (desde que se aceptó). */
      enCocinaHace?: number;
      /** Minutos que lleva creado (en el mostrador antes de aceptarse). */
      creadoHace: number;
      notas?: string;
      opciones?: string;
      cantidad?: number;
      negocioId?: string;
    }) {
      const o = await prisma.order.create({
        data: {
          businessId: opts.negocioId ?? negocio.id,
          orderRef: `ZP-${Math.floor(100000 + Math.random() * 899999)}`,
          customerName: 'Cliente E2E',
          deliveryAddress: opts.mode === 'DINE_IN' ? 'En el local' : 'Calle 9 # 2-20',
          mode: opts.mode,
          tableLabel: opts.tableLabel ?? null,
          status: opts.estado,
          subtotal: 25000, deliveryFee: 0, total: 25000,
          etaMinutes: 20,
          createdAt: hace(opts.creadoHace),
          // El reloj de la cocina: `acceptedAt` es el campo que YA existía
          // para esto («arranca el contador de preparación», dice su
          // comentario en el esquema).
          acceptedAt: opts.enCocinaHace != null ? hace(opts.enCocinaHace) : null,
        },
      });
      await prisma.orderLine.create({
        data: {
          orderId: o.id, productId: plato.id, productName: plato.name,
          quantity: opts.cantidad ?? 1, unitPrice: 25000, subtotal: 25000,
          optionsSummary: opts.opciones ?? null,
          notes: opts.notas ?? null,
        },
      });
      return o;
    }

    // Un pedido de MESA aceptado hace 10 min, que estuvo 25 min en el
    // mostrador antes: el reloj de cocina debe decir 10, no 35.
    const deMesa = await sembrar({
      mode: 'DINE_IN', tableLabel: 'Terraza 1', estado: 'PREPARING',
      creadoHace: 35, enCocinaHace: 10,
      notas: 'Sin cebolla, por favor', opciones: 'Grande · +Queso', cantidad: 2,
    });
    const aDomicilio = await sembrar({
      mode: 'DELIVERY', estado: 'PREPARING', creadoHace: 40, enCocinaHace: 40,
    });
    // En PENDING el dueño todavía no ha aceptado: la cocina no debe verlo.
    const sinAceptar = await sembrar({
      mode: 'DELIVERY', estado: 'PENDING', creadoHace: 3,
    });
    // Ya salió: fuera del tablero.
    const yaSalio = await sembrar({
      mode: 'DELIVERY', estado: 'IN_TRANSIT', creadoHace: 60, enCocinaHace: 50,
    });
    const delVecino = await sembrar({
      mode: 'DELIVERY', estado: 'PREPARING', creadoHace: 5, enCocinaHace: 5,
      negocioId: vecino.id,
    });

    console.log('\n[1] Mesa y domicilio salen en la MISMA lista');
    let tablero: PedidoCocinaDTO[] = [];
    {
      const r = await pedir('GET', `/business/${negocio.token}/cocina`);
      const data = r.json.data as { pedidos?: PedidoCocinaDTO[]; platos?: number } | undefined;
      tablero = data?.pedidos ?? [];
      check(r.status === 200, 'responde', { s: r.status, e: r.json.error });

      const ids = tablero.map((p) => p.id);
      check(ids.includes(deMesa.id), 'el de MESA está en el tablero');
      check(ids.includes(aDomicilio.id), 'el de DOMICILIO también');
      check(
        tablero.some((p) => p.mode === 'DINE_IN') && tablero.some((p) => p.mode === 'DELIVERY'),
        'los dos modos conviven en la misma lista',
        tablero.map((p) => p.mode),
      );

      check(!ids.includes(sinAceptar.id), 'el que el dueño NO ha aceptado no aparece');
      check(!ids.includes(yaSalio.id), 'el que ya salió tampoco');
      check(!ids.includes(delVecino.id), 'y el del local vecino menos');

      // La carga son PLATOS: 2 del de mesa + 1 del de domicilio.
      check(data?.platos === 3, 'cuenta PLATOS y no pedidos', data?.platos);
    }

    console.log('\n[2] El reloj cuenta desde que se ACEPTÓ, no desde que se pidió');
    {
      const mesa = tablero.find((p) => p.id === deMesa.id);
      check(mesa?.acceptedAt != null, 'el de mesa trae su hora de entrada');
      const min = mesa?.acceptedAt
        ? Math.floor((Date.now() - new Date(mesa.acceptedAt).getTime()) / 60000)
        : -1;
      // Se aceptó hace 10 min y se creó hace 35. Si contara desde `createdAt`
      // saldría 35 y le cargaría a la cocina la espera del mostrador.
      check(min >= 9 && min <= 11, 'lleva ~10 min de cocina, no ~35', min);
    }

    console.log('\n[3] El más antiguo va primero y llega lo que dijo el cliente');
    {
      check(tablero[0]?.id === aDomicilio.id, 'el que lleva 40 min encabeza', tablero[0]?.id);
      const mesa = tablero.find((p) => p.id === deMesa.id);
      check(mesa?.lineas[0]?.notes === 'Sin cebolla, por favor', 'la nota de viva voz llega entera', mesa?.lineas[0]?.notes);
      check(mesa?.lineas[0]?.optionsSummary === 'Grande · +Queso', 'y las opciones elegidas', mesa?.lineas[0]?.optionsSummary);
      check(mesa?.tableLabel === 'Terraza 1', 'con la mesa sellada', mesa?.tableLabel);
    }

    console.log('\n[4] Marcar listo NO mueve el estado logístico');
    {
      const antes = await prisma.order.findUnique({
        where: { id: aDomicilio.id }, select: { status: true },
      });
      // Por la ruta que YA existía, que además avisa al repartidor y al cliente.
      const r = await pedir('POST', `/business/${negocio.token}/client-orders/${aDomicilio.id}/ready`);
      check(r.status === 200, 'lo marca', { s: r.status, e: r.json.error });

      const despues = await prisma.order.findUnique({
        where: { id: aDomicilio.id }, select: { status: true, readyAt: true },
      });
      check(despues?.readyAt != null, 'queda la marca de la cocina');
      // Esto es lo que protege el despacho: si «listo» moviera el estado, el
      // repartidor dejaría de ir o el pedido se cerraría antes de salir.
      check(
        despues?.status === antes?.status,
        'y el estado del pedido NO cambia',
        { antes: antes?.status, despues: despues?.status },
      );
    }

    console.log('\n[5] Lo marcado sigue a la vista, en su columna');
    {
      const r = await pedir('GET', `/business/${negocio.token}/cocina`);
      const data = r.json.data as { pedidos?: PedidoCocinaDTO[]; platos?: number } | undefined;
      const p = (data?.pedidos ?? []).find((x) => x.id === aDomicilio.id);
      // No desaparece: si se fuera, el cocinero no podría comprobar qué
      // entregó y acabaría repitiendo el plato.
      check(p != null, 'el plato hecho sigue en el tablero');
      check(p?.readyAt != null, 'marcado como listo', p?.readyAt);
      // Y deja de contar como carga pendiente: quedan los 2 del de mesa.
      check(data?.platos === 2, 'y ya no cuenta como pendiente', data?.platos);
    }

    console.log('\n[6] Se puede DESMARCAR: el dedo se equivoca');
    {
      const r = await pedir('DELETE', `/business/${negocio.token}/cocina/${aDomicilio.id}/listo`);
      check(r.status === 200, 'lo devuelve a la plancha', { s: r.status, e: r.json.error });
      const o = await prisma.order.findUnique({
        where: { id: aDomicilio.id }, select: { readyAt: true },
      });
      // Sin vuelta atrás, un plato marcado por error desaparece de lo que
      // falta y nadie lo cocina.
      check(o?.readyAt === null, 'y la marca se borra', o?.readyAt);
    }

    console.log('\n[7] El token de un local no toca el pedido de otro');
    {
      const r = await pedir('DELETE', `/business/${vecino.token}/cocina/${deMesa.id}/listo`);
      check(r.status === 400, 'se rechaza', { s: r.status, e: r.json.error });
      const o = await prisma.order.findUnique({
        where: { id: deMesa.id }, select: { readyAt: true },
      });
      check(o?.readyAt === null, 'y el pedido ajeno queda intacto', o?.readyAt);
    }

    console.log('\n[8] Un pedido que ya salió no se puede marcar');
    {
      const r = await pedir('DELETE', `/business/${negocio.token}/cocina/${yaSalio.id}/listo`);
      // Marcar como hecho algo ya entregado no significa nada y ensuciaría la
      // medición de cuánto se tarda en cocinar.
      check(r.status === 400, 'se rechaza', { s: r.status, e: r.json.error });
      check(/ya no está en la cocina/i.test(r.json.error ?? ''), 'diciendo por qué', r.json.error);
    }

    console.log('\n[9] El de mesa, que no tiene repartidor, también se marca');
    {
      const r = await pedir('POST', `/business/${negocio.token}/client-orders/${deMesa.id}/ready`);
      check(r.status === 200, 'se marca igual que el de domicilio', { s: r.status, e: r.json.error });
      const o = await prisma.order.findUnique({
        where: { id: deMesa.id }, select: { readyAt: true, status: true },
      });
      check(o?.readyAt != null, 'queda la marca');
      // En mesa no hay repartidor a quien avisar, pero el plato sí está
      // hecho: si esta ruta solo valiera para domicilio, media cocina se
      // quedaría sin poder marcar nada.
      check(o?.status === 'PREPARING', 'y su estado tampoco cambia', o?.status);
    }
    console.log('\n[10] El cambio de estado LLEGA al negocio por WebSocket');
    {
      const sock = escucharNegocio(negocio.token);
      await sock.listo;
      sock.recibidos.length = 0;

      // Marcar listo desde la cocina tiene que mover el portal del dueño, y
      // al revés. Hasta esta tanda no llegaba nada: cada pantalla esperaba a
      // su siguiente consulta, que es lo que se ve como «no se actualiza».
      const r = await pedir('POST', `/business/${negocio.token}/client-orders/${aDomicilio.id}/ready`);
      check(r.status === 200, 'se marca el plato', { s: r.status, e: r.json.error });

      await esperar(1200);
      const avisos = sock.recibidos.filter(
        (m) => m['type'] === 'order_update' || m['type'] === 'new_order',
      );
      check(avisos.length > 0, 'llega un aviso al negocio', sock.recibidos.map((m) => m['type']));

      // Y llega como CAMBIO, no como pedido nuevo: si viniera como
      // `new_order`, el portal haría sonar la campana y saltaría de pestaña
      // cada vez que la cocina toca un botón.
      check(
        avisos.every((m) => m['type'] === 'order_update'),
        'y como cambio, no como pedido nuevo',
        avisos.map((m) => m['type']),
      );
      sock.cerrar();
    }

  } finally {
    matar(servidor);
    // Limpieza: primero lo que cuelga del pedido.
    const pedidos = await prisma.order.findMany({
      where: { businessId: { in: [negocio.id, vecino.id] } }, select: { id: true },
    });
    const ids = pedidos.map((p) => p.id);
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.product.deleteMany({ where: { businessId: negocio.id } });
    await prisma.business.deleteMany({ where: { id: { in: [negocio.id, vecino.id] } } });
    await prisma.$disconnect();
  }

  console.log(`\n${fallos === 0 ? '✅ TODO EN VERDE' : `❌ ${fallos} fallo(s)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
