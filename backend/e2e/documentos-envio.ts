/**
 * Los papeles que viajan CON la carga, contra PostgreSQL real y por HTTP.
 *
 * QUÉ FALTABA. El repo guardaba los documentos del CONDUCTOR y los de la
 * EMPRESA, pero no los del ENVÍO — que son los que piden en la carretera.
 * Iban en una carpeta en la cabina.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *  1. **El conductor sube y la flota lo ve, y al revés.** Es LA razón de
 *     que sea una sola tabla: si cada lado tuviera la suya, el camión
 *     saldría con la lista del portal y el conductor enseñaría otra.
 *  2. **La pertenencia aguanta de verdad.** Un conductor ajeno no puede ni
 *     listar ni subir ni borrar, y una flota vecina tampoco. Esto no se
 *     puede comprobar leyendo el código: hay que golpear las rutas con el
 *     token equivocado.
 *  3. **Un documento firmado NO se borra**, y el rechazo dice qué hacer en
 *     su lugar.
 *  4. **El aviso de lo que falta es un AVISO**, no una guarda: el viaje se
 *     despacha igual sin remesa, porque quien decide es la empresa.
 *  5. **Un PDF entra.** Una remesa llega tanto en foto como en el PDF que
 *     manda el cliente por correo; rechazarlo obligaría a imprimirlo para
 *     fotografiarlo, que es lo que esto viene a quitar.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/documentos-envio.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3137);
const BASE = `http://localhost:${PUERTO}`;
const OTP = '424242';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

type Res = { status: number; json: { success?: boolean; data?: unknown; error?: string } };

async function pedir(
  metodo: string, ruta: string, opts: { token?: string; body?: unknown } = {},
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

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
/** Un PDF mínimo pero real: la ruta mira el tipo declarado. */
const PDF_MIN = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

async function subirDoc(
  base: string, token: string, clase: string, id: string,
  campos: Record<string, string>, pdf = false,
): Promise<Res> {
  const form = new FormData();
  const cuerpo = pdf ? PDF_MIN : PNG_1X1;
  form.append(
    'file',
    new Blob([new Uint8Array(cuerpo)], { type: pdf ? 'application/pdf' : 'image/png' }),
    pdf ? 'remesa.pdf' : 'remesa.png',
  );
  for (const [k, v] of Object.entries(campos)) form.append(k, v);
  const r = await fetch(`${BASE}${base}/envio-docs/${clase}/${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let json: Res['json'] = {};
  try { json = (await r.json()) as Res['json']; } catch { /* sin JSON */ }
  return { status: r.status, json };
}

async function arrancarServidor(): Promise<ChildProcess> {
  try {
    const ocupado = await fetch(`${BASE}/health`);
    if (ocupado.ok) throw new Error(`el puerto ${PUERTO} ya está ocupado (fuser -k ${PUERTO}/tcp).`);
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
      OTP_FALLBACK_CODE: OTP,
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
    try { if ((await fetch(`${BASE}/health`)).ok) return hijo; } catch { /* todavía no */ }
  }
  console.error(registros.join(''));
  throw new Error('el servidor no arrancó');
}

function matar(s: ChildProcess) {
  try { if (s.pid) process.kill(-s.pid, 'SIGKILL'); } catch { s.kill('SIGKILL'); }
}

async function entrarComoConductor(telefono: string): Promise<string> {
  await pedir('POST', '/auth/send-otp', { body: { phone: telefono } });
  const r = await pedir('POST', '/auth/verify-otp', { body: { phone: telefono, otp: OTP } });
  const d = r.json.data as { token?: string } | undefined;
  if (!d?.token) throw new Error(`conductor no entró: ${JSON.stringify(r.json)}`);
  return d.token;
}

async function entrarComoEmpresa(telefono: string): Promise<string> {
  await pedir('POST', '/operator/auth/send-otp', { body: { phone: telefono } });
  const r = await pedir('POST', '/operator/auth/verify-otp', { body: { phone: telefono, otp: OTP } });
  const d = r.json.data as { token?: string } | undefined;
  if (!d?.token) throw new Error(`empresa no entró: ${JSON.stringify(r.json)}`);
  return d.token;
}

type Doc = {
  id: string; type: string; typeLabel?: string; number?: string;
  faltaFirma: boolean; uploadedBy: string; fileUrl: string;
};
type Listado = { documentos: Doc[]; faltanEnVia: string[] };

const suf = Math.floor(10000 + Math.random() * 89999);

async function main() {
  const servidor = await arrancarServidor();
  const marca = `e2edocs-${Date.now()}`;
  const telCond = `+5730101${suf}`;
  const telOtroCond = `+5730102${suf}`;
  const telEmp = `+5730103${suf}`;
  const telEmpVecina = `+5730104${suf}`;
  const ids: string[] = [];

  try {
    // ── Preparación: dos empresas, dos conductores, un viaje de carga ─────
    const empresa = await prisma.operator.create({
      data: {
        legalName: `${marca} Transportes`, nit: `900${suf}`, type: 'CARGA',
        status: 'ACTIVE', isVerified: true, contactPhone: telEmp,
        members: { create: { phone: telEmp, role: 'OWNER', name: 'Dueña' } },
      },
    });
    const vecina = await prisma.operator.create({
      data: {
        legalName: `${marca} Vecina`, nit: `901${suf}`, type: 'CARGA',
        status: 'ACTIVE', isVerified: true, contactPhone: telEmpVecina,
        members: { create: { phone: telEmpVecina, role: 'OWNER', name: 'Vecino' } },
      },
    });
    const conductor = await prisma.driver.create({
      data: {
        name: 'Camionero', phone: telCond, isVerified: true,
        operatorId: empresa.id, citySlug: 'pamplona',
      },
    });
    await prisma.driver.create({
      data: { name: 'Ajeno', phone: telOtroCond, isVerified: true, citySlug: 'pamplona' },
    });
    const viaje = await prisma.cargoTrip.create({
      data: {
        operatorId: empresa.id, number: 1 + Math.floor(Math.random() * 9000),
        driverId: conductor.id, driverName: conductor.name,
        originCity: 'cucuta', destCity: 'bucaramanga', status: 'DRAFT',
      },
    });

    const tCond = await entrarComoConductor(telCond);
    const tOtro = await entrarComoConductor(telOtroCond);
    const tEmp = await entrarComoEmpresa(telEmp);
    const tVecina = await entrarComoEmpresa(telEmpVecina);

    // ── 1. Nace sin papeles, y lo dice ────────────────────────────────────
    console.log('\n[1] El viaje recién creado');
    const vacio = await pedir('GET', `/operator/envio-docs/cargoTrip/${viaje.id}`, { token: tEmp });
    const l0 = vacio.json.data as Listado | undefined;
    check(vacio.status === 200, 'la flota puede consultar', { status: vacio.status, err: vacio.json.error });
    check(l0?.documentos.length === 0, 'sin documentos todavía');
    check(
      JSON.stringify(l0?.faltanEnVia) === JSON.stringify(['REMESA', 'MANIFIESTO']),
      'y dice qué falta de lo que piden en la vía', l0?.faltanEnVia,
    );

    // ── 2. La flota sube la remesa; el CONDUCTOR la ve ────────────────────
    console.log('\n[2] La flota sube y el conductor abre');
    const sube = await subirDoc('/operator', tEmp, 'cargoTrip', viaje.id, {
      tipo: 'remesa', numero: ' 066 ', nota: 'La manda el cliente por correo',
    });
    const creado = sube.json.data as Doc | undefined;
    check(sube.status === 201, 'la remesa se sube', { status: sube.status, err: sube.json.error });
    if (creado?.id) ids.push(creado.id);
    check(creado?.number === '066',
      'el número se guarda TAL CUAL, no normalizado a 66', creado?.number);
    check(creado?.typeLabel === 'Remesa terrestre de carga',
      'con su etiqueta en español, redactada por el servidor', creado?.typeLabel);
    check(creado?.uploadedBy === 'empresa', 'y queda quién la subió', creado?.uploadedBy);
    check(creado?.faltaFirma === true,
      'avisa de que una remesa suele ir firmada y esta no lo está');

    const desdeCabina = await pedir('GET', `/driver/envio-docs/cargoTrip/${viaje.id}`, { token: tCond });
    const l1 = desdeCabina.json.data as Listado | undefined;
    check(desdeCabina.status === 200 && l1?.documentos.length === 1,
      'EL CONDUCTOR la ve: es una sola tabla, no dos listas',
      { status: desdeCabina.status, n: l1?.documentos.length });
    check(JSON.stringify(l1?.faltanEnVia) === JSON.stringify(['MANIFIESTO']),
      'y el aviso baja a lo que sigue faltando', l1?.faltanEnVia);

    // ── 3. El conductor sube el manifiesto en PDF ─────────────────────────
    console.log('\n[3] El conductor sube, y en PDF');
    const pdf = await subirDoc('/driver', tCond, 'cargoTrip', viaje.id,
      { tipo: 'MANIFIESTO', numero: 'MC-9981' }, true);
    const docPdf = pdf.json.data as Doc | undefined;
    check(pdf.status === 201, 'un PDF entra', { status: pdf.status, err: pdf.json.error });
    if (docPdf?.id) ids.push(docPdf.id);
    check(docPdf?.uploadedBy === 'conductor', 'y queda que lo subió él', docPdf?.uploadedBy);

    const l2 = (await pedir('GET', `/operator/envio-docs/cargoTrip/${viaje.id}`, { token: tEmp }))
      .json.data as Listado | undefined;
    check(l2?.documentos.length === 2, 'la flota ve los dos', l2?.documentos.length);
    check(l2?.faltanEnVia.length === 0, 'y ya no falta nada en la vía', l2?.faltanEnVia);

    // ── 4. La pertenencia ─────────────────────────────────────────────────
    console.log('\n[4] Quien no tiene nada que ver');
    const leeAjeno = await pedir('GET', `/driver/envio-docs/cargoTrip/${viaje.id}`, { token: tOtro });
    check(leeAjeno.status === 400,
      'otro conductor NO puede listar los papeles de este viaje', { status: leeAjeno.status });
    const subeAjeno = await subirDoc('/driver', tOtro, 'cargoTrip', viaje.id, { tipo: 'FACTURA' });
    check(subeAjeno.status === 400,
      'ni subir nada', { status: subeAjeno.status, err: subeAjeno.json.error });
    const leeVecina = await pedir('GET', `/operator/envio-docs/cargoTrip/${viaje.id}`, { token: tVecina });
    check(leeVecina.status === 400,
      'la empresa vecina tampoco', { status: leeVecina.status });
    const borraVecina = await pedir('DELETE', `/operator/envio-docs/${creado?.id}`, { token: tVecina });
    check(borraVecina.status === 400,
      'y no puede borrar un documento ajeno', { status: borraVecina.status });
    const sigue = (await pedir('GET', `/operator/envio-docs/cargoTrip/${viaje.id}`, { token: tEmp }))
      .json.data as Listado | undefined;
    check(sigue?.documentos.length === 2, 'los dos siguen ahí', sigue?.documentos.length);

    // ── 5. Un documento firmado no se borra ───────────────────────────────
    console.log('\n[5] El papel firmado');
    await prisma.shipmentDocument.update({
      where: { id: creado!.id },
      data: { signatureUrl: '/uploads/firma.png', signedByName: 'Ana', signedAt: new Date() },
    });
    const borraFirmado = await pedir('DELETE', `/operator/envio-docs/${creado?.id}`, { token: tEmp });
    check(borraFirmado.status === 400,
      'no se puede borrar', { status: borraFirmado.status });
    check((borraFirmado.json.error ?? '').toLowerCase().includes('corregida'),
      'y se dice qué hacer en su lugar', borraFirmado.json.error);
    const trasFirma = (await pedir('GET', `/driver/envio-docs/cargoTrip/${viaje.id}`, { token: tCond }))
      .json.data as Listado | undefined;
    const remesa = trasFirma?.documentos.find((d) => d.type === 'REMESA');
    check(remesa?.faltaFirma === false, 'y ya no se avisa de que le falte firma');

    // El SIN firmar sí se retira.
    const borraLimpio = await pedir('DELETE', `/operator/envio-docs/${docPdf?.id}`, { token: tEmp });
    check(borraLimpio.status === 200, 'el que no está firmado sí se retira', { status: borraLimpio.status });

    // ── 6. El aviso es un aviso ───────────────────────────────────────────
    console.log('\n[6] Despachar sin los papeles');
    const l3 = (await pedir('GET', `/operator/envio-docs/cargoTrip/${viaje.id}`, { token: tEmp }))
      .json.data as Listado | undefined;
    check(JSON.stringify(l3?.faltanEnVia) === JSON.stringify(['MANIFIESTO']),
      'vuelve a faltar el manifiesto', l3?.faltanEnVia);
    // Un viaje de carga sin mercancía no despacha, y eso es una guarda que
    // ya existía y es correcta. La línea va aquí para que lo que se mida sea
    // lo que esta tanda introduce —la lista de papeles— y no esa otra.
    const linea = await pedir('POST', `/operator/cargo-trips/${viaje.id}/lines`, {
      token: tEmp,
      body: {
        clientName: 'Destinatario E2E', clientCity: 'bucaramanga',
        items: [{ measure: 120 }],
      },
    });
    check(linea.status === 201, 'se le añade una línea de mercancía',
      { status: linea.status, err: linea.json.error });

    const despacho = await pedir('POST', `/operator/cargo-trips/${viaje.id}/status`, {
      token: tEmp, body: { status: 'dispatched' },
    });
    check(despacho.status === 200 || despacho.status === 201,
      'y el viaje se despacha IGUAL: quien decide es la empresa, no esta lista',
      { status: despacho.status, err: despacho.json.error });

    // ── 7. Lo que no se admite ────────────────────────────────────────────
    console.log('\n[7] Los rechazos');
    const sinTipo = await subirDoc('/operator', tEmp, 'cargoTrip', viaje.id, {});
    check(sinTipo.status === 400,
      'sin tipo no entra: un montón de fotos sin clasificar es la carpeta de la cabina otra vez',
      { status: sinTipo.status });
    const tipoRaro = await subirDoc('/operator', tEmp, 'cargoTrip', viaje.id, { tipo: 'papelito' });
    check(tipoRaro.status === 400, 'ni un tipo inventado', { status: tipoRaro.status });
    const futura = await subirDoc('/operator', tEmp, 'cargoTrip', viaje.id, {
      tipo: 'FACTURA',
      fechaDocumento: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
    });
    check(futura.status === 400,
      'ni un papel fechado la semana que viene', { status: futura.status, err: futura.json.error });
    const claseRara = await subirDoc('/operator', tEmp, 'pedido', viaje.id, { tipo: 'FACTURA' });
    check(claseRara.status === 400, 'ni colgarlo de un tipo de servicio que no existe',
      { status: claseRara.status });

    // ── Limpieza ──────────────────────────────────────────────────────────
    await prisma.shipmentDocument.deleteMany({ where: { cargoTripId: viaje.id } });
    await prisma.cargoTrip.delete({ where: { id: viaje.id } });
    await prisma.driver.deleteMany({ where: { phone: { in: [telCond, telOtroCond] } } });
    await prisma.operatorMember.deleteMany({
      where: { operatorId: { in: [empresa.id, vecina.id] } },
    });
    await prisma.operator.deleteMany({ where: { id: { in: [empresa.id, vecina.id] } } });
  } finally {
    if (fallos > 0) {
      const regs = (servidor as ChildProcess & { registros?: string[] }).registros ?? [];
      console.log('\n── Registros ──\n' + regs.join('').slice(-3500));
    }
    matar(servidor);
  }

  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} comprobaciones OK, ${fallos} fallos`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
