/**
 * Campañas de temporada («Burger Show») de punta a punta, contra PostgreSQL
 * real y con el servidor levantado:
 *
 *   admin crea la campaña → el local inscribe su hamburguesa especial → la app
 *   la anuncia y la enseña → cuando la campaña termina, lo especial
 *   desaparece de la carta, de la sección Y de la caja; lo de siempre queda.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/campanas.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';
import { fechaColombia } from '../src/lib/campanas';
import { placeClientOrder } from '../src/services/client.service';
import { comprarEnComercio } from '../src/services/comercio-no-reclamado.service';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3141);
const BASE = `http://localhost:${PUERTO}`;
const OTP = '123456';
const ADMIN = '+573009998822';

let ok = 0;
let mal = 0;
function check(nombre: string, cond: boolean, extra?: unknown): void {
  if (cond) { ok++; console.log('  ✓', nombre); }
  else { mal++; console.log('  ✗', nombre, extra === undefined ? '' : JSON.stringify(extra)); }
}

async function levantar(): Promise<ChildProcess> {
  try {
    await fetch(`${BASE}/health`);
    throw new Error(`El puerto ${PUERTO} ya está ocupado: la corrida mediría otro servidor.`);
  } catch (e) {
    if (e instanceof Error && e.message.includes('ocupado')) throw e;
  }
  const hijo = spawn('npx', ['tsx', 'src/index.ts'], {
    detached: true,
    env: {
      ...process.env,
      PORT: String(PUERTO),
      NODE_ENV: 'development',
      OTP_DEV_CODE: OTP,
      OTP_FALLBACK_CODE: OTP,
      ADMIN_PHONES: ADMIN,
      RATE_LIMIT_AUTH: '5000',
      JWT_SECRET: process.env['JWT_SECRET'] ?? 'e2e-secreto-largo-para-firmar-0123456789',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const registros: string[] = [];
  hijo.stdout?.on('data', (b: Buffer) => registros.push(b.toString()));
  hijo.stderr?.on('data', (b: Buffer) => registros.push(b.toString()));
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { if ((await fetch(`${BASE}/health`)).ok) return hijo; } catch { /* aún no */ }
  }
  console.error(registros.join(''));
  throw new Error('El servidor no arrancó');
}

async function rechazo(f: () => Promise<unknown>): Promise<string> {
  try { await f(); return ''; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

type Resp = { status: number; body: { success?: boolean; data?: unknown; error?: string } };

async function main(): Promise<void> {
  const m = Date.now().toString(36);
  const tel = (p: string) => `+5731${p}${String(Date.now()).slice(-6)}`;
  const dias = (n: number) => fechaColombia(new Date(Date.now() + n * 86_400_000));

  const pamplona = await prisma.business.create({
    data: {
      name: `Beto Burger ${m}`, ownerName: 'Beto', category: 'RESTAURANT', address: 'Calle 5 # 3-40',
      phone: tel('41'), token: `tok-camp-p-${m}`, citySlug: 'pamplona', lat: 7.3754, lng: -72.6486,
      isOpen: true, acceptingOrders: true, claimed: true,
    } as never,
  });
  const cucuta = await prisma.business.create({
    data: {
      name: `Cúcuta Burger ${m}`, ownerName: 'C', category: 'RESTAURANT', address: 'Av 0',
      phone: tel('42'), token: `tok-camp-c-${m}`, citySlug: 'cucuta', isOpen: true,
    } as never,
  });
  const cliente = await prisma.user.create({ data: { name: 'Marta Ruiz', phone: tel('43') } });

  const servidor = await levantar();
  try {
    await fetch(`${BASE}/admin/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: ADMIN }) });
    const login = await (await fetch(`${BASE}/admin/auth/verify-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: ADMIN, otp: OTP }),
    })).json() as { data?: { token?: string } };
    const token = login.data?.token ?? '';
    const pedir = async (metodo: string, ruta: string, body?: unknown, conToken = true): Promise<Resp> => {
      const r = await fetch(`${BASE}${ruta}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(conToken ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) as Resp['body'] };
    };

    console.log('\n[1] El admin crea el Burger Show');
    const datos = { title: `Burger Show ${m}`, subtitle: 'Hamburguesas especiales', citySlug: 'pamplona', desde: dias(0), hasta: dias(6), icon: 'hamburguesas', color: '#E53935' };
    check('sin token no se crea (401)', (await pedir('POST', '/admin/campanas', datos, false)).status === 401);
    const alReves = await pedir('POST', '/admin/campanas', { ...datos, hasta: dias(-2) });
    check('fechas al revés → 400 con motivo', alReves.status === 400 && /antes de empezar/.test(alReves.body.error ?? ''), alReves.body);
    const ciudadMala = await pedir('POST', '/admin/campanas', { ...datos, citySlug: 'gotham' });
    check('ciudad inexistente → 400', ciudadMala.status === 400, ciudadMala.body);
    const creada = await pedir('POST', '/admin/campanas', datos);
    const camp = creada.body.data as { id: string; estado: string; desde: string; hasta: string };
    check('se crea y ya está vigente', creada.status === 201 && camp.estado === 'vigente', creada.body);
    check('devuelve las fechas como las escribió', camp.desde === datos.desde && camp.hasta === datos.hasta, camp);

    console.log('\n[2] El portal del local la ve y se inscribe');
    const delPortal = await pedir('GET', `/business/tok-camp-p-${m}/campanas`, undefined, false);
    check('el local de Pamplona la ve', (delPortal.body.data as Array<{ id: string }>).some((c) => c.id === camp.id));
    const deCucuta = await pedir('GET', `/business/tok-camp-c-${m}/campanas`, undefined, false);
    check('el de Cúcuta NO', !(deCucuta.body.data as Array<{ id: string }>).some((c) => c.id === camp.id));

    const especialR = await pedir('POST', `/business/tok-camp-p-${m}/products`, {
      name: 'La Monstruo del Burger Show', price: 22000, compareAtPrice: 28000, category: 'Hamburguesas',
      campaignId: camp.id,
    }, false);
    const especial = especialR.body.data as { id: string; campaignId?: string; campaignOnly?: boolean; campaignTitle?: string; promoUntil?: string };
    check('inscribe su hamburguesa especial', especialR.status === 201 && especial.campaignId === camp.id, especialR.body);
    check('por defecto es SOLO del evento', especial.campaignOnly === true);
    check('el portal ve el nombre de la campaña', especial.campaignTitle === datos.title);
    check('la promoción termina con la campaña', fechaColombia(new Date(especial.promoUntil ?? 0)) === datos.hasta, especial.promoUntil);
    const deSiempre = (await pedir('POST', `/business/tok-camp-p-${m}/products`, {
      name: 'Hamburguesa Beto', price: 18000, category: 'Hamburguesas', campaignId: camp.id, campaignOnly: false,
    }, false)).body.data as { id: string };
    const ajena = await pedir('POST', `/business/tok-camp-c-${m}/products`, {
      name: 'Intrusa', price: 10000, campaignId: camp.id,
    }, false);
    check('un local de otra ciudad no puede inscribirse', ajena.status === 400 && /otra ciudad/.test(ajena.body.error ?? ''), ajena.body);

    console.log('\n[3] La app la anuncia y la enseña');
    const anuncios = await pedir('GET', '/client/campanas?lat=7.3754&lng=-72.6486', undefined, false);
    const anuncio = (anuncios.body.data as Array<{ id: string; productos: number }>).find((c) => c.id === camp.id);
    check('se anuncia en Pamplona con sus 2 productos', anuncio?.productos === 2, anuncio);
    const seccion = await pedir('GET', `/client/campanas/${camp.id}`, undefined, false);
    const items = seccion.body.data as Array<{ product: { id: string; descuentoPct?: number }; business: { id: string; name: string } }>;
    check('la sección trae los dos', items.length === 2, items.length);
    check('primero la que está en promoción', items[0]?.product.id === especial.id && (items[0]?.product.descuentoPct ?? 0) > 0);
    check('cada producto dice de qué local es', items[0]?.business.id === pamplona.id);
    const carta = (await pedir('GET', `/client/businesses/${pamplona.id}`, undefined, false)).body.data as { products: Array<{ id: string }> };
    check('la especial está en la carta del local', carta.products.some((p) => p.id === especial.id));
    check('y se puede pedir', await rechazo(() => placeClientOrder(cliente.id, cliente.phone, {
      businessId: pamplona.id, deliveryAddress: 'Carrera 6 # 4-20', items: [{ productId: especial.id, quantity: 1 }],
    } as never)) === '');

    console.log('\n[4] Termina la campaña');
    await prisma.campaign.update({
      where: { id: camp.id },
      data: { startsAt: new Date(Date.now() - 10 * 86_400_000), endsAt: new Date(Date.now() - 3 * 86_400_000) },
    });
    const anuncios2 = await pedir('GET', '/client/campanas?lat=7.3754&lng=-72.6486', undefined, false);
    check('ya no se anuncia', !(anuncios2.body.data as Array<{ id: string }>).some((c) => c.id === camp.id));
    check('la sección responde 404', (await pedir('GET', `/client/campanas/${camp.id}`, undefined, false)).status === 404);
    const carta2 = (await pedir('GET', `/client/businesses/${pamplona.id}`, undefined, false)).body.data as { products: Array<{ id: string }> };
    check('la especial desaparece de la carta', !carta2.products.some((p) => p.id === especial.id));
    check('la de siempre se queda', carta2.products.some((p) => p.id === deSiempre.id));
    const lista = (await pedir('GET', '/client/businesses', undefined, false)).body.data as Array<{ id: string; products: Array<{ id: string }> }>;
    check('tampoco sale en la lista de comercios', !lista.find((b) => b.id === pamplona.id)?.products.some((p) => p.id === especial.id));
    const caja = await rechazo(() => placeClientOrder(cliente.id, cliente.phone, {
      businessId: pamplona.id, deliveryAddress: 'Carrera 6 # 4-20', items: [{ productId: especial.id, quantity: 1 }],
    } as never));
    check('la caja la rechaza diciendo por qué', /era especial/.test(caja), caja);
    await prisma.business.update({ where: { id: pamplona.id }, data: { claimed: false } });
    const compra = await rechazo(() => comprarEnComercio(cliente.id, {
      businessId: pamplona.id, items: [{ productId: especial.id, quantity: 1 }], dropoffAddress: 'Carrera 6 # 4-20',
    }));
    check('la compra por mandado también', /era especial/.test(compra), compra);
    const portal = (await pedir('GET', `/business/tok-camp-p-${m}/products`, undefined, false)).body.data as Array<{ id: string }>;
    check('el dueño la sigue viendo en su portal', portal.some((p) => p.id === especial.id));
    const tarde = await pedir('POST', `/business/tok-camp-p-${m}/products`, { name: 'Tardía', price: 1000, campaignId: camp.id }, false);
    check('no se puede inscribir en una campaña terminada', tarde.status === 400 && /terminó/.test(tarde.body.error ?? ''), tarde.body);

    console.log('\n[5] El panel la lista con sus números');
    const admin = (await pedir('GET', '/admin/campanas')).body.data as Array<{ id: string; productos: number; locales: number; estado: string }>;
    const fila = admin.find((c) => c.id === camp.id);
    check('2 productos de 1 local, terminada', fila?.productos === 2 && fila?.locales === 1 && fila?.estado === 'terminada', fila);
    const apagada = await pedir('POST', `/admin/campanas/${camp.id}/activar`, { active: false });
    check('se puede apagar', (apagada.body.data as { estado: string }).estado === 'apagada');
  } finally {
    if (servidor.pid) try { process.kill(-servidor.pid); } catch { /* ya terminó */ }
    await prisma.product.deleteMany({ where: { businessId: { in: [pamplona.id, cucuta.id] } } }).catch(() => {});
    await prisma.$disconnect();
  }
  console.log(`\n${ok} bien, ${mal} mal`);
  process.exit(mal === 0 ? 0 : 1);
}

void main();
