/**
 * Panel de administración: borrar cuentas, vehículos y negocios, y que la
 * lista de servicios atascados cuadre con su aviso. Contra PostgreSQL real,
 * por HTTP, con el servidor levantado y el admin entrando por OTP.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/panel-admin-borrado.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3133);
const BASE = `http://localhost:${PUERTO}`;
const OTP = '123456';
const ADMIN = '+573009998811';

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

async function main(): Promise<void> {
  const m = Date.now().toString(36);
  const tel = (p: string) => `+5730${p}${String(Date.now()).slice(-6)}`;
  const hace = (min: number) => new Date(Date.now() - min * 60_000);

  // ── Siembra ───────────────────────────────────────────────────────────────
  const libre = await prisma.user.create({ data: { name: `Libre ${m}`, phone: tel('11') } });
  const ocupado = await prisma.user.create({ data: { name: `Ocupado ${m}`, phone: tel('12') } });
  const conductor = await prisma.driver.create({
    data: { name: `Conductor ${m}`, phone: tel('13'), documentType: 'CC', documentNumber: `13${m}`, isVerified: true },
  });
  const sinViajes = await prisma.vehicle.create({
    data: { driverId: conductor.id, type: 'TAXI', brand: 'Kia', model: 'Picanto', plate: `A${m.slice(-5)}`.toUpperCase(), year: 2020, color: 'Amarillo' },
  });
  const conViajes = await prisma.vehicle.create({
    data: { driverId: conductor.id, type: 'TAXI', brand: 'Kia', model: 'Rio', plate: `B${m.slice(-5)}`.toUpperCase(), year: 2021, color: 'Blanco' },
  });
  await prisma.trip.create({
    data: {
      requestRef: `NXT-A${m}`, passengerId: libre.id, driverId: conductor.id, vehicleId: conViajes.id,
      serviceType: 'TAXI', status: 'COMPLETED', completedAt: new Date(), finalFare: 6000,
      originAddress: 'A', originLat: 7.37, originLng: -72.64, destAddress: 'B', destLat: 7.38, destLng: -72.65, estimatedFare: 6000,
    },
  });
  const negocioVacio = await prisma.business.create({
    data: { name: `Vacío ${m}`, ownerName: 'D', category: 'RESTAURANT', address: 'Calle 1', phone: tel('14'), token: `tok-v-${m}` },
  });
  await prisma.product.create({ data: { businessId: negocioVacio.id, name: 'Plato', price: 10000, category: 'Platos' } });
  const negocioConPedidos = await prisma.business.create({
    data: { name: `Con pedidos ${m}`, ownerName: 'D', category: 'RESTAURANT', address: 'Calle 2', phone: tel('15'), token: `tok-p-${m}` },
  });
  await prisma.order.create({
    data: {
      orderRef: `NX-${m}`, businessId: negocioConPedidos.id, userId: libre.id,
      deliveryAddress: 'X', subtotal: 10000, deliveryFee: 0, total: 10000, status: 'DELIVERED',
    },
  });

  const servidor = await levantar();
  // El que espera se siembra DESPUÉS de arrancar: el barrido de rescate del
  // servidor cierra al arrancar los viajes urbanos que llevan rato buscando
  // (es lo correcto), y un mandado se queda abierto a propósito — decide el
  // cliente. Es justo el que se queda colgado en el aviso del panel.
  const atascado = await prisma.errand.create({
    data: {
      requestRef: `MD-S${m}`, userId: ocupado.id, category: 'PHARMACY', status: 'SEARCHING', createdAt: hace(120),
      description: 'Acetaminofén', pickupAddress: 'Droguería', dropoffAddress: 'Casa',
    },
  });
  try {
    await fetch(`${BASE}/admin/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: ADMIN }) });
    const login = await (await fetch(`${BASE}/admin/auth/verify-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: ADMIN, otp: OTP }),
    })).json() as { data?: { token?: string } };
    const token = login.data?.token ?? '';
    check('el admin entra', !!token);
    const pedir = async (metodo: string, ruta: string, conToken = true) => {
      const r = await fetch(`${BASE}${ruta}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(conToken ? { Authorization: `Bearer ${token}` } : {}) },
      });
      return { status: r.status, body: await r.json().catch(() => ({})) as { success?: boolean; data?: unknown; error?: string } };
    };

    console.log('\n[1] La lista de atascados cuadra con el aviso');
    const metricas = await pedir('GET', '/admin/metrics');
    const total = (metricas.body.data as { stuck: { total: number } }).stuck.total;
    const lista = await pedir('GET', '/admin/stuck');
    const filas = lista.body.data as Array<{ id: string }>;
    check('el aviso cuenta al menos el viaje sembrado', total >= 1, total);
    check('la lista trae EL MISMO número que el aviso', Array.isArray(filas) && filas.length === total, { total, n: filas?.length });
    check('y en ella está el viaje que espera', filas.some((f) => f.id === atascado.id));

    console.log('\n[2] Sin sesión no se borra nada');
    for (const ruta of [`/admin/clients/${libre.id}/delete`, `/admin/drivers/${conductor.id}/delete`, `/admin/vehicles/${sinViajes.id}/delete`, `/admin/businesses/${negocioVacio.id}/delete`]) {
      const r = await pedir('POST', ruta, false);
      check(`${ruta.split('/')[2]} sin token → 401`, r.status === 401, r.status);
    }
    check('el cliente sigue intacto', (await prisma.user.findUnique({ where: { id: libre.id } }))?.deletedAt === null);

    console.log('\n[3] Buscar y borrar clientes');
    const busca = await pedir('GET', `/admin/clients/buscar?q=${encodeURIComponent(`Libre ${m}`)}`);
    const halla = busca.body.data as Array<{ id: string; viajes: number }>;
    check('la búsqueda encuentra a un cliente que nunca hizo KYC', halla.some((c) => c.id === libre.id));
    check('y dice cuántos viajes tiene', halla.find((c) => c.id === libre.id)?.viajes === 1);
    const bloqueado = await pedir('POST', `/admin/clients/${ocupado.id}/delete`);
    check('con un servicio en curso se rechaza (409) diciendo por qué', bloqueado.status === 409 && !!bloqueado.body.error, bloqueado);
    const borra = await pedir('POST', `/admin/clients/${libre.id}/delete`);
    check('el cliente libre se borra', borra.status === 200, borra);
    const anon = await prisma.user.findUnique({ where: { id: libre.id } });
    check('queda anonimizado, no arrancado', !!anon?.deletedAt && anon?.name !== `Libre ${m}`);
    check('su viaje liquidado se conserva', (await prisma.trip.count({ where: { passengerId: libre.id, status: 'COMPLETED' } })) === 1);
    const otraBusca = await pedir('GET', `/admin/clients/buscar?q=${encodeURIComponent(`Libre ${m}`)}`);
    check('y ya no sale en la búsqueda', !(otraBusca.body.data as Array<{ id: string }>).some((c) => c.id === libre.id));

    console.log('\n[4] Vehículos');
    const vehs = await pedir('GET', `/admin/drivers/${conductor.id}/vehicles`);
    check('se listan los dos vehículos del conductor', (vehs.body.data as unknown[]).length === 2);
    const v1 = await pedir('POST', `/admin/vehicles/${sinViajes.id}/delete`);
    check('el que no tiene viajes se BORRA', (v1.body.data as { modo: string }).modo === 'borrado');
    check('y ya no existe', (await prisma.vehicle.findUnique({ where: { id: sinViajes.id } })) === null);
    const v2 = await pedir('POST', `/admin/vehicles/${conViajes.id}/delete`);
    check('el que tiene viajes se DESACTIVA', (v2.body.data as { modo: string }).modo === 'desactivado', v2.body);
    const sigue = await prisma.vehicle.findUnique({ where: { id: conViajes.id } });
    check('sigue existiendo, inactivo', !!sigue && sigue.isActive === false);
    check('y su viaje sigue apuntando a él', (await prisma.trip.count({ where: { vehicleId: conViajes.id } })) === 1);
    const v3 = await pedir('POST', `/admin/vehicles/no-existe/delete`);
    check('un vehículo inexistente → 404', v3.status === 404);

    console.log('\n[5] Conductores');
    const d = await pedir('POST', `/admin/drivers/${conductor.id}/delete`);
    check('el conductor se borra', d.status === 200, d.body);
    const lista2 = await pedir('GET', '/admin/drivers');
    check('y deja de salir en la lista del panel', !(lista2.body.data as Array<{ id: string }>).some((x) => x.id === conductor.id));
    check('su viaje liquidado se conserva', (await prisma.trip.count({ where: { driverId: conductor.id, status: 'COMPLETED' } })) === 1);

    console.log('\n[6] Negocios');
    const nb = await pedir('POST', `/admin/businesses/${negocioConPedidos.id}/delete`);
    check('con pedidos se rechaza (409) diciendo qué hacer', nb.status === 409 && /Desactivar/.test(nb.body.error ?? ''), nb.body);
    check('y sigue existiendo', !!(await prisma.business.findUnique({ where: { id: negocioConPedidos.id } })));
    const nv = await pedir('POST', `/admin/businesses/${negocioVacio.id}/delete`);
    check('sin pedidos se borra, con su carta', nv.status === 200 && (nv.body.data as { productos: number }).productos === 1, nv.body);
    check('ya no existe', (await prisma.business.findUnique({ where: { id: negocioVacio.id } })) === null);

    console.log('\n[7] El panel se sirve con lo nuevo');
    const html = await (await fetch(`${BASE}/admin`)).text();
    check('lee la lista de atascados como arreglo', html.includes('Array.isArray(r) ? r : []'));
    check('envuelve y etiqueta las tablas para el celular', html.includes('function etiquetarTablas'));
  } finally {
    if (servidor.pid) { try { process.kill(-servidor.pid); } catch { /* ya salió */ } }
    await prisma.trip.deleteMany({ where: { requestRef: `NXT-A${m}` } });
    await prisma.errand.deleteMany({ where: { requestRef: `MD-S${m}` } });
    await prisma.order.deleteMany({ where: { orderRef: `NX-${m}` } });
    await prisma.vehicle.deleteMany({ where: { driverId: conductor.id } });
    await prisma.business.deleteMany({ where: { id: { in: [negocioVacio.id, negocioConPedidos.id] } } });
    await prisma.$disconnect();
  }
  console.log(`\n${ok} bien · ${mal} mal`);
  if (mal > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
