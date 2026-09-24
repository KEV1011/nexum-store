/**
 * Pedir un taxi sin salir de WhatsApp, contra PostgreSQL real.
 *
 * Recorre la conversación entera —«hola», ubicación, destino, confirmación— y
 * comprueba que al final existe un viaje de verdad en la base, con el punto de
 * recogida que la persona mandó.
 *
 * Lo que solo se ve ejecutando: que el estado avance de un mensaje al
 * siguiente, que el precio que se cobra sea el que se enseñó, y que el viaje
 * salga al despacho. Cada pieza compila perfectamente mientras la conversación
 * se queda atascada en el segundo paso.
 */
import { prisma } from '../src/lib/prisma';
import { ejecutarPasoDelPedido } from '../src/services/whatsapp-pedido.service';
import { BOTON_CONFIRMAR, BOTON_CANCELAR, BOTON_ACEPTO } from '../src/lib/whatsapp-flujo';
import type { MensajeWhatsapp } from '../src/lib/whatsapp-payload';

let fallos = 0;
let ok = 0;

function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

const TEL = `+5730077${Math.floor(10000 + Math.random() * 89999)}`;
const PAMPLONA = { lat: 7.3754, lng: -72.6486, etiqueta: 'Parque principal' };

let n = 0;
function msg(p: Partial<MensajeWhatsapp>): MensajeWhatsapp {
  n += 1;
  return {
    waMessageId: `wamid.test.${Date.now()}.${n}`,
    telefono: TEL,
    tipo: 'text',
    texto: '',
    ubicacion: null,
    botonId: null,
    nombre: 'Ana',
    enviadoEn: new Date(),
    ...p,
  };
}

async function estado(): Promise<string> {
  const c = await prisma.whatsappConversation.findUnique({ where: { phone: TEL } });
  return c?.state ?? '(sin conversación)';
}

async function main() {
  const ahora = new Date();

  // Un conductor cerca, verificado y en línea: sin él la cotización sale con
  // todas las categorías apagadas y no se puede confirmar nada.
  const driver = await prisma.driver.create({
    data: {
      name: 'Pedro Taxi', phone: `+5730088${Math.floor(10000 + Math.random() * 89999)}`,
      isVerified: true, status: 'ONLINE',
      lastLat: PAMPLONA.lat, lastLng: PAMPLONA.lng, lastSeenAt: new Date(),
    },
  });

  // ── 0. El primer contacto pide los términos ─────────────────────────────
  console.log('\n[0] Primer contacto de alguien que nunca ha usado ZIPA');
  const r0 = await ejecutarPasoDelPedido(msg({ texto: 'hola' }), ahora);
  console.log(`    → ${r0.outcome}`);
  check(r0.outcome === 'respondido:terminos-pedidos', 'se le piden los términos ANTES de nada', r0.outcome);
  check(/legal\/terminos/.test(r0.cuerpo), 'con el enlace al texto real y versionado');

  const sinAceptar = await ejecutarPasoDelPedido(msg({ tipo: 'location', ubicacion: PAMPLONA }), ahora);
  check(
    sinAceptar.outcome === 'respondido:terminos-pedidos',
    'y sin aceptarlos no se puede avanzar, ni mandando la ubicación',
    sinAceptar.outcome,
  );

  // ── 1. Acepta → botón de ubicación ──────────────────────────────────────
  console.log('\n[1] Toca «Acepto»');
  const r1 = await ejecutarPasoDelPedido(
    msg({ tipo: 'interactive', botonId: BOTON_ACEPTO }), ahora,
  );
  console.log(`    → ${r1.outcome}`);
  console.log(`    → ${r1.outcome}`);
  check(r1.pedirUbicacion === true, 'se le manda el botón nativo de ubicación, sin un turno de más');

  const u0 = await prisma.user.findFirst({ where: { phone: TEL } });
  const constancia = await prisma.legalConsent.count({ where: { subjectKind: 'user', subjectId: u0?.id ?? '' } });
  check(constancia >= 2, 'queda constancia de términos Y privacidad', constancia);

  const repetido = await ejecutarPasoDelPedido(msg({ texto: 'hola' }), ahora);
  check(
    repetido.outcome !== 'respondido:terminos-pedidos',
    'y no se le vuelven a pedir: sería un mensaje cobrado por viaje',
    repetido.outcome,
  );
  check(await estado() === 'esperando_origen', 'la conversación queda esperando el punto', await estado());

  // ── 2. Manda su ubicación → se le pregunta a dónde va ───────────────────
  console.log('\n[2] Manda su ubicación');
  const r2 = await ejecutarPasoDelPedido(msg({ tipo: 'location', ubicacion: PAMPLONA }), ahora);
  console.log(`    → ${r2.outcome}`);
  check(/a dónde vas/i.test(r2.cuerpo), 'se le pregunta el destino', r2.cuerpo.slice(0, 40));
  check(await estado() === 'esperando_destino', 'queda esperando el destino', await estado());

  const guardado = await prisma.whatsappConversation.findUnique({ where: { phone: TEL } });
  check(guardado?.originLat === PAMPLONA.lat, 'el punto de recogida queda guardado', guardado?.originLat);

  // ── 3. Un «ok» no es una dirección ──────────────────────────────────────
  console.log('\n[3] Responde «ok»');
  const r3 = await ejecutarPasoDelPedido(msg({ texto: 'ok' }), ahora);
  check(r3.outcome === 'respondido:repetido', 'no se cotiza un trayecto inventado', r3.outcome);
  check(await estado() === 'esperando_destino', 'se sigue esperando el destino', await estado());

  // ── 4. El destino → cotización con botones ──────────────────────────────
  console.log('\n[4] Escribe el destino');
  const r4 = await ejecutarPasoDelPedido(msg({ texto: 'Terminal de transporte de Pamplona' }), ahora);
  console.log(`    → ${r4.outcome}`);

  // Sin llave de Google no hay geocodificación, y eso NO es un fallo del flujo:
  // el sistema lo dice en vez de inventar un destino.
  const hayGeo = Boolean(process.env['GOOGLE_MAPS_API_KEY']);
  if (!hayGeo) {
    check(
      r4.outcome === 'respondido:destino-no-resuelto',
      'sin llave de Google se dice que no se encontró, en vez de inventar un punto',
      r4.outcome,
    );
    console.log('    (sin GOOGLE_MAPS_API_KEY: se cotiza con un punto puesto a mano)');
    // Se pone el destino directamente para poder seguir probando el resto.
    await prisma.whatsappConversation.update({
      where: { phone: TEL },
      data: {
        state: 'esperando_confirmacion',
        destText: 'Terminal de transporte',
        destLat: 7.3689, destLng: -72.6520,
        category: 'TAXI', fare: 8500,
      },
    });
  } else {
    check(r4.outcome === 'respondido:cotizado', 'se cotiza y se enseña el precio', r4.outcome);
    check((r4.botones?.length ?? 0) === 2, 'con botones de confirmar y cancelar', r4.botones);
  }

  const cotizada = await prisma.whatsappConversation.findUnique({ where: { phone: TEL } });
  check(cotizada?.fare != null && cotizada.fare > 0, 'el precio queda SELLADO antes de confirmar', cotizada?.fare);
  const precioMostrado = cotizada!.fare!;

  // ── 5. Confirma → el viaje existe ───────────────────────────────────────
  console.log('\n[5] Toca «Pedir taxi»');
  const r5 = await ejecutarPasoDelPedido(
    msg({ tipo: 'interactive', botonId: BOTON_CONFIRMAR }), ahora,
  );
  console.log(`    → ${r5.outcome}`);
  check(r5.outcome === 'respondido:viaje-pedido', 'se crea el viaje', r5.outcome);

  const conv = await prisma.whatsappConversation.findUnique({ where: { phone: TEL } });
  check(conv?.state === 'viaje_en_curso', 'la conversación queda con el viaje en curso', conv?.state);
  check(conv?.tripId != null, 'y guarda cuál es', conv?.tripId);

  const viaje = await prisma.trip.findUnique({ where: { id: conv!.tripId! } });
  check(viaje != null, 'el viaje existe DE VERDAD en la base');
  check(
    viaje?.originLat === PAMPLONA.lat && viaje?.originLng === PAMPLONA.lng,
    'con el punto de recogida que mandó por WhatsApp, no uno inventado',
    { lat: viaje?.originLat, lng: viaje?.originLng },
  );
  const sellado = Math.round(viaje?.estimatedFare ?? 0);
  console.log(`    cotizado ${precioMostrado} · sellado ${sellado}`);
  // El servidor mide y pone el precio, descartando lo que mande el cliente —
  // esa regla no se toca. Lo que NO puede pasar es que el chat se quede con
  // una cifra y la carrera con otra: el mensaje de confirmación lleva la del
  // viaje, y la conversación se actualiza a esa.
  check(
    r5.cuerpo.includes(sellado.toLocaleString('es-CO')),
    'el mensaje de confirmación dice el precio que quedó SELLADO, no el cotizado',
    { cuerpo: r5.cuerpo, sellado },
  );
  const tras = await prisma.whatsappConversation.findUnique({ where: { phone: TEL } });
  check(tras?.fare === sellado, 'y la conversación se queda con ese mismo', { conv: tras?.fare, sellado });

  // ── 6. Escribir con el viaje en curso NO pide otro ──────────────────────
  console.log('\n[6] Vuelve a escribir con el taxi ya pedido');
  const r6 = await ejecutarPasoDelPedido(msg({ texto: 'hola' }), ahora);
  console.log(`    → ${r6.outcome}`);
  check(r6.outcome === 'respondido:viaje-recordado', 'se le recuerda su viaje en vez de empezar otro', r6.outcome);
  check(/mapa/i.test(r6.cuerpo), 'con el enlace del mapa ofrecido, no obligado', r6.cuerpo.slice(-60));

  const cuantos = await prisma.trip.count({ where: { id: { not: conv!.tripId! }, originLat: PAMPLONA.lat } });
  check(cuantos === 0, 'y NO se creó un segundo viaje', cuantos);

  // ── 7. Cancelar deja todo listo para otro pedido ────────────────────────
  console.log('\n[7] Cierra el viaje y cancela la conversación');
  await prisma.trip.update({ where: { id: conv!.tripId! }, data: { status: 'COMPLETED' } });
  const r7 = await ejecutarPasoDelPedido(
    msg({ tipo: 'interactive', botonId: BOTON_CANCELAR }), ahora,
  );
  check(r7.outcome === 'respondido:cancelado', 'cancelar responde', r7.outcome);
  check(await estado() === 'inicio', 'y la conversación vuelve al principio', await estado());

  // ── Limpieza ────────────────────────────────────────────────────────────
  const u = await prisma.user.findFirst({ where: { phone: TEL } });
  await prisma.whatsappConversation.deleteMany({ where: { phone: TEL } });
  await prisma.legalConsent.deleteMany({ where: { subjectKind: 'user', subjectId: u?.id ?? '' } });
  await prisma.magicLink.deleteMany({ where: { userId: u?.id } });
  await prisma.trip.deleteMany({ where: { passengerId: u?.id } });
  if (u) await prisma.user.delete({ where: { id: u.id } });
  await prisma.driver.delete({ where: { id: driver.id } });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Comprobaciones: ${ok} en verde, ${fallos} en rojo`);
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch((e) => { console.error('\nERROR:', e); process.exit(2); });
