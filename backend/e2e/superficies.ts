/**
 * Recorrido de humo por las CINCO superficies, contra el backend LEVANTADO.
 *
 * `npm run typecheck` y los tests unitarios no prueban que el servidor
 * arranque ni que las rutas estén montadas: se puede tener todo en verde y un
 * portal que responde 404 en la mitad de sus pantallas. Esto hace las mismas
 * peticiones que hacen la app cliente, la app conductor, /negocio, /empresa y
 * /admin, y falla si alguna deja de responder.
 *
 * Se corre contra un backend en marcha (por defecto localhost:3000):
 *
 *   node dist/index.js &            # con DATABASE_URL y OTP_FALLBACK_CODE
 *   npx tsx e2e/superficies.ts
 *
 * OJO: el limitador antifraude es por IP y vive en memoria, así que varias
 * pasadas seguidas acaban en 429 — que es correcto, es su trabajo. Cuando
 * pase, reinicia el backend en vez de tocar el limitador.
 */
const BASE = process.env['SMOKE_BASE'] ?? 'http://localhost:3000';
let fallos = 0;
const rotos: string[] = [];

function ok(nombre: string, cond: boolean, detalle = ''): void {
  console.log(`${cond ? '  ✓' : '  ✗'} ${nombre}${cond ? '' : ` — ${detalle}`}`);
  if (!cond) { fallos++; rotos.push(nombre); }
}

type Res = { status: number; json: any };
async function pedir(
  metodo: string, ruta: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<Res> {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try { json = await r.json(); } catch { /* respuesta no JSON */ }
  return { status: r.status, json };
}

const tel = () => `+5730${Math.floor(10000000 + Math.random() * 89999999)}`;
const OTP = '123456';

async function main(): Promise<void> {
  // ─── APP CLIENTE ────────────────────────────────────────────────────────────
  console.log('\n═══ APP CLIENTE ═══');
  const telCliente = tel();
  let r = await pedir('POST', '/client/auth/send-otp', { body: { phone: telCliente } });
  ok('pide el código por SMS', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
  r = await pedir('POST', '/client/auth/verify-otp', {
    body: { phone: telCliente, otp: OTP, name: 'Humo Cliente' },
  });
  const tokCliente = r.json?.data?.token as string | undefined;
  ok('entra y recibe su token', !!tokCliente, `${r.status} ${JSON.stringify(r.json)}`);

  r = await pedir('GET', '/client/profile', { token: tokCliente });
  ok('su perfil carga', r.status === 200 && !!r.json?.data, `${r.status}`);

  r = await pedir('GET',
    '/client/trips/options?originLat=7.3754&originLng=-72.6486&destLat=7.3921&destLng=-72.6602',
    { token: tokCliente });
  const cats = (r.json?.data?.opciones ?? r.json?.data) as any[] | undefined;
  ok('el selector de categorías cotiza', Array.isArray(cats) && cats.length === 3,
    `${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  const taxi = cats?.find((c) => c.categoria === 'TAXI');
  ok('el taxi trae precio del decreto', (taxi?.fare ?? 0) >= 7000, JSON.stringify(taxi));

  r = await pedir('GET', '/client/drivers/nearby?lat=7.3754&lng=-72.6486', { token: tokCliente });
  ok('el mapa del home pide vehículos cerca', r.status === 200 && Array.isArray(r.json?.data),
    `${r.status}`);

  r = await pedir('GET', '/client/businesses', { token: tokCliente });
  ok('la lista de negocios responde', r.status === 200 && Array.isArray(r.json?.data), `${r.status}`);

  r = await pedir('GET', '/client/trips/active', { token: tokCliente });
  ok('«¿tengo un viaje activo?» responde', r.status === 200, `${r.status}`);

  r = await pedir('POST', '/client/trips/request', {
    token: tokCliente,
    body: {
      serviceType: 'taxi', originAddress: 'Parque', destinationAddress: 'Terminal',
      originLat: 7.3754, originLng: -72.6486, destLat: 7.3921, destLng: -72.6602,
      paymentMethod: 'transferencia',
    },
  });
  const viajeId = r.json?.data?.id as string | undefined;
  ok('puede pedir un taxi', !!viajeId, `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  ok('con el método de pago que eligió',
    r.json?.data?.paymentMethod === 'transferencia', `${r.json?.data?.paymentMethod}`);
  ok('y el precio lo pone el servidor, no la app',
    (r.json?.data?.estimatedFare ?? 0) >= 7000, `${r.json?.data?.estimatedFare}`);
  if (viajeId) {
    r = await pedir('POST', `/client/trips/${viajeId}/cancel`, { token: tokCliente });
    ok('y cancelarlo', r.status === 200, `${r.status}`);
  }

  r = await pedir('GET', '/client/intercity/routes');
  ok('el intermunicipal ofrece rutas', r.status === 200 && !!r.json?.data, `${r.status}`);
  r = await pedir('GET', '/client/intercity/active', { token: tokCliente });
  ok('«¿tengo reserva activa?» responde', r.status === 200, `${r.status}`);

  r = await pedir('GET', '/client/support/tickets', { token: tokCliente });
  ok('soporte responde', r.status === 200, `${r.status}`);

  // ─── APP CONDUCTOR ──────────────────────────────────────────────────────────
  console.log('\n═══ APP CONDUCTOR ═══');
  const telCond = tel();
  r = await pedir('POST', '/auth/send-otp', { body: { phone: telCond } });
  ok('pide el código', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
  r = await pedir('POST', '/auth/verify-otp', { body: { phone: telCond, otp: OTP } });
  let tokCond = r.json?.data?.token as string | undefined;
  const yaEstaba = r.json?.data?.isRegistered === true;
  ok('verifica el código', r.status === 200, `${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  if (!yaEstaba) {
    r = await pedir('POST', '/auth/register', {
      token: tokCond,
      body: {
        phone: telCond, fullName: 'Humo Conductor',
        documentType: 'CC', documentNumber: `10${Math.floor(1000000 + Math.random() * 8999999)}`,
        email: `humo${Date.now()}@nexum.test`,
        vehicleType: 'taxi', vehiclePlate: `HUM${Math.floor(100 + Math.random() * 899)}`,
        vehicleBrand: 'Chevrolet', vehicleModel: 'Spark', vehicleYear: 2020,
        vehicleColor: 'Amarillo', licenseNumber: '123456', acceptedTerms: true,
        bankName: 'Bancolombia', bankAccountType: 'Ahorros',
        bankAccountNumber: `${Math.floor(100000000 + Math.random() * 899999999)}`,
      },
    });
    tokCond = r.json?.data?.token as string | undefined;
    ok('se registra como taxista', !!tokCond, `${r.status} ${JSON.stringify(r.json).slice(0, 220)}`);
  }

  r = await pedir('GET', '/driver/profile', { token: tokCond });
  ok('su perfil carga', r.status === 200 && !!r.json?.data, `${r.status}`);
  r = await pedir('GET', '/driver/service-prefs', { token: tokCond });
  ok('sus preferencias de servicio cargan', r.status === 200, `${r.status}`);
  r = await pedir('GET', '/driver/intercity/availability', { token: tokCond });
  ok('el interruptor intermunicipal responde', r.status === 200, `${r.status}`);
  r = await pedir('GET', '/driver/kyc', { token: tokCond });
  ok('la verificación de identidad responde', r.status === 200, `${r.status}`);
  r = await pedir('GET', '/earnings/history', { token: tokCond });
  ok('sus ganancias cargan', r.status === 200, `${r.status}`);
  r = await pedir('GET', '/driver/freights', { token: tokCond });
  ok('sus fletes cargan', r.status === 200, `${r.status}`);
  r = await pedir('GET', '/driver/pro-status', { token: tokCond });
  ok('Nexum Pro responde', r.status === 200, `${r.status}`);
  r = await pedir('GET', '/driver/support/tickets', { token: tokCond });
  ok('soporte del conductor responde', r.status === 200, `${r.status}`);

  // ─── PORTAL DE NEGOCIOS ─────────────────────────────────────────────────────
  console.log('\n═══ PORTAL DE NEGOCIOS (/negocio) ═══');
  const telNeg = tel();
  r = await pedir('POST', '/business/register', {
    body: {
      name: `Humo Tienda ${Date.now()}`, ownerName: 'Dueño Humo', phone: telNeg,
      address: 'Calle 5 # 3-20', category: 'restaurante', city: 'Pamplona',
    },
  });
  const token = (r.json?.data?.accessToken ?? r.json?.data?.token) as string | undefined;
  ok('un negocio se registra solo', (r.status === 200 || r.status === 201) && !!token, `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);

  if (token) {
    r = await pedir('GET', `/business/${token}/info`);
    ok('su portal abre con el enlace único', r.status === 200 && !!r.json?.data, `${r.status}`);
    r = await pedir('GET', `/business/${token}/orders`);
    ok('los pedidos cargan CON los datos del negocio',
      r.status === 200 && !!r.json?.data?.business?.name, `${r.status}`);
    r = await pedir('POST', `/business/${token}/products`, {
      body: { name: 'Bandeja paisa', price: 25000, category: 'Platos' },
    });
    const prodId = r.json?.data?.id as string | undefined;
    ok('puede crear un producto', !!prodId, `${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
    r = await pedir('GET', `/business/${token}/products`);
    ok('y su catálogo lo lista', r.status === 200 && (r.json?.data?.length ?? 0) > 0, `${r.status}`);
    r = await pedir('GET', `/business/${token}/products/csv-template`);
    ok('la plantilla CSV se descarga', r.status === 200, `${r.status}`);
  }
  r = await pedir('POST', '/business/recover/send-otp', { body: { phone: telNeg } });
  ok('el rescate del enlace perdido responde', r.status === 200, `${r.status}`);

  // ─── PORTAL DE EMPRESAS ─────────────────────────────────────────────────────
  console.log('\n═══ PORTAL DE EMPRESAS (/empresa) ═══');
  const telEmp = tel();
  r = await pedir('POST', '/operator/register', {
    body: {
      kind: 'EMPRESA', legalName: `Trans Humo ${Date.now()}`, nit: `9${Date.now()}`.slice(0, 10),
      type: 'TAXI', contactName: 'Gerente Humo', contactPhone: telEmp,
      contactEmail: `humo${Date.now()}@trans.test`, city: 'Pamplona', acceptedTerms: true,
    },
  });
  ok('una empresa se registra (queda PENDIENTE)', r.status === 200 || r.status === 201,
    `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  r = await pedir('POST', '/operator/auth/send-otp', { body: { phone: telEmp } });
  ok('el login del portal manda el código', r.status === 200, `${r.status}`);
  r = await pedir('POST', '/operator/auth/verify-otp', { body: { phone: telEmp, otp: OTP } });
  const tokEmp = r.json?.data?.token as string | undefined;
  ok('y entra al portal', !!tokEmp, `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  if (tokEmp) {
    for (const [nombre, ruta] of [
      ['la torre de control (conductores)', '/operator/drivers'],
      ['la flota (vehículos)', '/operator/vehicles'],
      ['el equipo', '/operator/members'],
      ['los viajes para liquidar', '/operator/trips'],
      ['el panel financiero', '/operator/finance/summary'],
      ['las alertas de ruta', '/operator/alerts'],
      ['las rutas troncales', '/operator/routes'],
      ['las salidas programadas', '/operator/pool'],
      ['los documentos de habilitación', '/operator/documents'],
    ] as const) {
      const rr = await pedir('GET', ruta, { token: tokEmp });
      ok(nombre, rr.status === 200, `${ruta} → ${rr.status}`);
    }
  }

  // ─── PANEL DE ADMINISTRACIÓN ────────────────────────────────────────────────
  console.log('\n═══ PANEL ADMIN (/admin) ═══');
  const telAdmin = '+573001112233'; // el de ADMIN_PHONES
  r = await pedir('POST', '/admin/auth/send-otp', { body: { phone: telAdmin } });
  ok('el panel manda el código al admin', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
  r = await pedir('POST', '/admin/auth/verify-otp', { body: { phone: telAdmin, otp: OTP } });
  const tokAdmin = r.json?.data?.token as string | undefined;
  ok('el admin entra', !!tokAdmin, `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  if (tokAdmin) {
    for (const [nombre, ruta] of [
      ['métricas', '/admin/metrics'],
      ['conductores', '/admin/drivers'],
      ['negocios', '/admin/businesses'],
      ['empresas', '/admin/operators'],
      ['documentos por revisar', '/admin/verifications'],
      ['SOS', '/admin/sos'],
      ['alertas de ruta', '/admin/alerts'],
      ['soporte', '/admin/support'],
      ['clientes', '/admin/clients'],
      ['pagos a conductores', '/admin/payouts'],
      ['promociones', '/admin/promos'],
      ['retiros DMCA', '/admin/takedowns'],
      ['diagnóstico de despacho', '/admin/matching/diagnose?lat=7.3754&lng=-72.6486'],
    ] as const) {
      const rr = await pedir('GET', ruta, { token: tokAdmin });
      ok(nombre, rr.status === 200, `${ruta} → ${rr.status}`);
    }
  }
  const panel = await fetch(`${BASE}/admin`);
  const html = await panel.text();
  ok('el panel HTML se sirve', panel.status === 200 && html.includes('<html'), `${panel.status}`);

  // ─── LANDING Y LEGALES ──────────────────────────────────────────────────────
  console.log('\n═══ LEGALES Y RAÍZ ═══');
  r = await pedir('GET', '/legal/terms');
  ok('los términos se publican', r.status === 200 && !!r.json?.data?.body, `${r.status}`);
  r = await pedir('GET', '/legal/privacy');
  ok('la privacidad se publica', r.status === 200 && !!r.json?.data?.body, `${r.status}`);
  r = await pedir('GET', '/');
  ok('la raíz es amigable (no «Route not found»)', r.status === 200, `${r.status}`);
  r = await pedir('GET', '/geo/municipios');
  ok('los municipios se listan', r.status === 200 && (r.json?.data?.length ?? 0) > 40,
    `${r.status} ${r.json?.data?.length}`);

  console.log(`\n${fallos === 0 ? '✅ TODAS LAS SUPERFICIES RESPONDEN' : `❌ ${fallos} fallo(s):\n   - ${rotos.join('\n   - ')}`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
