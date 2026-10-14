/**
 * E2E de la cuenta de una mesa, contra PostgreSQL real y por HTTP.
 *
 * LO QUE SOLO SE VE EJECUTANDO, por orden de gravedad:
 *
 *  1. **Dos comensales de la misma mesa pidiendo A LA VEZ no abren dos
 *     cuentas.** Es el caso normal en un local lleno, no el raro. Con dos
 *     cuentas, una ronda cae en una y el cobro en la otra: el local cobra de
 *     menos y nada falla a la vista. Comprobar esto llamando dos veces
 *     seguidas NO sirve —entre las dos llamadas da tiempo a que la primera
 *     escriba—, hay que lanzar varias de verdad en paralelo. Ese falso
 *     positivo ya se cazó en las reservas de taxi y en el puesto urbano.
 *
 *  2. **Las rondas se suman.** El reporte literal: la mesa pidió 68.000 y
 *     después algo más, y tiene que salir una sola cuenta con el total.
 *
 *  3. **Cerrar SELLA el total.** A partir de ahí es el documento de lo que se
 *     cobró: cancelar un pedido después no puede cambiarlo.
 *
 *  4. **Una cuenta cerrada no recibe más rondas**: la siguiente abre una
 *     nueva. Si se sumaran, reaparecería un total que el cliente ya pagó.
 *
 *  5. **El token de un local no toca la cuenta de otro.**
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/cuenta-mesa.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3131);
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

interface CuentaDTO {
  id: string; numero: number; tableLabel: string; total: number; rondas: number;
  closedAt: string | null;
  lineas: Array<{ nombre: string; cantidad: number; subtotal: number }>;
}

async function main(): Promise<void> {
  const marca = `e2ecuenta-${Date.now()}`;

  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Restaurante`, ownerName: 'Dueña E2E', phone: tel(),
      address: 'Calle 5 # 3-40', category: 'RESTAURANT', token: `tok-${marca}`,
      lat: 7.3754, lng: -72.6486, citySlug: 'pamplona', etaMinutes: 20,
      tables: ['1', '2'],
    },
  });
  const vecino = await prisma.business.create({
    data: {
      name: `${marca} Vecino`, ownerName: 'Otro', phone: tel(),
      address: 'Calle 6 # 1-10', category: 'RESTAURANT', token: `tok-vec-${marca}`,
      lat: 7.3755, lng: -72.6487, citySlug: 'pamplona',
    },
  });
  const plato = await prisma.product.create({
    data: {
      businessId: negocio.id, name: 'Bandeja paisa', price: 68000,
      category: 'Platos fuertes', isAvailable: true,
    },
  });
  const bebida = await prisma.product.create({
    data: {
      businessId: negocio.id, name: 'Jugo de mora', price: 6000,
      category: 'Bebidas', isAvailable: true,
    },
  });

  const servidor = await arrancarServidor();
  let codigo = '';

  try {
    {
      const r = await pedir('PUT', `/business/${negocio.token}/mesas`, { tables: ['1', '2'] });
      codigo = (r.json.data as { menuCode?: string } | undefined)?.menuCode ?? '';
      if (!codigo) throw new Error('no se pudo crear el código de carta');
    }

    const pedirEnMesa = (mesa: string, items: Array<{ productId: string; quantity: number }>) =>
      pedir('POST', `/carta/${codigo}/pedido`, { mesa, items });

    console.log('\n[1] Dos comensales de la MISMA mesa pidiendo a la vez');
    {
      // Cuatro de verdad en paralelo. Dos llamadas seguidas no probarían
      // nada: entre ellas da tiempo a que la primera escriba.
      const aLaVez = await Promise.allSettled([
        pedirEnMesa('1', [{ productId: plato.id, quantity: 1 }]),
        pedirEnMesa('1', [{ productId: bebida.id, quantity: 1 }]),
        pedirEnMesa('1', [{ productId: bebida.id, quantity: 1 }]),
        pedirEnMesa('1', [{ productId: bebida.id, quantity: 1 }]),
      ]);
      const ok = aLaVez.filter(
        (r) => r.status === 'fulfilled' && r.value.status < 300,
      ).length;
      check(ok === 4, 'los cuatro pedidos entran', ok);

      const abiertas = await prisma.tableTab.count({
        where: { businessId: negocio.id, tableLabel: '1', closedAt: null },
      });
      // La guarda de verdad: el índice único parcial de la base.
      check(abiertas === 1, 'y la mesa 1 tiene UNA sola cuenta abierta', abiertas);

      const sueltos = await prisma.order.count({
        where: { businessId: negocio.id, tableLabel: '1', tabId: null },
      });
      check(sueltos === 0, 'ninguna ronda queda fuera de la cuenta', sueltos);
    }

    console.log('\n[2] Las rondas se suman en una sola cuenta');
    let cuenta: CuentaDTO | undefined;
    {
      const r = await pedir('GET', `/business/${negocio.token}/cuentas`);
      const cuentas = (r.json.data as { cuentas?: CuentaDTO[] } | undefined)?.cuentas ?? [];
      check(cuentas.length === 1, 'una sola mesa abierta', cuentas.length);
      cuenta = cuentas[0];
      // 68.000 de la bandeja + 3 jugos de 6.000 = 86.000. El caso del
      // reporte: pidió 68.000 y después algo más.
      check(cuenta?.total === 86000, 'el total suma todas las rondas', cuenta?.total);
      check(cuenta?.rondas === 4, 'con sus cuatro pedidos', cuenta?.rondas);
      check(cuenta?.numero === 1, 'y es la cuenta 1 del día', cuenta?.numero);
    }

    console.log('\n[3] Los iguales se agrupan en el impreso');
    {
      const jugos = (cuenta?.lineas ?? []).find((l) => l.nombre === 'Jugo de mora');
      // Tres jugos pedidos en tres rondas distintas salen como «3 Jugo»,
      // que es como se lee una cuenta de restaurante.
      check(jugos?.cantidad === 3, 'los tres jugos van en una línea', jugos?.cantidad);
      check(jugos?.subtotal === 18000, 'con su subtotal', jugos?.subtotal);
      check((cuenta?.lineas ?? []).length === 2, 'y hay dos líneas, no cuatro', cuenta?.lineas.length);
    }

    console.log('\n[4] Otra mesa lleva su propia cuenta');
    {
      await pedirEnMesa('2', [{ productId: bebida.id, quantity: 2 }]);
      const r = await pedir('GET', `/business/${negocio.token}/cuentas`);
      const cuentas = (r.json.data as { cuentas?: CuentaDTO[] } | undefined)?.cuentas ?? [];
      check(cuentas.length === 2, 'ahora hay dos mesas abiertas', cuentas.length);
      const m2 = cuentas.find((c) => c.tableLabel === '2');
      check(m2?.total === 12000, 'la mesa 2 debe lo suyo', m2?.total);
      check(m2?.numero === 2, 'y lleva el número siguiente del día', m2?.numero);
    }

    console.log('\n[5] El token de otro local no ve ni toca estas cuentas');
    {
      const r = await pedir('GET', `/business/${vecino.token}/cuentas`);
      const cuentas = (r.json.data as { cuentas?: CuentaDTO[] } | undefined)?.cuentas ?? [];
      check(cuentas.length === 0, 'el vecino no ve nada', cuentas.length);

      const c = await pedir('POST', `/business/${vecino.token}/cuentas/${cuenta!.id}/cerrar`, {});
      check(c.status === 400, 'ni puede cobrar una cuenta ajena', { s: c.status, e: c.json.error });
      const sigue = await prisma.tableTab.findUnique({
        where: { id: cuenta!.id }, select: { closedAt: true },
      });
      check(sigue?.closedAt === null, 'y la cuenta sigue abierta', sigue?.closedAt);
    }

    console.log('\n[6] Cobrar SELLA el total');
    {
      const r = await pedir('POST', `/business/${negocio.token}/cuentas/${cuenta!.id}/cerrar`, {
        paymentMethod: 'efectivo',
      });
      check(r.status === 200, 'se cobra', { s: r.status, e: r.json.error });
      const guardada = await prisma.tableTab.findUnique({
        where: { id: cuenta!.id },
        select: { closedAt: true, closedTotal: true, paymentMethod: true },
      });
      check(guardada?.closedAt != null, 'queda cerrada');
      check(guardada?.closedTotal === 86000, 'con el total sellado', guardada?.closedTotal);
      check(guardada?.paymentMethod === 'efectivo', 'y el medio de pago', guardada?.paymentMethod);

      const otra = await pedir('POST', `/business/${negocio.token}/cuentas/${cuenta!.id}/cerrar`, {});
      check(otra.status === 400, 'cobrarla dos veces se rechaza', otra.status);
    }

    console.log('\n[7] Cancelar un pedido después NO cambia lo que se cobró');
    {
      // El total sellado es el documento de lo que entró en la caja.
      const unaRonda = await prisma.order.findFirst({
        where: { tabId: cuenta!.id }, select: { id: true },
      });
      await prisma.order.update({
        where: { id: unaRonda!.id }, data: { status: 'CANCELLED' },
      });
      const r = await pedir('GET', `/business/${negocio.token}/cuentas/${cuenta!.id}`);
      const c = (r.json.data as { cuenta?: CuentaDTO } | undefined)?.cuenta;
      check(c?.total === 86000, 'el total cobrado no se mueve', c?.total);
    }

    console.log('\n[8] La mesa vuelve a pedir: cuenta NUEVA, no la cobrada');
    {
      await pedirEnMesa('1', [{ productId: bebida.id, quantity: 1 }]);
      const abiertas = await prisma.tableTab.findMany({
        where: { businessId: negocio.id, tableLabel: '1', closedAt: null },
        select: { id: true, numero: true },
      });
      check(abiertas.length === 1, 'se abrió una cuenta', abiertas.length);
      // Si se sumara a la cerrada, reaparecería un total que el cliente ya
      // pagó y el local se lo cobraría dos veces.
      check(abiertas[0]?.id !== cuenta!.id, 'y NO es la que ya se cobró', abiertas[0]?.id);
      check(abiertas[0]!.numero > 2, 'con número nuevo del día', abiertas[0]?.numero);
    }

    console.log('\n[9] Reabrir una cuenta cobrada por error');
    {
      // Pasa: el mesero cobra la 4 queriendo cobrar la 5. Sin vuelta atrás,
      // la mesa que sigue comiendo acaba pagando dos papeles.
      const choca = await pedir('POST', `/business/${negocio.token}/cuentas/${cuenta!.id}/reabrir`);
      check(choca.status === 400, 'no se puede si la mesa ya tiene otra abierta', choca.status);
      check(/ya tiene la cuenta/i.test(choca.json.error ?? ''), 'y se dice por qué', choca.json.error);

      // Se cierra la nueva y entonces sí.
      const nueva = await prisma.tableTab.findFirst({
        where: { businessId: negocio.id, tableLabel: '1', closedAt: null },
      });
      await prisma.tableTab.update({
        where: { id: nueva!.id }, data: { closedAt: new Date(), closedTotal: 6000 },
      });
      const ok = await pedir('POST', `/business/${negocio.token}/cuentas/${cuenta!.id}/reabrir`);
      check(ok.status === 200, 'ahora sí se reabre', { s: ok.status, e: ok.json.error });
      const vuelta = await prisma.tableTab.findUnique({
        where: { id: cuenta!.id }, select: { closedAt: true, closedTotal: true },
      });
      check(vuelta?.closedAt === null, 'queda abierta');
      // El total vuelve a derivarse: dejar el sellado congelaría un número
      // que ya no es el que debe la mesa (una ronda se canceló en [7]).
      check(vuelta?.closedTotal === null, 'y su total vuelve a derivarse', vuelta?.closedTotal);
    }
  } finally {
    matar(servidor);
    const pedidos = await prisma.order.findMany({
      where: { businessId: { in: [negocio.id, vecino.id] } }, select: { id: true },
    });
    const ids = pedidos.map((p) => p.id);
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.tableTab.deleteMany({ where: { businessId: { in: [negocio.id, vecino.id] } } });
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
