/**
 * E2E de la entrada por WhatsApp: del mensaje al conductor.
 *
 * Lo que se prueba, por orden de gravedad:
 *
 *  1. **La firma es lo único que separa esto de un robo de cuentas.** Este
 *     webhook acaba emitiendo una sesión para el teléfono que diga el cuerpo.
 *     Se golpea la ruta REAL sin firma y con una firma de otro secreto, y se
 *     comprueba después que NO quedó ni un usuario ni un enlace — la
 *     contraprueba es lo que vale: sin ella, la comprobación pasaría también si
 *     el webhook estuviera roto y no hiciera nada nunca.
 *  2. **Un reintento de Meta no manda un segundo enlace** (se cobra y confunde).
 *  3. **El código es de un solo uso de verdad**, y el token que devuelve es una
 *     sesión REAL: se usa contra una ruta autenticada, no se mira su forma.
 *  4. **Lo que no se responde, y por qué**: número extranjero, mensaje viejo,
 *     acuse de entrega y tope diario.
 *  5. **La pregunta del usuario**: el viaje que pide alguien que llegó por
 *     WhatsApp le llega a un conductor igual que cualquier otro.
 *
 * Arranca el servidor de verdad como subproceso: el parser de cuerpo crudo que
 * hace posible validar la firma vive en index.ts, no en el router, así que
 * montar un express propio aquí probaría una réplica y no el producto.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/whatsapp-enlace.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import { createHmac } from 'crypto';
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const PUERTO = 3099;
const BASE = `http://localhost:${PUERTO}`;
const SECRETO = 'secreto-app-meta-de-prueba';
const VERIFY = 'token-handshake-de-prueba';

const ORIGEN = { lat: 7.3754, lng: -72.6486 };
const DESTINO = { lat: 7.3921, lng: -72.6602 };

const telColombiano = () => `+5730${Math.floor(10000000 + Math.random() * 89999999)}`;
let contadorWamid = 0;
const nuevoWamid = () => `wamid.E2E${Date.now()}${contadorWamid++}`;

/** Payload de Meta con un mensaje de texto. */
function payload(opts: {
  desde: string;
  wamid?: string;
  texto?: string;
  nombre?: string;
  segundos?: number;
}): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '573000000000', phone_number_id: '1' },
              contacts: [{ profile: { name: opts.nombre ?? 'Prueba' }, wa_id: opts.desde }],
              messages: [
                {
                  from: opts.desde,
                  id: opts.wamid ?? nuevoWamid(),
                  timestamp: String(opts.segundos ?? Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: opts.texto ?? 'taxi' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function firmar(cuerpo: string, secreto: string): string {
  return 'sha256=' + createHmac('sha256', secreto).update(Buffer.from(cuerpo)).digest('hex');
}

/** POST al webhook con la firma que se le indique. */
async function postWebhook(
  cuerpoObj: unknown,
  opts: { secreto?: string | null } = {},
): Promise<Response> {
  const cuerpo = JSON.stringify(cuerpoObj);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.secreto !== null) headers['X-Hub-Signature-256'] = firmar(cuerpo, opts.secreto ?? SECRETO);
  return fetch(`${BASE}/webhooks/whatsapp`, { method: 'POST', headers, body: cuerpo });
}

/** Espera a que el procesamiento en segundo plano del servidor termine. */
async function reposar(ms = 700): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Espera a que un mensaje concreto quede resuelto.
 *
 * El webhook responde 200 y procesa después, así que sin esto la prueba
 * dependería de dormir «lo suficiente» — y eso, además de lento, da falsos
 * verdes cuando el servidor va justo.
 */
async function esperarResuelto(wamid: string, ms = 4000): Promise<string | null> {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    const fila = await prisma.whatsappInbound.findUnique({ where: { waMessageId: wamid } });
    if (fila && fila.outcome !== 'procesando') return fila.outcome;
    await new Promise((r) => setTimeout(r, 80));
  }
  return null;
}

async function arrancarServidor(): Promise<ChildProcess> {
  // Si el puerto ya está ocupado —un servidor de una corrida anterior que no
  // murió— el `fetch` de abajo respondería enseguida y la prueba entera se
  // ejecutaría contra ESE servidor, con el código de antes, mientras el hijo
  // recién lanzado muere por EADDRINUSE sin que nadie lea su error. Pasó, y
  // costó tres corridas: dos comprobaciones fallaban con el código correcto.
  try {
    const ocupado = await fetch(`${BASE}/health`);
    if (ocupado.ok) {
      throw new Error(
        `el puerto ${PUERTO} ya está ocupado por otro servidor. ` +
          `Mátalo antes (fuser -k ${PUERTO}/tcp) o la prueba mediría el equivocado.`,
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('ya está ocupado')) throw e;
    /* nadie escucha: es lo que queremos */
  }

  // `detached` para poder matar el GRUPO entero al terminar: `npx` lanza el
  // node de verdad como hijo suyo, así que matar solo a `npx` deja el servidor
  // vivo ocupando el puerto. Eso es lo que llenó la máquina de servidores
  // huérfanos y lo que hacía que la corrida siguiente midiera el equivocado.
  const hijo = spawn('npx', ['tsx', 'src/index.ts'], {
    detached: true,
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PUERTO),
      NODE_ENV: 'development',
      JWT_SECRET: process.env['JWT_SECRET'] ?? 'e2e-secreto-largo-para-firmar-tokens-0123456789',
      WHATSAPP_APP_SECRET: SECRETO,
      WHATSAPP_VERIFY_TOKEN: VERIFY,
      // Sin ACCESS_TOKEN a propósito: el envío queda en modo mock y se ve en
      // los registros del hijo, sin llamar a Meta.
      CLIENT_WEB_URL: 'https://ejemplo.test/cliente',
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
    } catch {
      /* todavía no levanta */
    }
  }
  console.error(registros.join(''));
  throw new Error('el servidor no arrancó');
}

async function main(): Promise<void> {
  console.log('\n═══ E2E: entrada por WhatsApp ═══\n');
  const servidor = await arrancarServidor();
  const registros = (servidor as ChildProcess & { registros: string[] }).registros;

  try {
    // ── 0. Diagnóstico ────────────────────────────────────────────────────
    console.log('0. /health lo declara');
    const salud = (await (await fetch(`${BASE}/health`)).json()) as { whatsapp?: string };
    // Hay secreto y token de verificación pero no credenciales de envío: el
    // modo tiene que decirlo, que es el caso más fácil de dejar a medias.
    comprobar('modo = configuracion-incompleta', salud.whatsapp === 'configuracion-incompleta', String(salud.whatsapp));

    // ── 1. Handshake ──────────────────────────────────────────────────────
    console.log('\n1. Handshake de verificación');
    const malo = await fetch(
      `${BASE}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=RETO`,
    );
    comprobar('token equivocado → 403', malo.status === 403, String(malo.status));

    const bueno = await fetch(
      `${BASE}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=RETO`,
    );
    comprobar(
      'token correcto → 200 y devuelve el challenge',
      bueno.status === 200 && (await bueno.text()) === 'RETO',
    );

    // ── 2. La firma ───────────────────────────────────────────────────────
    console.log('\n2. Sin firma válida no pasa NADA');
    const victima = telColombiano();
    const victimaSinMas = victima.replace('+', '');

    // Se mide ANTES: contar enlaces en absoluto haría que la prueba dependiera
    // de encontrar la base vacía, y un resto de otra corrida la haría fallar
    // por un motivo que no tiene nada que ver.
    const enlacesAntes = await prisma.magicLink.count();

    const sinFirma = await postWebhook(payload({ desde: victimaSinMas }), { secreto: null });
    comprobar('sin cabecera de firma → 401', sinFirma.status === 401, String(sinFirma.status));

    const otraFirma = await postWebhook(payload({ desde: victimaSinMas }), {
      secreto: 'secreto-del-atacante',
    });
    comprobar('firma de otro secreto → 401', otraFirma.status === 401, String(otraFirma.status));

    const cuerpoOriginal = payload({ desde: victimaSinMas });
    const firmaBuena = firmar(JSON.stringify(cuerpoOriginal), SECRETO);
    const alterado = await fetch(`${BASE}/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': firmaBuena },
      body: JSON.stringify(payload({ desde: telColombiano().replace('+', '') })),
    });
    comprobar('cuerpo cambiado con firma buena → 401', alterado.status === 401, String(alterado.status));

    await reposar();
    // LA CONTRAPRUEBA. Sin esto, todo lo anterior pasaría igual si el webhook
    // estuviera muerto y no hiciera nada nunca.
    const usuarioTrasAtaques = await prisma.user.findUnique({ where: { phone: victima } });
    comprobar('los tres intentos NO crearon cuenta', usuarioTrasAtaques === null);
    const enlacesDespues = await prisma.magicLink.count();
    comprobar(
      'ni un solo enlace emitido',
      enlacesDespues === enlacesAntes,
      `${enlacesAntes} → ${enlacesDespues}`,
    );

    // ── 3. Con firma válida sí ────────────────────────────────────────────
    console.log('\n3. Con la firma correcta');
    const wamidPrimero = nuevoWamid();
    const ok = await postWebhook(
      payload({ desde: victimaSinMas, nombre: 'Kevin', wamid: wamidPrimero }),
    );
    comprobar('→ 200', ok.status === 200, String(ok.status));
    comprobar(
      'el servidor lo resuelve como respondido',
      (await esperarResuelto(wamidPrimero))?.startsWith('respondido') === true,
    );

    const usuario = await prisma.user.findUnique({ where: { phone: victima } });
    comprobar('la cuenta existe y en E.164', usuario !== null, 'no se creó');
    comprobar('toma el nombre del perfil de WhatsApp', usuario?.name === 'Kevin', String(usuario?.name));

    const enlaces = await prisma.magicLink.findMany({ where: { userId: usuario!.id } });
    comprobar('se emitió UN enlace', enlaces.length === 1, String(enlaces.length));
    comprobar('por el canal whatsapp', enlaces[0]?.channel === 'whatsapp');
    comprobar('y sin usar', enlaces[0]?.usedAt === null);

    const codigo = enlaces[0]!.code;
    // El registro del envío se escribe DESPUÉS de anotar la fila, así que aquí
    // todavía puede no estar: se espera un momento en vez de mirar una sola vez.
    let salioEnLog = false;
    for (let i = 0; i < 30 && !salioEnLog; i++) {
      salioEnLog = registros.join('').includes(`https://ejemplo.test/cliente/#/entrar?c=${codigo}`);
      if (!salioEnLog) await reposar(100);
    }
    comprobar(
      'el mensaje salió (modo mock) con el enlace detrás del #',
      salioEnLog,
      'no aparece en los registros del servidor',
    );

    // ── 4. Reintento de Meta ──────────────────────────────────────────────
    console.log('\n4. Un reintento no duplica el enlace');
    const wamidFijo = nuevoWamid();
    await postWebhook(payload({ desde: victimaSinMas, wamid: wamidFijo }));
    await reposar();
    const trasPrimero = await prisma.whatsappInbound.count({ where: { fromPhone: victima } });
    await postWebhook(payload({ desde: victimaSinMas, wamid: wamidFijo }));
    await reposar();
    const trasSegundo = await prisma.whatsappInbound.count({ where: { fromPhone: victima } });
    comprobar('el mismo wamid se procesa una sola vez', trasPrimero === trasSegundo, `${trasPrimero} → ${trasSegundo}`);

    // ── 5. Reuso del código vivo (palanca de costo) ───────────────────────
    console.log('\n5. Escribir otra vez reutiliza el código vivo');
    const vivos = await prisma.magicLink.findMany({
      where: { userId: usuario!.id, usedAt: null },
    });
    comprobar('sigue habiendo UN solo código vivo', vivos.length === 1, String(vivos.length));
    comprobar('y es el mismo de antes', vivos[0]?.code === codigo);

    // ── 6. Canje ──────────────────────────────────────────────────────────
    console.log('\n6. El código se canjea una vez y da una sesión REAL');
    const canje = await fetch(`${BASE}/client/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codigo }),
    });
    const canjeBody = (await canje.json()) as {
      success: boolean;
      data?: { token: string; client: { id: string; phone: string } };
    };
    comprobar('→ 200 con token', canje.status === 200 && Boolean(canjeBody.data?.token));
    comprobar('el cliente es el del teléfono', canjeBody.data?.client.phone === victima);

    const token = canjeBody.data!.token;
    // Que el token tenga forma de token no prueba nada: se usa de verdad.
    const perfil = await fetch(`${BASE}/client/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const perfilBody = (await perfil.json()) as { data?: { phone?: string } };
    comprobar(
      'el token abre una ruta autenticada real',
      perfil.status === 200 && perfilBody.data?.phone === victima,
      `${perfil.status} ${JSON.stringify(perfilBody).slice(0, 120)}`,
    );

    const segundo = await fetch(`${BASE}/client/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codigo }),
    });
    const segundoBody = (await segundo.json()) as { code?: string };
    comprobar(
      'el segundo canje se rechaza como ya usado',
      segundo.status === 401 && segundoBody.code === 'enlace-ya-usado',
      `${segundo.status} ${segundoBody.code}`,
    );

    const inventado = await fetch(`${BASE}/client/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'a'.repeat(32) }),
    });
    comprobar(
      'un código inventado → inexistente',
      inventado.status === 401 && ((await inventado.json()) as { code?: string }).code === 'enlace-inexistente',
    );

    // Vencido: se fabrica uno con la fecha pasada.
    const vencido = await prisma.magicLink.create({
      data: {
        // Único por corrida: un código fijo choca con el de la corrida
        // anterior y la prueba muere por un error de Prisma que no tiene nada
        // que ver con lo que se está comprobando.
        code: `V${Date.now()}${'x'.repeat(10)}`,
        userId: usuario!.id,
        channel: 'whatsapp',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const resVencido = await fetch(`${BASE}/client/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: vencido.code }),
    });
    comprobar(
      'un código vencido → vencido (y lo dice)',
      resVencido.status === 401 && ((await resVencido.json()) as { code?: string }).code === 'enlace-vencido',
    );

    // ── 7. Lo que NO se responde ──────────────────────────────────────────
    console.log('\n7. Lo que no merece respuesta');
    const venezolano = '584121234567';
    await postWebhook(payload({ desde: venezolano }));
    await reposar();
    const cuentasCon57 = await prisma.user.count({ where: { phone: { contains: '584121234567' } } });
    comprobar('un número extranjero no crea cuenta', cuentasCon57 === 0, String(cuentasCon57));
    comprobar(
      'ni queda registrado como entrante',
      (await prisma.whatsappInbound.count({ where: { fromPhone: { contains: '5841' } } })) === 0,
    );

    const viejo = telColombiano();
    await postWebhook(
      payload({ desde: viejo.replace('+', ''), segundos: Math.floor(Date.now() / 1000) - 3600 }),
    );
    await reposar();
    const filaVieja = await prisma.whatsappInbound.findFirst({ where: { fromPhone: viejo } });
    comprobar(
      'un mensaje de hace una hora se ignora y dice por qué',
      filaVieja?.outcome.startsWith('ignorado:mensaje-viejo') === true,
      String(filaVieja?.outcome),
    );
    comprobar(
      'y no le abre cuenta',
      (await prisma.user.count({ where: { phone: viejo } })) === 0,
    );

    const acuse = {
      entry: [
        {
          changes: [
            { field: 'messages', value: { statuses: [{ id: 'wamid.X', status: 'delivered' }] } },
          ],
        },
      ],
    };
    const antesAcuse = await prisma.whatsappInbound.count();
    await postWebhook(acuse);
    await reposar();
    comprobar(
      'un acuse de entrega no produce nada',
      (await prisma.whatsappInbound.count()) === antesAcuse,
    );

    // Tope diario: el que escribe en bucle deja de recibir.
    console.log('\n8. Tope diario por teléfono');
    const insistente = telColombiano();
    for (let i = 0; i < 12; i++) {
      const wamid = nuevoWamid();
      await postWebhook(
        payload({ desde: insistente.replace('+', ''), wamid, texto: `intento ${i}` }),
      );
      // Se espera a que ESE mensaje quede resuelto antes de mandar el
      // siguiente, en vez de dormir un rato fijo. El webhook responde 200 y
      // procesa después, así que con una pausa a ojo los mensajes se solapan y
      // el contador del tope lee un número viejo: la prueba fallaba sin que
      // hubiera nada roto (y peor, habría pasado con el tope quitado).
      await esperarResuelto(wamid);
    }
    const respondidos = await prisma.whatsappInbound.count({
      where: { fromPhone: insistente, outcome: { startsWith: 'respondido' } },
    });
    const topados = await prisma.whatsappInbound.count({
      where: { fromPhone: insistente, outcome: { startsWith: 'ignorado:tope-diario' } },
    });
    comprobar('deja de responder al llegar al tope', respondidos === 10, `respondidos=${respondidos}`);
    comprobar('y los siguientes quedan anotados como topados', topados === 2, `topados=${topados}`);

    // ── 9. La pregunta del usuario: ¿llega al conductor? ──────────────────
    // El token ya demostró ser una sesión real por HTTP. El despacho se
    // comprueba en este proceso porque la oferta viaja por un callback en
    // memoria (`registerSendToDriver`) que vive dentro del proceso del
    // servidor: desde fuera no hay forma de verla.
    console.log('\n9. El viaje de alguien que llegó por WhatsApp sí le llega a un conductor');
    const matching = await import('../src/services/matching.service');
    const { requestClientTrip } = await import('../src/services/client.service');

    const ofertas: Array<{ driverId: string; tipo: string }> = [];
    matching.registerSendToDriver((driverId: string, mensaje: { type: string }) => {
      ofertas.push({ driverId, tipo: mensaje.type });
      return true;
    });

    // Los conductores que dejó una corrida anterior abortada siguen ONLINE con
    // GPS fresco, y el despacho ofrece de a uno con quince segundos de espera:
    // la oferta se iba al conductor viejo y esta comprobación fallaba sin que
    // hubiera nada roto. Es la trampa que ya está anotada en el repositorio.
    await prisma.driver.updateMany({ where: { status: 'ONLINE' }, data: { status: 'OFFLINE' } });

    const conductor = await prisma.driver.create({
      data: { phone: telColombiano(), name: 'Taxista E2E', status: 'ONLINE', isVerified: true, acceptsTrips: true },
    });
    await prisma.vehicle.create({
      data: {
        driverId: conductor.id, type: 'TAXI', isActive: true, brand: 'Prueba', model: 'X',
        plate: `W${Math.floor(1000 + Math.random() * 8999)}`, year: 2020, color: 'Amarillo',
      },
    });
    await prisma.$executeRaw`
      UPDATE "drivers"
      SET "geo" = ST_SetSRID(ST_MakePoint(${ORIGEN.lng}, ${ORIGEN.lat}), 4326)::geography,
          "lastSeenAt" = now(), "lastLat" = ${ORIGEN.lat}, "lastLng" = ${ORIGEN.lng}
      WHERE "id" = ${conductor.id}`;

    const viaje = await requestClientTrip(usuario!.id, {
      serviceType: 'taxi',
      originAddress: 'Parque Principal',
      destinationAddress: 'Terminal',
      originLat: ORIGEN.lat,
      originLng: ORIGEN.lng,
      destLat: DESTINO.lat,
      destLng: DESTINO.lng,
    });
    comprobar('el viaje se crea a nombre de esa cuenta', Boolean(viaje?.id));
    // OJO: la columna es `passengerId`, no `userId`. Los scripts de e2e/ no
    // entran en el `typecheck` (tsconfig solo incluye src/), así que un nombre
    // de campo equivocado aquí no lo caza el compilador — solo la ejecución.
    const enBd = await prisma.trip.findUnique({ where: { id: viaje.id } });
    comprobar(
      'y en la base pertenece al usuario de WhatsApp',
      enBd?.passengerId === usuario!.id,
      `passengerId=${enBd?.passengerId} esperado=${usuario!.id}`,
    );

    await reposar(1200);
    comprobar(
      'al conductor le llega la oferta trip_request',
      ofertas.some((o) => o.driverId === conductor.id && o.tipo === 'trip_request'),
      JSON.stringify(ofertas),
    );
  } finally {
    try {
      if (servidor.pid) process.kill(-servidor.pid, 'SIGKILL');
    } catch {
      servidor.kill('SIGKILL');
    }
    await prisma.$disconnect();
  }

  console.log(`\n${fallos === 0 ? '✓ TODO EN VERDE' : `✗ ${fallos} FALLO(S)`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
