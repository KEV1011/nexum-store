/**
 * E2E de los CONTRATOS que usa la página ligera de pedido (`app/pedir`).
 *
 * POR QUÉ ESTE E2E EXISTE
 * -----------------------
 * La página vive en el Next.js y habla con el backend por HTTP y WebSocket.
 * `tsc` comprueba su TypeScript, pero no sabe nada de lo que el servidor
 * devuelve de verdad: si un campo se llama distinto, si el sobre viene sin
 * `data`, o si el WebSocket espera otro nombre de mensaje, la página compila
 * igual y falla en el teléfono del pasajero. Aquí se golpea cada ruta que la
 * página usa y se comprueba **la forma exacta** que lee.
 *
 * Lo que se recorre es el viaje completo de quien llega por un QR:
 * pedir código → entrar → cotizar → pedir → seguir por WebSocket → chatear
 * con el conductor → cancelar.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/pagina-pedir.ts
 */
import { spawn, type ChildProcess } from 'child_process';
import WebSocket from 'ws';
import { prisma } from '../src/lib/prisma';

const PUERTO = 3098;
const BASE = `http://localhost:${PUERTO}`;

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const tel = () => `+5730${Math.floor(10000000 + Math.random() * 89999999)}`;

/** El mismo sobre `{success, data}` que desenvuelve `app/pedir/api.ts`. */
async function api<T>(
  path: string,
  opts: { token?: string; method?: string; body?: unknown } = {},
): Promise<{ status: number; data: T | null; error?: string }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean; data?: T; error?: string;
  };
  return { status: res.status, data: json.data ?? null, error: json.error };
}

async function arrancarServidor(): Promise<ChildProcess> {
  // Si el puerto ya está ocupado, la prueba mediría un servidor VIEJO con el
  // código de antes mientras el hijo muere por EADDRINUSE sin que nadie lo lea.
  try {
    const ocupado = await fetch(`${BASE}/health`);
    if (ocupado.ok) {
      throw new Error(
        `el puerto ${PUERTO} ya está ocupado. Mátalo antes (fuser -k ${PUERTO}/tcp).`,
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('ya está ocupado')) throw e;
  }

  // `detached` para matar el GRUPO: `npx` lanza el node de verdad como hijo
  // suyo, y matar solo a `npx` deja el servidor vivo ocupando el puerto.
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
    } catch {
      /* todavía arrancando */
    }
  }
  console.error(registros.join(''));
  throw new Error('el servidor no arrancó');
}

/** Espera un tipo de mensaje del socket, o se rinde. */
function esperar(
  ws: WebSocket,
  tipo: string,
  ms = 8000,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      ws.off('message', onMsg);
      resolve(null);
    }, ms);
    function onMsg(raw: WebSocket.RawData): void {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        return;
      }
      if (m['type'] === tipo) {
        clearTimeout(t);
        ws.off('message', onMsg);
        resolve(m);
      }
    }
    ws.on('message', onMsg);
  });
}

async function main(): Promise<void> {
  console.log('\n═══ E2E: contratos de la página /pedir ═══\n');
  const servidor = await arrancarServidor();

  try {
    // Un conductor cerca del centro de Pamplona, con latido fresco, para que
    // la cotización tenga a quién ofrecer y el viaje se pueda aceptar.
    const conductor = await prisma.driver.create({
      data: {
        phone: tel(), name: 'Conductor Pedir', status: 'ONLINE', isVerified: true,
        lastLat: 7.3754, lastLng: -72.6486, lastSeenAt: new Date(),
      },
    });
    await prisma.vehicle.create({
      data: {
        driverId: conductor.id, type: 'TAXI', brand: 'Chevrolet', model: 'Spark',
        plate: `WEB${Math.floor(100 + Math.random() * 899)}`, color: 'Amarillo',
        year: 2020, isActive: true,
      },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE drivers SET geo = ST_SetSRID(ST_MakePoint($1,$2),4326)::geography WHERE id = $3`,
      -72.6486, 7.3754, conductor.id,
    );

    const telefono = tel();

    // ── 1. Entrar ─────────────────────────────────────────────────────────
    console.log('1. El pasajero entra con su teléfono');
    const envio = await api('/client/auth/send-otp', {
      method: 'POST', body: { phone: telefono },
    });
    comprobar('send-otp acepta el teléfono', envio.status === 200, String(envio.status));

    const login = await api<{ token: string; client: { id: string } }>(
      '/client/auth/verify-otp',
      { method: 'POST', body: { phone: telefono, otp: '123456', acceptedTerms: true } },
    );
    comprobar('verify-otp devuelve token', typeof login.data?.token === 'string', login.error ?? '');
    const token = login.data!.token;
    const clienteId = login.data!.client.id;

    // ── 2. Cotizar ────────────────────────────────────────────────────────
    console.log('\n2. Cotiza el trayecto');
    const q = new URLSearchParams({
      originLat: '7.3754', originLng: '-72.6486',
      destLat: '7.3800', destLng: '-72.6400',
    });
    const cot = await api<{
      distanceKm: number; durationMinutes: number; rutaReal: boolean;
      opciones: Array<{
        categoria: string; nombre: string; fare: number; disponible: boolean;
        availableNearby: number; etaMinutes: number | null; regulada: boolean; cheapest: boolean;
      }>;
    }>(`/client/trips/options?${q}`, { token });

    comprobar('options responde', cot.status === 200, cot.error ?? '');
    const ops = cot.data?.opciones ?? [];
    comprobar('trae categorías', ops.length > 0, String(ops.length));
    // La página lee EXACTAMENTE estos campos para pintar cada tarjeta.
    const primera = ops[0];
    comprobar(
      'cada categoría trae los campos que pinta la página',
      primera !== undefined &&
        typeof primera.categoria === 'string' &&
        typeof primera.nombre === 'string' &&
        typeof primera.fare === 'number' &&
        typeof primera.disponible === 'boolean' &&
        typeof primera.availableNearby === 'number' &&
        typeof primera.regulada === 'boolean' &&
        typeof primera.cheapest === 'boolean',
      JSON.stringify(primera),
    );
    comprobar(
      'y el trayecto viene medido por el servidor',
      typeof cot.data?.distanceKm === 'number' && typeof cot.data?.durationMinutes === 'number',
    );
    const disponible = ops.find((o) => o.disponible);
    comprobar('hay al menos una categoría disponible', disponible !== undefined);

    // ── 3. Pedir ──────────────────────────────────────────────────────────
    console.log('\n3. Pide el viaje');
    const pedido = await api<{ id: string; status: string; estimatedFare: number }>(
      '/client/trips/request',
      {
        token, method: 'POST',
        body: {
          serviceType: disponible?.categoria ?? 'taxi',
          originAddress: 'Parque Águeda Gallardo',
          destinationAddress: 'Terminal de Pamplona',
          originLat: 7.3754, originLng: -72.6486,
          destLat: 7.38, destLng: -72.64,
          estimatedFare: disponible?.fare ?? 0,
          distanceKm: cot.data?.distanceKm ?? 0,
          etaMinutes: cot.data?.durationMinutes ?? 0,
          paymentMethod: 'efectivo',
        },
      },
    );
    comprobar('el viaje se crea', pedido.status === 201, `${pedido.status} ${pedido.error ?? ''}`);
    const viajeId = pedido.data!.id;
    comprobar('con id y estado', typeof viajeId === 'string' && typeof pedido.data?.status === 'string');
    // El precio lo pone el SERVIDOR: la página manda lo cotizado solo como
    // constancia, y si el servidor confiara en ese número se podría pedir un
    // taxi por un peso desde la consola del navegador.
    comprobar(
      'y el precio lo pone el servidor, no el navegador',
      (pedido.data?.estimatedFare ?? 0) > 1000,
      String(pedido.data?.estimatedFare),
    );

    // ── 4. Volver al viaje ────────────────────────────────────────────────
    console.log('\n4. Recargar la página no pierde el viaje');
    const activo = await api<{ id: string } | null>('/client/trips/active', { token });
    comprobar('trips/active devuelve el viaje en curso', activo.data?.id === viajeId);

    // ── 5. WebSocket: estado y chat ───────────────────────────────────────
    console.log('\n5. Seguimiento y chat por WebSocket');
    // El conductor acepta primero: sin conductor no hay con quién chatear.
    await prisma.trip.update({
      where: { id: viajeId },
      data: { driverId: conductor.id, status: 'ACCEPTED' },
    });

    const ws = new WebSocket(`ws://localhost:${PUERTO}`);
    await new Promise<void>((r, rej) => {
      ws.once('open', () => r());
      ws.once('error', rej);
    });

    ws.send(JSON.stringify({ type: 'client_auth', token }));
    const authOk = await esperar(ws, 'client_auth_ok');
    comprobar('client_auth autentica la conexión', authOk !== null);

    ws.send(JSON.stringify({ type: 'subscribe_trip', tripId: viajeId }));
    const upd = await esperar(ws, 'trip_update');
    comprobar('subscribe_trip devuelve trip_update con el viaje', Boolean(upd?.['trip']));

    ws.send(JSON.stringify({ type: 'subscribe_trip_chat', tripId: viajeId }));
    const hist = await esperar(ws, 'trip_chat_history');
    comprobar('subscribe_trip_chat devuelve el historial', Array.isArray(hist?.['messages']));

    ws.send(JSON.stringify({ type: 'trip_chat_send', tripId: viajeId, text: 'Estoy en la esquina' }));
    const eco = await esperar(ws, 'trip_chat_message');
    const m = eco?.['message'] as Record<string, unknown> | undefined;
    comprobar(
      'el mensaje vuelve con la forma que pinta el chat',
      typeof m?.['id'] === 'string' &&
        m?.['senderRole'] === 'client' &&
        m?.['body'] === 'Estoy en la esquina' &&
        typeof m?.['sentAt'] === 'string',
      JSON.stringify(m),
    );
    comprobar(
      'y queda guardado, no solo en pantalla',
      (await prisma.tripMessage.count({ where: { tripId: viajeId } })) === 1,
    );

    // Un viaje AJENO no se puede espiar aunque se sepa el id: la página manda
    // el id en claro por el socket, así que esta guarda es lo único que separa
    // a un curioso del chat de otra persona.
    const otroCliente = await prisma.user.create({ data: { name: 'Ajeno', phone: tel() } });
    const ajeno = await prisma.trip.create({
      data: {
        requestRef: `AJE-${Date.now()}`, passengerId: otroCliente.id,
        serviceType: 'TAXI', originAddress: 'A', destAddress: 'B',
        estimatedFare: 8000, distanceKm: 2, etaMinutes: 8, status: 'SEARCHING',
        originLat: 7.37, originLng: -72.64, destLat: 7.38, destLng: -72.65,
      },
    });
    ws.send(JSON.stringify({ type: 'subscribe_trip_chat', tripId: ajeno.id }));
    const negado = await esperar(ws, 'error', 4000);
    comprobar('el chat de un viaje ajeno se rechaza', negado !== null, 'no llegó el error');

    ws.close();

    // ── 6. Cancelar ───────────────────────────────────────────────────────
    console.log('\n6. Cancelar desde la página');
    const cancelado = await api(`/client/trips/${viajeId}/cancel`, { token, method: 'POST' });
    comprobar('la ruta de cancelar responde', cancelado.status === 200, String(cancelado.status));
    const trasCancelar = await prisma.trip.findUnique({ where: { id: viajeId } });
    comprobar('y el viaje queda cancelado', trasCancelar?.status === 'CANCELLED', String(trasCancelar?.status));

    // ── 7. Sesión inválida ────────────────────────────────────────────────
    console.log('\n7. Una sesión vencida se distingue de un fallo cualquiera');
    const sinSesion = await api('/client/trips/active', { token: 'token-basura' });
    comprobar(
      'con token inválido responde 401 (la página borra la sesión y vuelve al login)',
      sinSesion.status === 401,
      String(sinSesion.status),
    );

    await prisma.user.delete({ where: { id: otroCliente.id } }).catch(() => undefined);
    void clienteId;
  } finally {
    if (servidor.pid) {
      try {
        process.kill(-servidor.pid, 'SIGKILL');
      } catch {
        servidor.kill('SIGKILL');
      }
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
