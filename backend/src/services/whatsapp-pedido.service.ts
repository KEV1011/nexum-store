/**
 * Ejecuta el pedido de taxi dentro de la conversación de WhatsApp.
 *
 * Las REGLAS de qué paso toca viven en `lib/whatsapp-flujo.ts`, puras y
 * probadas. Aquí está lo que tiene efectos: leer y escribir la conversación,
 * resolver la dirección, cotizar, crear el viaje y mandar el mensaje.
 *
 * DOS COSAS QUE NO SE NEGOCIAN
 * ----------------------------
 *  · EL PRECIO LO PONE EL SERVIDOR, siempre. El backend mide el trayecto y
 *    calcula, y descarta lo que le mande el cliente — esa regla no se toca,
 *    porque es lo que impide que alguien pida una carrera de mil pesos.
 *
 *    Lo que sí se hace aquí es no CONTRADECIRSE: el precio de la cotización se
 *    guarda, y el mensaje que confirma el pedido lleva el que quedó sellado en
 *    el viaje. Si los dos discrepan —pasó un minuto, cambió la demanda—, gana
 *    el del viaje y se dice, en vez de dejar al pasajero con una cifra en el
 *    chat y otra en la carrera.
 *  · Sin punto real no hay viaje. Si la dirección no se resuelve, se dice y se
 *    vuelve a preguntar; nunca se inventa un destino para poder seguir.
 */
import { prisma } from '../lib/prisma';
import {
  siguientePaso,
  estadoTras,
  BOTON_CONFIRMAR,
  BOTON_CANCELAR,
  type EstadoConversacion,
  type Paso,
} from '../lib/whatsapp-flujo';
import type { MensajeWhatsapp } from '../lib/whatsapp-payload';
import { geocodeAddress } from './geo.service';
import { getTripOptions } from './trip-options.service';
import { requestClientTrip, getActiveClientTrip } from './client.service';
import { usuarioParaTelefonoVerificado, emitirEnlaceMagico } from './enlace-magico.service';
import { construirEnlace } from '../lib/enlace-magico';

/** Lo que hay que mandarle, ya resuelto. */
export interface Respuesta {
  /** Texto del mensaje. */
  cuerpo: string;
  /** Botones, si el paso los necesita. */
  botones?: Array<{ id: string; titulo: string }>;
  /** true = mandar el botón NATIVO de ubicación en vez de texto. */
  pedirUbicacion?: boolean;
  /** Para el registro de por qué se respondió esto. */
  outcome: string;
}

const money = (n: number): string => `$${Math.round(n).toLocaleString('es-CO')}`;

// ─── La conversación ──────────────────────────────────────────────────────────

interface Conversacion {
  state: EstadoConversacion;
  originLat: number | null;
  originLng: number | null;
  originLabel: string | null;
  destText: string | null;
  destLat: number | null;
  destLng: number | null;
  category: string | null;
  fare: number | null;
  tripId: string | null;
  updatedAt: Date;
}

async function _cargar(phone: string): Promise<Conversacion | null> {
  const c = await prisma.whatsappConversation.findUnique({ where: { phone } });
  return c ? ({ ...c, state: c.state as EstadoConversacion } as Conversacion) : null;
}

async function _guardar(phone: string, datos: Partial<Conversacion>): Promise<void> {
  const limpio = {
    state: datos.state,
    originLat: datos.originLat ?? null,
    originLng: datos.originLng ?? null,
    originLabel: datos.originLabel ?? null,
    destText: datos.destText ?? null,
    destLat: datos.destLat ?? null,
    destLng: datos.destLng ?? null,
    category: datos.category ?? null,
    fare: datos.fare ?? null,
    tripId: datos.tripId ?? null,
  };
  await prisma.whatsappConversation.upsert({
    where: { phone },
    create: { phone, ...limpio, state: limpio.state ?? 'inicio' },
    update: limpio,
  });
}

// ─── Los mensajes ─────────────────────────────────────────────────────────────

function textoPedirOrigen(nombre: string | null): string {
  const saludo = nombre ? `Hola ${nombre.split(' ')[0]}. ` : 'Hola. ';
  return `${saludo}Para pedirte un taxi, tócame el botón y mándame dónde estás.`;
}

function textoPedirDestino(): string {
  return (
    'Listo, ya sé dónde estás.\n\n' +
    '¿A dónde vas? Escríbeme la dirección o el sitio.\n' +
    'Por ejemplo: *Calle 5 # 3-40* o *Terminal de transporte*.'
  );
}

function textoNoEntiendoDestino(): string {
  return (
    'No encontré esa dirección. Escríbemela con más detalle —calle, número y ' +
    'barrio— o mándame el nombre de un sitio conocido.'
  );
}

function textoCotizacion(destino: string, fare: number, minutos: number, etiqueta: string): string {
  return (
    `*${etiqueta}* — ${money(fare)}\n` +
    `Hacia: ${destino}\n` +
    `Unos ${minutos} min de viaje.\n\n` +
    'Se paga en efectivo al conductor.'
  );
}

function textoBuscando(fare: number, cotizado: number | null): string {
  const base = `Pedido por *${money(fare)}*. Estoy buscándote un conductor, te aviso en cuanto uno acepte.`;
  // Solo se menciona el cambio si lo hubo. Decir «el precio sigue siendo el
  // mismo» en cada pedido sembraría una duda que no existía.
  if (cotizado != null && Math.abs(cotizado - fare) >= 50) {
    return `${base}\n\n_El precio quedó en ${money(fare)} al medir el trayecto._`;
  }
  return base;
}

function textoCancelado(): string {
  return 'Listo, cancelado. Cuando quieras pedir otro, escríbeme.';
}

function textoSinConductores(): string {
  return (
    'No hay conductores disponibles cerca en este momento. ' +
    'Vuelve a escribirme en unos minutos y lo intentamos de nuevo.'
  );
}

// ─── El ejecutor ──────────────────────────────────────────────────────────────

/**
 * Decide y ejecuta el siguiente paso de la conversación.
 *
 * Devuelve lo que hay que mandar; el envío lo hace quien llama, que es quien
 * lleva el registro y el tope de mensajes.
 */
export async function ejecutarPasoDelPedido(
  m: MensajeWhatsapp,
  ahora: Date,
): Promise<Respuesta> {
  const conv = await _cargar(m.telefono);

  // La verdad sobre si tiene viaje la tiene la PLATAFORMA, no la conversación:
  // pudo pedirlo desde la app, o el viaje pudo cerrarse por otro camino.
  const usuario = await usuarioParaTelefonoVerificado(m.telefono, m.nombre);
  const activo = await getActiveClientTrip(usuario.id).catch(() => null);

  const minutosDesdeUltimo = conv
    ? Math.max(0, (ahora.getTime() - conv.updatedAt.getTime()) / 60000)
    : Number.POSITIVE_INFINITY;

  const paso = siguientePaso({
    estado: conv?.state ?? 'inicio',
    minutosDesdeUltimo,
    ubicacion: m.ubicacion,
    texto: m.texto,
    botonId: m.botonId,
    tieneViajeActivo: activo != null,
  });

  return _ejecutar(paso, m, conv, usuario.id, activo);
}

async function _ejecutar(
  paso: Paso,
  m: MensajeWhatsapp,
  conv: Conversacion | null,
  userId: string,
  activo: Awaited<ReturnType<typeof getActiveClientTrip>>,
): Promise<Respuesta> {
  switch (paso.accion) {
    case 'pedir-origen':
      await _guardar(m.telefono, { state: estadoTras(paso) });
      return {
        cuerpo: textoPedirOrigen(m.nombre),
        pedirUbicacion: true,
        outcome: 'respondido:ubicacion-pedida',
      };

    case 'pedir-destino':
      await _guardar(m.telefono, {
        state: estadoTras(paso),
        originLat: paso.origen.lat,
        originLng: paso.origen.lng,
        originLabel: paso.origen.etiqueta,
      });
      return { cuerpo: textoPedirDestino(), outcome: 'respondido:destino-pedido' };

    case 'cotizar':
      return _cotizar(paso.destinoTexto, m, conv, userId);

    case 'pedir-viaje':
      return _crearViaje(m, conv, userId);

    case 'cancelar':
      await _guardar(m.telefono, { state: 'inicio' });
      return { cuerpo: textoCancelado(), outcome: 'respondido:cancelado' };

    case 'recordar-viaje':
      return _recordar(m, activo, userId);

    case 'repetir':
      return paso.estado === 'esperando_confirmacion'
        ? {
            cuerpo: 'Dime si lo pido o lo dejamos.',
            botones: [
              { id: BOTON_CONFIRMAR, titulo: 'Pedir taxi' },
              { id: BOTON_CANCELAR, titulo: 'Cancelar' },
            ],
            outcome: 'respondido:repetido',
          }
        : { cuerpo: textoPedirDestino(), outcome: 'respondido:repetido' };
  }
}

/** Resuelve la dirección, mide el trayecto y enseña el precio. */
async function _cotizar(
  destinoTexto: string,
  m: MensajeWhatsapp,
  conv: Conversacion | null,
  userId: string,
): Promise<Respuesta> {
  if (conv?.originLat == null || conv.originLng == null) {
    // Sin origen no hay nada que medir. Puede pasar si la conversación se
    // limpió entre medias.
    await _guardar(m.telefono, { state: 'esperando_origen' });
    return {
      cuerpo: textoPedirOrigen(m.nombre),
      pedirUbicacion: true,
      outcome: 'respondido:ubicacion-pedida',
    };
  }

  const punto = await geocodeAddress(destinoTexto).catch(() => null);
  if (!punto) {
    // No se inventa un destino para poder seguir: el taxi iría a otro sitio y
    // el pasajero pagaría un trayecto que no pidió.
    await _guardar(m.telefono, { ...conv, state: 'esperando_destino', destText: null });
    return { cuerpo: textoNoEntiendoDestino(), outcome: 'respondido:destino-no-resuelto' };
  }

  const opciones = await getTripOptions(
    conv.originLat, conv.originLng, punto.lat, punto.lng, [], userId,
  );
  const elegida = opciones.opciones.find((o) => o.disponible) ?? opciones.opciones[0];
  if (!elegida) {
    return { cuerpo: textoSinConductores(), outcome: 'respondido:sin-opciones' };
  }

  await _guardar(m.telefono, {
    ...conv,
    state: 'esperando_confirmacion',
    destText: destinoTexto,
    destLat: punto.lat,
    destLng: punto.lng,
    category: elegida.categoria,
    // El precio se SELLA aquí: es el que se va a cobrar.
    fare: Math.round(elegida.fare),
  });

  return {
    cuerpo: textoCotizacion(
      destinoTexto,
      elegida.fare,
      opciones.durationMinutes ?? elegida.etaMinutes ?? 0,
      elegida.nombre,
    ),
    botones: [
      { id: BOTON_CONFIRMAR, titulo: 'Pedir taxi' },
      { id: BOTON_CANCELAR, titulo: 'Cancelar' },
    ],
    outcome: 'respondido:cotizado',
  };
}

/** Crea el viaje con lo que la persona vio y aceptó. */
async function _crearViaje(
  m: MensajeWhatsapp,
  conv: Conversacion | null,
  userId: string,
): Promise<Respuesta> {
  if (
    conv?.originLat == null || conv.originLng == null ||
    conv.destLat == null || conv.destLng == null || !conv.category
  ) {
    await _guardar(m.telefono, { state: 'esperando_origen' });
    return {
      cuerpo: textoPedirOrigen(m.nombre),
      pedirUbicacion: true,
      outcome: 'respondido:ubicacion-pedida',
    };
  }

  const viaje = await requestClientTrip(userId, {
    serviceType: conv.category.toLowerCase() as never,
    originAddress: conv.originLabel ?? 'Mi ubicación',
    destinationAddress: conv.destText ?? 'Destino',
    // El servidor vuelve a medir y a poner el precio: lo que va aquí es lo que
    // vio el pasajero, y el backend ya descarta lo que manda el cliente.
    estimatedFare: conv.fare ?? 0,
    distanceKm: 0,
    etaMinutes: 0,
    originLat: conv.originLat,
    originLng: conv.originLng,
    destLat: conv.destLat,
    destLng: conv.destLng,
    paymentMethod: 'efectivo',
  });

  // El precio que vale es el que el servidor selló en el viaje, no el que se
  // cotizó: son dos mediciones y pueden no coincidir.
  const cobrado = Math.round(viaje.estimatedFare ?? conv.fare ?? 0);
  await _guardar(m.telefono, {
    ...conv, state: 'viaje_en_curso', tripId: viaje.id, fare: cobrado,
  });
  return {
    cuerpo: textoBuscando(cobrado, conv.fare),
    outcome: 'respondido:viaje-pedido',
  };
}

/** Ya tiene taxi: se le dice en qué va, con el enlace del mapa como extra. */
async function _recordar(
  m: MensajeWhatsapp,
  activo: Awaited<ReturnType<typeof getActiveClientTrip>>,
  userId: string,
): Promise<Respuesta> {
  if (!activo) {
    await _guardar(m.telefono, { state: 'inicio' });
    return {
      cuerpo: textoPedirOrigen(m.nombre),
      pedirUbicacion: true,
      outcome: 'respondido:ubicacion-pedida',
    };
  }

  const partes: string[] = [];
  if (activo.driverName) {
    partes.push(`Tu conductor es *${activo.driverName}*.`);
    if (activo.driverVehicle) partes.push(activo.driverVehicle);
  } else {
    partes.push('Todavía estoy buscándote conductor.');
  }

  // El enlace va DENTRO de un mensaje que ya salía: cuesta cero mensajes extra
  // y le da el mapa a quien lo quiera, sin obligar a nadie a abrirlo.
  const { codigo } = await emitirEnlaceMagico(userId, 'whatsapp', new Date(), null);
  const { CLIENT_WEB_URL } = await import('./whatsapp.service');
  partes.push(`\nVer en el mapa: ${construirEnlace(CLIENT_WEB_URL, codigo)}`);

  return { cuerpo: partes.join('\n'), outcome: 'respondido:viaje-recordado' };
}

/** Deja la conversación lista para un pedido nuevo. Lo llama el cierre del viaje. */
export async function cerrarConversacionDeViaje(tripId: string): Promise<void> {
  await prisma.whatsappConversation
    .updateMany({ where: { tripId }, data: { state: 'inicio', tripId: null } })
    .catch(() => undefined);
}

// ─── Avisos del viaje, de vuelta al chat ──────────────────────────────────────

/**
 * Le cuenta al pasajero cómo va su viaje, en el mismo chat donde lo pidió.
 *
 * Solo a quien pidió POR WHATSAPP: la conversación guarda el `tripId`, así que
 * un viaje pedido desde la app no manda nada y no se gasta un mensaje.
 *
 * Al terminar o cancelarse, la conversación se cierra sola. Si no, el siguiente
 * «hola» respondería «ya tienes un viaje» sobre uno que acabó ayer.
 */
export async function avisarViajePorWhatsapp(
  tripId: string,
  titulo: string,
  cuerpo: string,
): Promise<void> {
  try {
    const conv = await prisma.whatsappConversation.findFirst({
      where: { tripId },
      select: { phone: true },
    });
    if (!conv) return;

    const { enviarTexto } = await import('./whatsapp.service');
    await enviarTexto(conv.phone, `*${titulo}*\n${cuerpo}`);

    // Estos dos cierran el viaje; los demás son de paso.
    if (/complet|termin|cancel|no encontr/i.test(`${titulo} ${cuerpo}`)) {
      await cerrarConversacionDeViaje(tripId);
    }
  } catch (e) {
    // Un fallo mandando el aviso no puede tumbar la transición del viaje.
    console.error('[WhatsApp] no se pudo avisar del viaje:', e instanceof Error ? e.message : e);
  }
}
