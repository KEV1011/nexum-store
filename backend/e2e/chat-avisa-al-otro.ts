/**
 * «El chat solo le llega a quien tiene el chat abierto».
 *
 * El mandadero escribe desde la tienda «no hay de esa marca, ¿cuál llevo?» y
 * el cliente, que está en el seguimiento del mandado (o con el teléfono en el
 * bolsillo), no se enteraba: el mensaje solo se repartía a los sockets que
 * estaban DENTRO de la pantalla del chat. Ni contador de no leídos ni
 * notificación.
 *
 * Se prueba con el servidor de sockets REAL (la decisión de «¿ya lo está
 * viendo?» vive en el manejador de sockets) contra PostgreSQL:
 *
 *   1. Mandado: el mandadero escribe → el cliente, sin el chat abierto, recibe
 *      el mensaje por su socket y una notificación con el texto.
 *   2. Ráfaga: un segundo mensaje enseguida llega por el socket pero NO vuelve
 *      a sonar el teléfono.
 *   3. Con el chat ABIERTO no hay notificación ni mensaje repetido.
 *   4. Envío (viaje ENVIOS): el cliente responde → el repartidor recibe el
 *      mensaje y la notificación con «El cliente te escribió».
 *   5. Quien no participa no recibe nada.
 */
import http from 'http';
import jwt from 'jsonwebtoken';
import WebSocket, { WebSocketServer } from 'ws';
import { prisma } from '../src/lib/prisma';
import { JWT_SECRET } from '../src/config/constants';
import { exigirBaseLocal } from './_base-de-pruebas';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  if (ok) console.log(`  ✓ ${nombre}`);
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
}
const tel = (p: string) => `+573${p}${String(Date.now()).slice(-7)}`;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Conexion {
  recibidos: Array<Record<string, unknown>>;
  enviar: (m: Record<string, unknown>) => void;
  de: (type: string) => Array<Record<string, unknown>>;
  cerrar: () => Promise<void>;
}

async function abrir(puerto: number, auth: Record<string, unknown>, ok: string): Promise<Conexion> {
  const ws = new WebSocket(`ws://127.0.0.1:${puerto}`);
  const recibidos: Array<Record<string, unknown>> = [];
  ws.on('message', (d) => { recibidos.push(JSON.parse(d.toString())); });
  await new Promise<void>((bien, mal) => { ws.once('open', () => bien()); ws.once('error', mal); });
  ws.send(JSON.stringify(auth));
  for (let i = 0; i < 40 && !recibidos.some((m) => m['type'] === ok); i++) await esperar(50);
  await esperar(200);
  return {
    recibidos,
    enviar: (m) => ws.send(JSON.stringify(m)),
    de: (type) => recibidos.filter((m) => m['type'] === type),
    cerrar: () => new Promise<void>((bien) => { ws.once('close', () => bien()); ws.close(); }),
  };
}

/** Las notificaciones que el servicio de push (en modo prueba) dice que mandó. */
const avisos: string[] = [];
const logOriginal = console.log;
console.log = (...args: unknown[]) => {
  const linea = args.map(String).join(' ');
  if (linea.startsWith('[Push:mock]')) avisos.push(linea);
  logOriginal(...args);
};
const avisosA = (ref: string) => avisos.filter((a) => a.includes(ref) && a.includes('type=chat_message'));

async function main(): Promise<void> {
  exigirBaseLocal('los chats de prueba');
  const { setupWebSocket } = await import('../src/websocket/ws.handler');

  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  setupWebSocket(wss);
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  const puerto = (server.address() as { port: number }).port;

  const m = `e2echat-${Date.now()}`;
  const cliente = await prisma.user.create({ data: { name: 'Cliente Chat', phone: tel('31'), fcmToken: `fcm-c-${m}` } });
  const ajeno = await prisma.user.create({ data: { name: 'Ajeno', phone: tel('32'), fcmToken: `fcm-a-${m}` } });
  const conductor = await prisma.driver.create({
    data: {
      name: 'Mandadero', phone: tel('33'), documentType: 'CC', documentNumber: `95${Date.now() % 1e7}`,
      isVerified: true, status: 'ON_TRIP', fcmToken: `fcm-d-${m}`,
    },
  });
  const mandado = await prisma.errand.create({
    data: {
      requestRef: `ER-${m}`, userId: cliente.id, driverId: conductor.id, category: 'PHARMACY',
      description: 'Acetaminofén', pickupAddress: 'Droguería', dropoffAddress: 'Casa', status: 'ACCEPTED',
    },
  });
  const envio = await prisma.trip.create({
    data: {
      requestRef: `TR-${m}`, passengerId: cliente.id, driverId: conductor.id, serviceType: 'ENVIOS',
      status: 'ACCEPTED', originAddress: 'A', destAddress: 'B', estimatedFare: 6000,
      originLat: 7.37, originLng: -72.64, destLat: 7.38, destLng: -72.65,
    } as never,
  });

  const limpiar = async () => {
    await prisma.tripMessage.deleteMany({ where: { tripId: { in: [mandado.id, envio.id] } } });
    await prisma.errand.deleteMany({ where: { id: mandado.id } });
    await prisma.trip.deleteMany({ where: { id: envio.id } });
    await prisma.driver.deleteMany({ where: { id: conductor.id } });
    await prisma.user.deleteMany({ where: { id: { in: [cliente.id, ajeno.id] } } });
  };

  const tokenCliente = (id: string, phone: string | null) =>
    jwt.sign({ clientId: id, phone, role: 'client' }, JWT_SECRET, { expiresIn: '1h' });

  try {
    const wsCliente = await abrir(puerto, { type: 'client_auth', token: tokenCliente(cliente.id, cliente.phone) }, 'client_auth_ok');
    const wsAjeno = await abrir(puerto, { type: 'client_auth', token: tokenCliente(ajeno.id, ajeno.phone) }, 'client_auth_ok');
    const wsConductor = await abrir(puerto, {
      type: 'auth', token: jwt.sign({ driverId: conductor.id, phone: conductor.phone }, JWT_SECRET, { expiresIn: '1h' }),
      workMode: 'pasajero',
    }, 'auth_ok');

    console.log('\n[1] Mandado: el mandadero escribe y el cliente NO tiene el chat abierto');
    wsConductor.enviar({ type: 'subscribe_trip_chat', tripId: mandado.id });
    await esperar(300);
    wsConductor.enviar({ type: 'trip_chat_send', tripId: mandado.id, text: 'No hay de esa marca, ¿cuál llevo?' });
    await esperar(700);
    const llegados = wsCliente.de('trip_chat_message');
    comprobar('el cliente recibe el mensaje por su socket', llegados.length === 1,
      `llegaron ${llegados.length}`);
    const cuerpo = (llegados[0]?.['message'] ?? {}) as Record<string, unknown>;
    comprobar('es el mensaje del mandado, del mandadero',
      cuerpo['tripId'] === mandado.id && cuerpo['senderRole'] === 'driver');
    const avisoCliente = avisosA(`user=${cliente.id}`);
    comprobar('y le suena el teléfono', avisoCliente.length === 1, `avisos ${avisoCliente.length}`);
    comprobar('con quién le escribió', (avisoCliente[0] ?? '').includes('Tu mensajero te escribió'));
    comprobar('al mandadero no le avisa de su propio mensaje', avisosA(`driver=${conductor.id}`).length === 0);
    comprobar('al ajeno no le llega nada', wsAjeno.de('trip_chat_message').length === 0
      && avisosA(`user=${ajeno.id}`).length === 0);

    console.log('\n[2] Ráfaga: el segundo mensaje no vuelve a sonar');
    wsConductor.enviar({ type: 'trip_chat_send', tripId: mandado.id, text: 'Hay de la genérica' });
    await esperar(700);
    comprobar('el segundo también llega por el socket', wsCliente.de('trip_chat_message').length === 2);
    comprobar('pero no vuelve a sonar', avisosA(`user=${cliente.id}`).length === 1);

    console.log('\n[3] Con el chat abierto, ni aviso ni mensaje repetido');
    wsCliente.enviar({ type: 'subscribe_trip_chat', tripId: envio.id });
    await esperar(400);
    const antes = wsCliente.de('trip_chat_message').length;
    const avisosAntes = avisosA(`user=${cliente.id}`).length;
    wsConductor.enviar({ type: 'trip_chat_send', tripId: envio.id, text: 'Estoy afuera' });
    await esperar(700);
    comprobar('llega UNA vez (por el chat abierto)', wsCliente.de('trip_chat_message').length === antes + 1,
      `${wsCliente.de('trip_chat_message').length - antes}`);
    comprobar('y no suena el teléfono', avisosA(`user=${cliente.id}`).length === avisosAntes);

    console.log('\n[4] Envío: el cliente responde y el repartidor no tiene el chat abierto');
    wsConductor.enviar({ type: 'unsubscribe_trip_chat', tripId: mandado.id });
    await esperar(200);
    const antesC = wsConductor.de('trip_chat_message').length;
    wsCliente.enviar({ type: 'trip_chat_send', tripId: envio.id, text: 'Ya bajo' });
    await esperar(700);
    comprobar('el repartidor recibe el mensaje', wsConductor.de('trip_chat_message').length === antesC + 1);
    const avisoConductor = avisosA(`driver=${conductor.id}`);
    comprobar('y le suena el teléfono con «El cliente te escribió»',
      avisoConductor.length === 1 && avisoConductor[0].includes('El cliente te escribió'),
      avisoConductor.join(' | '));

    console.log('\n[5] El ajeno no puede escribir en el chat de otro');
    wsAjeno.enviar({ type: 'trip_chat_send', tripId: mandado.id, text: 'hola' });
    await esperar(500);
    const guardados = await prisma.tripMessage.count({ where: { tripId: mandado.id, senderId: ajeno.id } });
    comprobar('su mensaje no se guarda', guardados === 0);

    await wsCliente.cerrar();
    await wsAjeno.cerrar();
    await wsConductor.cerrar();
  } finally {
    await limpiar();
    wss.close();
    server.close();
    await prisma.$disconnect();
  }
  logOriginal(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
  process.exit(fallos ? 1 : 0);
}

main().catch(async (e) => {
  logOriginal(e);
  process.exit(1);
});
