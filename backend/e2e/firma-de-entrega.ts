/**
 * La firma de quien recibe, contra PostgreSQL real y por HTTP.
 *
 * EL DEFECTO QUE ESTO CIERRA. La hoja de prueba de entrega de la app del
 * conductor capturaba los trazos del destinatario y al confirmar pasaba
 * `hasSignature: true`. Los trazos se tiraban. El destinatario firmaba
 * creyendo que firmaba algo y lo único que quedaba era un booleano… que
 * además NADIE escribía nunca en la base: la columna nacía en `false` y
 * moría en `false`, mientras las dos apps y el portal del negocio pintaban
 * un sello «Firmado» que no podía ser cierto.
 *
 * LO QUE SOLO SE VE EJECUTANDO, y por qué:
 *
 *  1. **La firma se guarda de verdad**, por la ruta real y con multipart,
 *     en los TRES tipos de servicio (viaje, pedido, mandado). Un camino que
 *     funciona en pedidos y no en envíos es justo el que no se nota: el
 *     envío es donde la firma ES la prueba.
 *  2. **Llega a quien la reclama.** El cliente la ve en su DTO y el negocio
 *     en el suyo. Guardar una firma que nadie puede abrir no prueba nada, y
 *     es exactamente lo que pasaba con el booleano.
 *  3. **El booleano se DERIVA.** Ya no hay columna: `hasSignature` sale de
 *     que exista el archivo, así que no puede decir que hay firma donde no
 *     la hay.
 *  4. **La firma no pisa la foto de entrega ni al revés.** Son dos pruebas
 *     distintas y en una reclamación hacen falta las dos.
 *  5. **No se puede firmar el servicio de otro.** El `updateMany` lleva el
 *     `driverId` en el `where`: pertenencia y escritura en una operación.
 *  6. **La hora la pone el SERVIDOR.** La del teléfono se cambia en
 *     ajustes, y una constancia con hora que el firmante elige no es una
 *     constancia.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/firma-de-entrega.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { prisma } from '../src/lib/prisma';
import { getClientOrderById } from '../src/services/client.service';
import { getBusinessService } from '../src/services/business.service';

const PUERTO = Number(process.env['E2E_PORT'] ?? 3131);
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

/** Un PNG de 1×1 de verdad: la ruta exige `image/*`. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Sube una prueba por la ruta REAL, con multipart como lo hace la app. */
async function subirPrueba(
  token: string, kind: string, id: string,
  phase: string | null, signedBy?: string,
): Promise<Res> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(PNG_1X1)], { type: 'image/png' }), 'prueba.png');
  // `phase` null = app vieja que no manda el campo. Es el caso que no puede
  // romperse al añadir la firma.
  if (phase !== null) form.append('phase', phase);
  if (signedBy !== undefined) form.append('signedBy', signedBy);
  const r = await fetch(`${BASE}/driver/proof/${kind}/${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let json: Res['json'] = {};
  try { json = (await r.json()) as Res['json']; } catch { /* sin JSON */ }
  return { status: r.status, json };
}

async function arrancarServidor(): Promise<ChildProcess> {
  // Un servidor huérfano en el puerto haría que la prueba midiera el código
  // viejo y diera un verde que no significa nada. Ya pasó.
  try {
    const ocupado = await fetch(`${BASE}/health`);
    if (ocupado.ok) {
      throw new Error(`el puerto ${PUERTO} ya está ocupado. Mátalo (fuser -k ${PUERTO}/tcp).`);
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
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return hijo;
    } catch { /* todavía no */ }
  }
  console.error(registros.join(''));
  throw new Error('el servidor no arrancó');
}

function matar(s: ChildProcess) {
  // `npx` lanza un node hijo: matar solo a npx deja el servidor vivo.
  try {
    if (s.pid) process.kill(-s.pid, 'SIGKILL');
  } catch { s.kill('SIGKILL'); }
}

async function entrarComoConductor(telefono: string): Promise<string> {
  await pedir('POST', '/auth/send-otp', { body: { phone: telefono } });
  const r = await pedir('POST', '/auth/verify-otp', { body: { phone: telefono, otp: OTP } });
  const data = r.json.data as { token?: string } | undefined;
  if (!data?.token) throw new Error(`conductor no pudo entrar: ${JSON.stringify(r.json)}`);
  return data.token;
}

const suf = Math.floor(10000 + Math.random() * 89999);

async function main() {
  const servidor = await arrancarServidor();
  const marca = `e2efirma-${Date.now()}`;
  const telCond = `+5730091${suf}`;
  const telOtro = `+5730092${suf}`;

  try {
    // ── Preparación ────────────────────────────────────────────────────────
    const conductor = await prisma.driver.create({
      data: {
        name: 'Repartidor Firma', phone: telCond,
        isVerified: true, status: 'ON_TRIP', citySlug: 'pamplona',
        lastLat: 7.3754, lastLng: -72.6486, lastSeenAt: new Date(),
      },
    });
    const ajeno = await prisma.driver.create({
      data: { name: 'Conductor Ajeno', phone: telOtro, isVerified: true, citySlug: 'pamplona' },
    });
    const pasajera = await prisma.user.create({
      data: { name: 'Destinataria', phone: `+5730093${suf}` },
    });
    const negocio = await prisma.business.create({
      data: {
        name: `${marca} Tienda`, ownerName: 'Dueño', phone: `+5730094${suf}`,
        address: 'Calle 5 # 3-40', category: 'RESTAURANT', token: `tok-${marca}`,
        lat: 7.3754, lng: -72.6486, deliveryFee: 4000, etaMinutes: 25,
      },
    });

    const tokenCond = await entrarComoConductor(telCond);
    const tokenAjeno = await entrarComoConductor(telOtro);

    // El conductor que se acaba de crear por OTP NO es el sembrado: el login
    // busca por teléfono y lo encuentra, así que es el mismo. Se comprueba,
    // porque si no lo fuera todas las subidas darían 404 y el E2E diría que
    // la pertenencia funciona cuando en realidad nada funciona.
    const trasLogin = await prisma.driver.findUnique({ where: { phone: telCond } });
    check(trasLogin?.id === conductor.id,
      'el login del conductor usa la ficha sembrada, no crea otra', { a: conductor.id, b: trasLogin?.id });
    const ajenoTrasLogin = await prisma.driver.findUnique({ where: { phone: telOtro } });

    // ── 1. El ENVÍO: un viaje con destinatario ─────────────────────────────
    console.log('\n[1] El envío: la firma del destinatario se guarda');
    const envio = await prisma.trip.create({
      data: {
        requestRef: `T-${marca}-1`,
        passengerId: pasajera.id, driverId: conductor.id,
        serviceType: 'ENVIOS', status: 'IN_PROGRESS',
        originAddress: 'Centro', originLat: 7.3754, originLng: -72.6486,
        destAddress: 'Calle 9 # 2-15', destLat: 7.3800, destLng: -72.6400,
        estimatedFare: 9000,
        recipientName: 'Ana Gómez', recipientPhone: '+573001112233',
        packageDescription: 'Caja pequeña',
      },
    });

    const antesDeFirmar = new Date();
    const r1 = await subirPrueba(tokenCond, 'trip', envio.id, 'signature', '  Ana Gómez  ');
    check(r1.status === 201 || r1.status === 200,
      'la firma del envío se sube por la ruta real', { status: r1.status, err: r1.json.error });

    const envioBD = await prisma.trip.findUnique({ where: { id: envio.id } });
    check(!!envioBD?.signatureUrl, 'el trazo queda guardado en la base', envioBD?.signatureUrl);
    check(envioBD?.signedByName === 'Ana Gómez',
      'el nombre de quien firmó queda, sin los espacios de los bordes', envioBD?.signedByName);
    check(!!envioBD?.signedAt && envioBD.signedAt >= antesDeFirmar,
      'la hora la pone el servidor, no el teléfono', envioBD?.signedAt);
    check(envioBD?.deliveryPhotoUrl === null,
      'la firma NO se guardó como si fuera la foto de entrega', envioBD?.deliveryPhotoUrl);

    // La foto de entrega aparte: son dos pruebas y en una reclamación hacen
    // falta las dos.
    await subirPrueba(tokenCond, 'trip', envio.id, 'delivery');
    const envioBD2 = await prisma.trip.findUnique({ where: { id: envio.id } });
    check(!!envioBD2?.deliveryPhotoUrl && !!envioBD2?.signatureUrl,
      'la foto de entrega no pisa la firma: conviven',
      { foto: envioBD2?.deliveryPhotoUrl, firma: envioBD2?.signatureUrl });

    // ── 2. No se puede firmar el servicio de otro ──────────────────────────
    console.log('\n[2] El servicio ajeno');
    const rAjeno = await subirPrueba(tokenAjeno, 'trip', envio.id, 'signature', 'Impostor');
    check(rAjeno.status === 404,
      'otro conductor no puede firmar este envío', { status: rAjeno.status });
    const sinTocar = await prisma.trip.findUnique({ where: { id: envio.id } });
    check(sinTocar?.signedByName === 'Ana Gómez',
      'y la firma legítima queda intacta', sinTocar?.signedByName);
    check(ajenoTrasLogin?.id === ajeno.id, 'el conductor ajeno es el sembrado');

    // ── 3. El PEDIDO: llega al cliente y al negocio ────────────────────────
    console.log('\n[3] El pedido: la firma llega a quien la reclama');
    const producto = await prisma.product.create({
      data: { businessId: negocio.id, name: 'Combo', price: 20000, category: 'Platos' },
    });
    const pedido = await prisma.order.create({
      data: {
        orderRef: `P-${marca}`, businessId: negocio.id, userId: pasajera.id,
        driverId: conductor.id, driverName: conductor.name,
        status: 'IN_TRANSIT', subtotal: 20000, deliveryFee: 4000, total: 24000,
        deliveryAddress: 'Calle 9 # 2-15', customerName: 'Destinataria',
        lines: { create: [{ productId: producto.id, productName: 'Combo', quantity: 1, unitPrice: 20000, subtotal: 20000 }] },
      },
    });

    const rPedido = await subirPrueba(tokenCond, 'order', pedido.id, 'signature', 'Carlos Ruiz');
    check(rPedido.status === 201 || rPedido.status === 200,
      'la firma del pedido se sube', { status: rPedido.status, err: rPedido.json.error });

    const vistaCliente = await getClientOrderById(pasajera.id, pedido.id);
    check(!!vistaCliente?.signatureUrl,
      'el CLIENTE ve la firma en su pedido, no solo un sello', vistaCliente?.signatureUrl);
    check(vistaCliente?.signedByName === 'Carlos Ruiz',
      'y ve quién firmó', vistaCliente?.signedByName);
    check(vistaCliente?.hasSignature === true,
      'el booleano, derivado del archivo, dice que sí');

    // El detalle es LA pantalla del portal donde vive el sello «Firmado».
    const enPortal = await getBusinessService().getOrderDetail(pedido.id, negocio.id);
    check(!!enPortal.signatureUrl,
      'el NEGOCIO la ve en su portal', enPortal.signatureUrl);
    check(enPortal.signedByName === 'Carlos Ruiz',
      'con el nombre de quien firmó', enPortal.signedByName);
    check(enPortal.hasSignature === true && enPortal.hasDeliveryProof === true,
      'y la cadena de custodia la cuenta como prueba de entrega',
      { firma: enPortal.hasSignature, entrega: enPortal.hasDeliveryProof });

    // ── 4. El booleano se DERIVA ───────────────────────────────────────────
    console.log('\n[4] Sin firma, el booleano dice que no');
    const pedidoSinFirma = await prisma.order.create({
      data: {
        orderRef: `P2-${marca}`, businessId: negocio.id, userId: pasajera.id,
        driverId: conductor.id, status: 'IN_TRANSIT',
        subtotal: 10000, deliveryFee: 4000, total: 14000,
        deliveryAddress: 'Otra calle',
        lines: { create: [{ productId: producto.id, productName: 'Combo', quantity: 1, unitPrice: 10000, subtotal: 10000 }] },
      },
    });
    const vistaSin = await getClientOrderById(pasajera.id, pedidoSinFirma.id);
    check(vistaSin?.hasSignature === false,
      'un pedido sin firmar NO se anuncia como firmado', vistaSin?.hasSignature);
    check(vistaSin?.signatureUrl === undefined,
      'y no trae una URL vacía que la app intentaría cargar', vistaSin?.signatureUrl);
    // Contraprueba del hallazgo que originó la tanda: la columna booleana ya
    // no existe, así que nadie puede escribir «firmado» sin firma.
    const columnas = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'hasSignature'`,
    );
    check(columnas.length === 0,
      'la columna booleana muerta ya no existe: no hay dos datos que discrepen', columnas);

    // ── 5. El MANDADO ──────────────────────────────────────────────────────
    console.log('\n[5] El mandado');
    const mandado = await prisma.errand.create({
      data: {
        requestRef: `M-${marca}`, userId: pasajera.id, driverId: conductor.id,
        category: 'PHARMACY', description: 'Acetaminofén',
        pickupAddress: 'Droguería', dropoffAddress: 'Calle 9 # 2-15',
        serviceFee: 6000, status: 'ON_THE_WAY', updatedAt: new Date(),
      },
    });
    const rMandado = await subirPrueba(tokenCond, 'errand', mandado.id, 'signature', 'Luz Marina');
    check(rMandado.status === 201 || rMandado.status === 200,
      'la firma del mandado se sube', { status: rMandado.status, err: rMandado.json.error });
    const mandadoBD = await prisma.errand.findUnique({ where: { id: mandado.id } });
    check(!!mandadoBD?.signatureUrl && mandadoBD.signedByName === 'Luz Marina',
      'queda con su nombre', { url: mandadoBD?.signatureUrl, quien: mandadoBD?.signedByName });
    check(mandadoBD?.proofPhotoUrl === null,
      'y no se confundió con la foto de recogida del mandado', mandadoBD?.proofPhotoUrl);

    // ── 6. La app VIEJA sigue entregando ───────────────────────────────────
    console.log('\n[6] El repartidor con el APK de hace dos meses');
    const viejo = await prisma.order.create({
      data: {
        orderRef: `P3-${marca}`, businessId: negocio.id, userId: pasajera.id,
        driverId: conductor.id, status: 'IN_TRANSIT',
        subtotal: 8000, deliveryFee: 4000, total: 12000, deliveryAddress: 'Tercera',
        lines: { create: [{ productId: producto.id, productName: 'Combo', quantity: 1, unitPrice: 8000, subtotal: 8000 }] },
      },
    });
    // Sin el campo `phase`: es lo que manda una app que no sabe de firmas.
    const rViejo = await subirPrueba(tokenCond, 'order', viejo.id, null);
    check(rViejo.status === 201 || rViejo.status === 200,
      'sube su foto sin mandar fase', { status: rViejo.status, err: rViejo.json.error });
    const viejoBD = await prisma.order.findUnique({ where: { id: viejo.id } });
    check(!!viejoBD?.deliveryPhotoUrl,
      'y se guarda como foto de ENTREGA, igual que siempre', viejoBD?.deliveryPhotoUrl);
    check(viejoBD?.signatureUrl === null && viejoBD?.signedAt === null,
      'sin dejar una constancia de firma que nadie dio',
      { url: viejoBD?.signatureUrl, at: viejoBD?.signedAt });

    // ── 7. Una firma sin nombre ────────────────────────────────────────────
    console.log('\n[7] Quien no dice su nombre');
    const anon = await prisma.errand.create({
      data: {
        requestRef: `M2-${marca}`, userId: pasajera.id, driverId: conductor.id,
        category: 'OTHER', description: 'Sobre',
        pickupAddress: 'Oficina', dropoffAddress: 'Casa',
        serviceFee: 5000, status: 'ON_THE_WAY', updatedAt: new Date(),
      },
    });
    await subirPrueba(tokenCond, 'errand', anon.id, 'signature', '   ');
    const anonBD = await prisma.errand.findUnique({ where: { id: anon.id } });
    check(!!anonBD?.signatureUrl, 'la firma se guarda igual');
    check(anonBD?.signedByName === null,
      'y el nombre queda en null, no en una cadena vacía que se pintaría en blanco',
      anonBD?.signedByName);

    // ── Limpieza ───────────────────────────────────────────────────────────
    await prisma.orderLine.deleteMany({
      where: { orderId: { in: [pedido.id, pedidoSinFirma.id, viejo.id] } },
    });
    await prisma.orderEvent.deleteMany({
      where: { orderId: { in: [pedido.id, pedidoSinFirma.id, viejo.id] } },
    });
    await prisma.order.deleteMany({ where: { businessId: negocio.id } });
    await prisma.errand.deleteMany({ where: { userId: pasajera.id } });
    await prisma.trip.deleteMany({ where: { passengerId: pasajera.id } });
    await prisma.product.delete({ where: { id: producto.id } });
    await prisma.business.delete({ where: { id: negocio.id } });
    await prisma.user.delete({ where: { id: pasajera.id } });
    await prisma.driver.deleteMany({ where: { id: { in: [conductor.id, ajeno.id] } } });
  } finally {
    if (fallos > 0) {
      const regs = (servidor as ChildProcess & { registros?: string[] }).registros ?? [];
      console.log('\n── Registros del servidor ──\n' + regs.join('').slice(-4000));
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
