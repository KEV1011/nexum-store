/**
 * E2E del equipo del negocio, contra PostgreSQL real y por HTTP + WebSocket.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *  1. **Cada rol abre lo suyo y NADA más**, golpeando el servidor de verdad:
 *     una ruta permitida y una prohibida por rol. Leer la tabla de permisos no
 *     basta — el guardia tiene que estar montado delante de las rutas, y eso
 *     solo se ve pidiéndolas.
 *  2. **Lo del dueño es del dueño**: giros, clave y equipo no los abre nadie más,
 *     ni el encargado.
 *  3. **Revocar corta YA**: el enlace deja de abrir en la siguiente petición y
 *     la pantalla en vivo (la tablet de la cocina) se cierra sola.
 *  4. **Varias pantallas a la vez**: antes cada conexión nueva echaba a la
 *     anterior; con el equipo, la cocina habría echado al dueño.
 *  5. **Quién tomó el pedido**: el mesero que pide por la mesa queda apuntado,
 *     y el enlace de un mesero de OTRO negocio no apunta nada.
 *  6. **Quién cobró**: si cierra la caja, el nombre lo pone su enlace, no el
 *     formulario.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/equipo-negocio.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import WebSocket from 'ws';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3127);
const BASE = `http://localhost:${PUERTO}`;
const WS_URL = `ws://localhost:${PUERTO}`;

let fallos = 0;
function check(ok: boolean, nombre: string, detalle: unknown = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${JSON.stringify(detalle)}`}`);
  if (!ok) fallos++;
}

interface Res { status: number; json: { success?: boolean; data?: unknown; error?: string; code?: string } }

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
    if (ocupado.ok) throw new Error(`el puerto ${PUERTO} ya está ocupado (fuser -k ${PUERTO}/tcp)`);
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
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      if ((await fetch(`${BASE}/health`)).ok) return hijo;
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

/** Una pantalla en vivo del portal: se autentica y apunta lo que le llega. */
interface Pantalla {
  ws: WebSocket;
  mensajes: Array<Record<string, unknown>>;
  cerrada: boolean;
}

function conectar(token: string): Promise<Pantalla> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const p: Pantalla = { ws, mensajes: [], cerrada: false };
    const t = setTimeout(() => reject(new Error('el WS no respondió')), 8000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'business_auth', token })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString()) as Record<string, unknown>;
      p.mensajes.push(m);
      if (m['type'] === 'business_auth_ok' || m['type'] === 'business_auth_error') {
        clearTimeout(t);
        resolve(p);
      }
    });
    ws.on('close', () => { p.cerrada = true; });
    ws.on('error', () => { /* el cierre lo cuenta */ });
  });
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const marca = `e2eequipo-${Date.now()}`;
  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Restaurante`, ownerName: 'Dueña E2E', phone: tel(),
      address: 'Calle 5 # 3-40', category: 'RESTAURANT', token: `tok-${marca}`,
      lat: 7.3754, lng: -72.6486, citySlug: 'pamplona', deliveryFee: 3500, etaMinutes: 30,
    },
  });
  const otro = await prisma.business.create({
    data: {
      name: `${marca} Vecino`, ownerName: 'Vecino', phone: tel(),
      address: 'Calle 6', category: 'RESTAURANT', token: `tok2-${marca}`,
      lat: 7.3755, lng: -72.6487, citySlug: 'pamplona',
    },
  });
  const plato = await prisma.product.create({
    data: { businessId: negocio.id, name: 'Bandeja paisa', price: 25000, category: 'Platos', isAvailable: true },
  });

  const servidor = await arrancarServidor();
  const pantallas: Pantalla[] = [];
  try {
    const dueno = negocio.token;
    const urlNegocio = (t: string) => `/business/${encodeURIComponent(t)}`;

    console.log('\n[1] El dueño arma su equipo');
    const creados: Record<string, { id: string; token: string; nombre: string }> = {};
    for (const [rol, nombre] of [['COCINA', 'Pedro'], ['MESERO', 'Laura'], ['CAJA', 'Rosa'], ['ENCARGADO', 'Andrés']]) {
      const r = await pedir('POST', `${urlNegocio(dueno)}/equipo`, { nombre, rol });
      const p = (r.json.data as { persona?: { id: string; token: string; nombre: string } } | undefined)?.persona;
      check(r.status === 201 && !!p?.token, `crea a ${nombre} (${rol})`, { s: r.status, e: r.json.error });
      check(!!p && p.token !== dueno && p.token.startsWith('p_') && p.token.length > 20, `${nombre} tiene su propio enlace, largo`, p?.token);
      if (p) creados[rol] = p;
    }
    {
      const r = await pedir('POST', `${urlNegocio(dueno)}/equipo`, { nombre: 'X', rol: 'JEFE' });
      check(r.status === 400, 'un rol inventado se rechaza diciendo cuáles hay', r.json.error);
      const lista = await pedir('GET', `${urlNegocio(dueno)}/equipo`);
      const n = (lista.json.data as { personas?: unknown[] } | undefined)?.personas?.length;
      check(n === 4, 'la lista del equipo tiene a los cuatro', n);
    }
    const t = (rol: string) => creados[rol]!.token;

    console.log('\n[2] Cada rol se reconoce');
    for (const rol of ['COCINA', 'MESERO', 'CAJA', 'ENCARGADO']) {
      const r = await pedir('GET', `${urlNegocio(t(rol))}/acceso`);
      const d = r.json.data as { rol?: string; negocio?: string } | undefined;
      check(d?.rol === rol && d?.negocio === negocio.name, `/acceso dice ${rol} del negocio correcto`, d);
    }
    {
      const r = await pedir('GET', `${urlNegocio(dueno)}/acceso`);
      check((r.json.data as { rol?: string } | undefined)?.rol === 'DUENO', 'el enlace del dueño es DUEÑO');
      const info = await pedir('GET', `${urlNegocio(t('COCINA'))}/info`);
      check(info.status === 200, 'la cocina abre /info (lo pide el manifiesto para instalar el portal)', info.status);
    }

    console.log('\n[3] Cada rol: una ruta que sí y una que no');
    const casos: Array<[string, string, string, boolean]> = [
      ['COCINA', 'GET', '/cocina', true],
      ['COCINA', 'GET', '/orders', false],
      ['COCINA', 'GET', '/ventas', false],
      ['MESERO', 'GET', '/cuentas', true],
      ['MESERO', 'GET', '/mesas', true],
      ['MESERO', 'POST', '/cuentas/cualquiera/cerrar', false],
      ['MESERO', 'GET', '/caja', false],
      ['CAJA', 'GET', '/caja', true],
      ['CAJA', 'GET', '/orders', true],
      ['CAJA', 'GET', '/products', false],
      ['ENCARGADO', 'GET', '/products', true],
      ['ENCARGADO', 'GET', '/settings', true],
      ['ENCARGADO', 'GET', '/giros', false],
      ['ENCARGADO', 'GET', '/equipo', false],
      ['ENCARGADO', 'PUT', '/clave', false],
      ['ENCARGADO', 'POST', '/equipo', false],
    ];
    for (const [rol, metodo, ruta, abre] of casos) {
      const r = await pedir(metodo, `${urlNegocio(t(rol))}${ruta}`, metodo === 'GET' ? undefined : {});
      if (abre) {
        check(r.status !== 403, `${rol} ${metodo} ${ruta} abre`, { s: r.status, e: r.json.error });
      } else {
        check(r.status === 403 && r.json.code === 'sin_permiso', `${rol} ${metodo} ${ruta} → 403 sin_permiso`, { s: r.status, e: r.json.error });
      }
    }
    {
      const r = await pedir('GET', `${urlNegocio(dueno)}/giros`);
      check(r.status !== 403, 'el dueño SÍ abre sus giros', r.status);
      const nueva = await pedir('POST', `${urlNegocio(t('ENCARGADO'))}/equipo`, { nombre: 'Colado', rol: 'ENCARGADO' });
      check(nueva.status === 403, 'el encargado no puede darse más gente', nueva.status);
    }

    console.log('\n[4] Varias pantallas a la vez, y cada una con su rol');
    const pDueno = await conectar(dueno);
    const pCocina = await conectar(t('COCINA'));
    pantallas.push(pDueno, pCocina);
    const ok = (p: Pantalla) => p.mensajes.find((m) => m['type'] === 'business_auth_ok');
    check(ok(pDueno)?.['rol'] === 'DUENO', 'el dueño entra en vivo como DUEÑO', ok(pDueno));
    check(ok(pCocina)?.['rol'] === 'COCINA', 'la cocina entra en vivo como COCINA', ok(pCocina));
    await espera(400);
    check(!pDueno.cerrada, 'conectar la cocina NO echó al dueño (antes sí)');
    {
      const otra = await conectar(t('COCINA'));
      pantallas.push(otra);
      await espera(400);
      check(pCocina.cerrada && !otra.cerrada, 'la misma persona que se reconecta reemplaza su pantalla vieja');
      check(!pDueno.cerrada, 'y el dueño sigue conectado');
    }

    console.log('\n[5] El mesero toma el pedido de la mesa');
    let codigo = '';
    {
      const r = await pedir('PUT', `${urlNegocio(dueno)}/mesas`, { tables: ['1', '2', '3'] });
      codigo = (r.json.data as { menuCode?: string } | undefined)?.menuCode ?? '';
      check(codigo.length > 0, 'el local tiene mesas y código de carta', r.json.error);
      const pedido = await pedir('POST', `/carta/${codigo}/pedido`, {
        mesa: '2', personal: t('MESERO'),
        items: [{ productId: plato.id, quantity: 1 }],
      });
      const id = (pedido.json.data as { id?: string } | undefined)?.id ?? '';
      check(pedido.status === 201, 'el pedido entra', { s: pedido.status, e: pedido.json.error });
      const fila = await prisma.order.findUnique({ where: { id }, select: { takenByName: true, takenByStaffId: true } });
      check(fila?.takenByName === 'Laura' && fila.takenByStaffId === creados['MESERO']!.id, 'y dice que lo tomó Laura', fila);
      // La caja lo acepta (también es suyo) y pasa a la cocina.
      const acepta = await pedir('POST', `${urlNegocio(t('CAJA'))}/client-orders/${id}/accept`, { prepMinutes: 15 });
      check(acepta.status === 200, 'la caja acepta el pedido', { s: acepta.status, e: acepta.json.error });
      const cocina = await pedir('GET', `${urlNegocio(t('COCINA'))}/cocina`);
      const enCocina = (cocina.json.data as { pedidos?: Array<{ id: string; tomadoPor?: string | null }> } | undefined)?.pedidos ?? [];
      const suyo = enCocina.find((p) => p.id === id);
      check(suyo?.tomadoPor === 'Laura', 'el tablero de cocina dice quién lo tomó', { suyo, n: enCocina.length });

      // Un mesero del vecino no puede firmar pedidos de este local.
      const ajeno = await prisma.businessStaff.create({
        data: { businessId: otro.id, name: 'Infiltrado', role: 'MESERO', token: `p_ajeno${Date.now()}xxxxxxxx` },
      });
      const p2 = await pedir('POST', `/carta/${codigo}/pedido`, {
        mesa: '3', personal: ajeno.token, items: [{ productId: plato.id, quantity: 1 }],
      });
      const id2 = (p2.json.data as { id?: string } | undefined)?.id ?? '';
      const f2 = await prisma.order.findUnique({ where: { id: id2 }, select: { takenByName: true } });
      check(p2.status === 201 && f2?.takenByName === null, 'el enlace de un mesero de OTRO local no firma (y el pedido entra igual)', { s: p2.status, f2 });
      const p3 = await pedir('POST', `/carta/${codigo}/pedido`, {
        mesa: '1', items: [{ productId: plato.id, quantity: 1 }],
      });
      const f3 = await prisma.order.findUnique({ where: { id: (p3.json.data as { id?: string }).id ?? '' }, select: { takenByName: true } });
      check(p3.status === 201 && f3?.takenByName === null, 'el comensal sin mesero pide como siempre', { s: p3.status, f3 });
    }

    console.log('\n[6] Quién cobró lo dice el enlace, no el formulario');
    {
      const cuentas = await pedir('GET', `${urlNegocio(t('CAJA'))}/cuentas`);
      const lista = (cuentas.json.data as { cuentas?: Array<{ id: string; tableLabel: string }> } | undefined)?.cuentas ?? [];
      const mesa2 = lista.find((c) => c.tableLabel === '2');
      check(!!mesa2, 'la caja ve la cuenta de la mesa 2', lista.map((c) => c.tableLabel));
      if (mesa2) {
        const r = await pedir('POST', `${urlNegocio(t('CAJA'))}/cuentas/${mesa2.id}/cerrar`, {
          paymentMethod: 'cash', closedBy: 'Alguien que no soy',
        });
        const fila = await prisma.tableTab.findUnique({ where: { id: mesa2.id }, select: { closedBy: true } });
        check(r.status === 200 && fila?.closedBy === 'Rosa', 'cerró Rosa (la caja), diga lo que diga el formulario', { s: r.status, e: r.json.error, fila });
      }
    }

    console.log('\n[7] Revocar corta el acceso ya');
    {
      const cocinaViva = pantallas.find((p) => !p.cerrada && ok(p)?.['rol'] === 'COCINA')!;
      const r = await pedir('DELETE', `${urlNegocio(dueno)}/equipo/${creados['COCINA']!.id}`);
      check(r.status === 200, 'el dueño le quita el acceso a Pedro', r.json.error);
      const despues = await pedir('GET', `${urlNegocio(t('COCINA'))}/cocina`);
      check(despues.status === 404 || despues.status === 403, 'su enlace ya no abre la cocina', despues.status);
      const acceso = await pedir('GET', `${urlNegocio(t('COCINA'))}/acceso`);
      check(acceso.status === 404, 'ni dice de quién es', acceso.status);
      await espera(500);
      check(cocinaViva.cerrada, 'y la tablet que tenía abierta se cerró sola');
      check(!pDueno.cerrada, 'sin tocar la pantalla del dueño');
      const lista = await pedir('GET', `${urlNegocio(dueno)}/equipo`);
      const n = (lista.json.data as { personas?: unknown[] } | undefined)?.personas?.length;
      check(n === 3, 'ya no está en la lista', n);
      const vuelve = await conectar(t('COCINA'));
      pantallas.push(vuelve);
      check(vuelve.mensajes.some((m) => m['type'] === 'business_auth_error'), 'y no puede volver a conectarse en vivo');
      const otraVez = await pedir('DELETE', `${urlNegocio(dueno)}/equipo/${creados['COCINA']!.id}`);
      check(otraVez.status === 400, 'revocar dos veces dice que ya no está', otraVez.status);
    }

    console.log('\n[8] El enlace del dueño sigue igual');
    {
      const r = await pedir('GET', `${urlNegocio(dueno)}/orders`);
      check(r.status === 200, 'el dueño abre sus pedidos', r.status);
      const c = await pedir('GET', `${urlNegocio(dueno)}/clave`);
      check(c.status !== 403, 'y su clave', c.status);
      const vecino = await pedir('DELETE', `${urlNegocio(otro.token)}/equipo/${creados['MESERO']!.id}`);
      check(vecino.status === 400, 'el vecino no puede quitarle gente a este local', vecino.status);
      const sigue = await pedir('GET', `${urlNegocio(t('MESERO'))}/cuentas`);
      check(sigue.status === 200, 'y Laura sigue entrando', sigue.status);
    }
  } finally {
    for (const p of pantallas) try { p.ws.close(); } catch { /* ya cerrada */ }
    matar(servidor);
    await prisma.order.deleteMany({ where: { businessId: { in: [negocio.id, otro.id] } } }).catch(() => undefined);
    await prisma.tableTab.deleteMany({ where: { businessId: { in: [negocio.id, otro.id] } } }).catch(() => undefined);
    await prisma.product.deleteMany({ where: { businessId: { in: [negocio.id, otro.id] } } }).catch(() => undefined);
    await prisma.business.deleteMany({ where: { id: { in: [negocio.id, otro.id] } } }).catch(() => undefined);
  }

  console.log(fallos === 0 ? '\nTODO EN VERDE' : `\n${fallos} FALLO(S)`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
