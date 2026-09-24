/**
 * Entrada por WhatsApp: el pasajero escribe y recibe un enlace a la app web.
 *
 * POR QUÉ UN ENLACE Y NO UN CHAT COMPLETO
 * ---------------------------------------
 * Un chat conversacional para pedir un taxi son unos siete mensajes salientes
 * por carrera. Desde el 1 de octubre de 2026 Meta cobra los mensajes de
 * servicio pasados los 1.000 gratis al mes por número, así que siete mensajes
 * por viaje agotan la bolsa en unos 140 viajes. Con el enlace son uno o dos: la
 * misma bolsa cubre más de 500 viajes. Y además el pasajero ve el mapa, al
 * conductor y el botón de emergencia, que en un chat no existen.
 *
 * ENCENDIDO POR CONFIGURACIÓN, como el OTP, Wompi, S3 y el push. Sin las
 * variables no hay canal: el webhook se niega y `/health` lo dice. Nunca se
 * cae a un modo «casi funciona».
 *
 * LO QUE ESTE ARCHIVO NO HACE: no crea el viaje. El pasajero lo pide desde la
 * app web con su sesión normal, así que el despacho, las tarifas y los límites
 * son exactamente los de siempre — no hay un segundo camino que mantener.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/prisma';
import {
  mensajesDe,
  motivoParaNoResponder,
  type MensajeWhatsapp,
} from '../lib/whatsapp-payload';
import { textoFueraDeCobertura, esFueraDeCobertura } from '../lib/whatsapp-cobertura';
import { ejecutarPasoDelPedido } from './whatsapp-pedido.service';
import { plazaDeCoordenadas, listMunicipalities } from './municipality.service';

const PHONE_NUMBER_ID = process.env['WHATSAPP_PHONE_NUMBER_ID'] ?? '';
const ACCESS_TOKEN = process.env['WHATSAPP_ACCESS_TOKEN'] ?? '';
const APP_SECRET = process.env['WHATSAPP_APP_SECRET'] ?? '';
const VERIFY_TOKEN = process.env['WHATSAPP_VERIFY_TOKEN'] ?? '';
const GRAPH_VERSION = process.env['WHATSAPP_GRAPH_VERSION'] ?? 'v21.0';

/**
 * Raíz de la app web del cliente (la que se publica en GitHub Pages).
 *
 * Es el destino del enlace, así que un valor equivocado aquí no rompe nada
 * visible en el servidor: simplemente le llega al pasajero un enlace muerto.
 */
export const CLIENT_WEB_URL =
  process.env['CLIENT_WEB_URL'] ?? 'https://kev1011.github.io/nexum-store/cliente';

/** Hay credenciales para MANDAR mensajes. */
export function isWhatsappConfigured(): boolean {
  return Boolean(PHONE_NUMBER_ID && ACCESS_TOKEN);
}

/**
 * Se puede RECIBIR: hace falta el secreto de la app para validar la firma.
 *
 * Se separa de lo anterior a propósito. Sin firma, cualquiera puede mandarnos
 * un POST diciendo «este mensaje viene del +573001234567» y llevarse una sesión
 * de esa persona. El webhook falla cerrado.
 */
export function puedeRecibirWhatsapp(): boolean {
  return Boolean(APP_SECRET && VERIFY_TOKEN);
}

/** Para `/health`: qué modo corre, sin exponer ningún valor. */
export function whatsappMode(): string {
  if (isWhatsappConfigured() && puedeRecibirWhatsapp()) return 'cloud-api';
  if (isWhatsappConfigured() || puedeRecibirWhatsapp()) return 'configuracion-incompleta';
  return 'apagado';
}

// ─── Firma del webhook ────────────────────────────────────────────────────────

/**
 * Comprueba la cabecera `X-Hub-Signature-256` contra el cuerpo CRUDO.
 *
 * Tiene que ser el cuerpo crudo, byte a byte: si se vuelve a serializar el JSON
 * ya parseado, cualquier diferencia de orden o de espacios da una firma
 * distinta y no valida nunca. Por eso la ruta monta un parser `raw` propio.
 */
export function firmaValida(cuerpoCrudo: Buffer, cabecera: string | undefined): boolean {
  if (!APP_SECRET) return false;
  const recibida = (cabecera ?? '').trim();
  if (!recibida.startsWith('sha256=')) return false;

  const esperada = 'sha256=' + createHmac('sha256', APP_SECRET).update(cuerpoCrudo).digest('hex');

  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  // timingSafeEqual exige la misma longitud; comparar antes no filtra nada
  // útil (la longitud del hex es fija y pública).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Handshake de verificación que Meta hace UNA vez al guardar la URL.
 *
 * Devuelve el `challenge` que hay que responder en texto plano, o `null` si el
 * token no coincide.
 */
export function respuestaHandshake(
  modo: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
): string | null {
  if (!VERIFY_TOKEN) return null;
  if (modo !== 'subscribe') return null;
  if (!token || token !== VERIFY_TOKEN) return null;
  return challenge ?? '';
}

// ─── Envío ────────────────────────────────────────────────────────────────────

/**
 * Manda un mensaje ya armado a la API de Meta.
 *
 * Sin credenciales escribe en consola y devuelve `false`, igual que el push:
 * así el flujo entero se puede probar de punta a punta antes de que exista la
 * cuenta de Meta, y queda a la vista que no salió de verdad.
 */
async function _enviar(
  telefono: string,
  cuerpo: Record<string, unknown>,
  resumenMock: string,
): Promise<boolean> {
  if (!isWhatsappConfigured()) {
    console.log(`[WhatsApp:mock] to=${telefono} ${resumenMock.replace(/\n/g, ' ⏎ ')}`);
    return false;
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: telefono, ...cuerpo }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      console.error(`[WhatsApp] envío rechazado (${res.status}): ${detalle.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[WhatsApp] no se pudo enviar:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Manda un mensaje de texto. */
export async function enviarTexto(telefono: string, cuerpo: string): Promise<boolean> {
  return _enviar(
    telefono,
    {
      type: 'text',
      // Sin vista previa: ahorra que el robot de WhatsApp visite el enlace y
      // deja el mensaje más limpio.
      text: { body: cuerpo, preview_url: false },
    },
    `text=${cuerpo}`,
  );
}

/**
 * Manda el botón NATIVO de ubicación (`location_request_message`).
 *
 * Es un tipo de mensaje de Meta, no un botón que nos inventemos: al tocarlo
 * WhatsApp abre su propia pantalla de compartir ubicación, con el mapa y el
 * permiso del sistema. Por eso resuelve la parte que más gente abandona —
 * escribir una dirección en un teclado— sin que tengamos que pedir permisos ni
 * mantener nada.
 *
 * La respuesta del usuario llega por el MISMO webhook como un mensaje de tipo
 * `location`.
 *
 * OJO: solo se puede mandar dentro de las 24 horas siguientes a un mensaje del
 * usuario. Aquí siempre se cumple porque solo se manda como respuesta a uno
 * suyo, pero no vale para escribirle en frío: eso exigiría una plantilla.
 */
export async function enviarSolicitudUbicacion(
  telefono: string,
  cuerpo: string,
): Promise<boolean> {
  return _enviar(
    telefono,
    {
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: cuerpo },
        action: { name: 'send_location' },
      },
    },
    `pide-ubicacion=${cuerpo}`,
  );
}

/**
 * Manda hasta tres botones de respuesta rápida.
 *
 * Se usan para confirmar el viaje. Un botón en vez de pedir que escriba «sí»
 * evita tres cosas a la vez: el teclado, tener que adivinar qué significa
 * «dale», y que la respuesta llegue en un mensaje que cueste otro turno.
 *
 * El `id` de cada botón es lo que vuelve por el webhook, no su título: así el
 * texto se puede cambiar sin romper el flujo. Meta limita el título a 20
 * caracteres y se RECORTA aquí en vez de dejar que la API lo rechace — un
 * mensaje que no sale deja al pasajero mirando una pantalla muerta.
 */
export async function enviarBotones(
  telefono: string,
  cuerpo: string,
  botones: Array<{ id: string; titulo: string }>,
): Promise<boolean> {
  return _enviar(
    telefono,
    {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: cuerpo },
        action: {
          buttons: botones.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.titulo.slice(0, 20) },
          })),
        },
      },
    },
    `botones=${cuerpo}`,
  );
}

// ─── Entrada ──────────────────────────────────────────────────────────────────

/** Ventana del tope: 24 h móviles, no día natural (evita la trampa del huso). */
const VENTANA_TOPE_MS = 24 * 60 * 60 * 1000;

/**
 * El resultado que además de anotarse MANDA un mensaje.
 *
 * Empiezan por `respondido` a propósito: el contador del tope cuenta con
 * `startsWith('respondido')`, así que cada mensaje que sale cuenta. Si la
 * petición de ubicación se llamara de otra forma, un pasajero podría hacernos
 * mandar cien botones sin tocar el tope.
 */
const OUTCOME_SIN_COBERTURA = 'respondido:fuera-de-cobertura';

/** Qué se decidió con un mensaje. Se guarda para poder diagnosticar el silencio. */
export type Resultado =
  | { estado: 'respondido'; telefono: string; enlace?: string }
  | { estado: 'ubicacion-pedida'; telefono: string }
  | { estado: 'fuera-de-cobertura'; telefono: string }
  | { estado: 'ignorado'; telefono: string; motivo: string }
  | { estado: 'repetido'; telefono: string };

/**
 * Si ese punto está fuera de toda plaza donde ZIPA opera.
 *
 * Usa el MISMO criterio de plaza que el despacho y el panel; si aquí se
 * decidiera de otra forma, el chat y la operación dirían cosas distintas del
 * mismo punto. La regla de cuándo bloquear —y por qué falla abierto— vive en
 * `esFueraDeCobertura`, con su prueba.
 */
async function _fueraDeCobertura(lat: number, lng: number): Promise<boolean> {
  try {
    const plazas = await listMunicipalities();
    return esFueraDeCobertura(plazas.length > 0, await plazaDeCoordenadas(lat, lng));
  } catch {
    // Un fallo leyendo la tabla no puede dejar a nadie sin servicio.
    return false;
  }
}

async function procesarMensaje(m: MensajeWhatsapp, ahora: Date): Promise<Resultado> {
  // ── 1. Antirreintento, atómico ──────────────────────────────────────────
  // Meta reintenta el webhook si no recibe un 200 a tiempo. El índice único
  // sobre waMessageId es la guarda: el segundo intento choca aquí y no llega a
  // mandar un segundo enlace (que se cobra y confunde).
  try {
    await prisma.whatsappInbound.create({
      data: { waMessageId: m.waMessageId, fromPhone: m.telefono, outcome: 'procesando' },
    });
  } catch {
    return { estado: 'repetido', telefono: m.telefono };
  }

  const anotar = async (outcome: string): Promise<void> => {
    await prisma.whatsappInbound
      .update({ where: { waMessageId: m.waMessageId }, data: { outcome } })
      .catch(() => undefined);
  };

  // ── 2. ¿Merece respuesta? ───────────────────────────────────────────────
  const respuestasHoy = await prisma.whatsappInbound.count({
    where: {
      fromPhone: m.telefono,
      // `startsWith` y no igualdad: cuando el envío falla el resultado queda
      // como «respondido:sin-salir», y con igualdad esas no contaban. O sea que
      // el tope se apagaba solo justo cuando Meta estaba rechazando envíos —
      // el momento en que más falta hace. Lo cazó el E2E: en modo mock ningún
      // envío «sale» y el tope no saltaba nunca.
      outcome: { startsWith: 'respondido' },
      receivedAt: { gte: new Date(ahora.getTime() - VENTANA_TOPE_MS) },
    },
  });

  const motivo = motivoParaNoResponder({ enviadoEn: m.enviadoEn, ahora, respuestasHoy });
  if (motivo) {
    await anotar(`ignorado:${motivo}`);
    return { estado: 'ignorado', telefono: m.telefono, motivo };
  }

  // ── 3. Fuera de cobertura: se dice antes de empezar nada ────────────────
  // Si manda su punto y ahí no operamos, entrar en la conversación para
  // acabar diciéndole que no hay servicio le cuesta cuatro mensajes y a
  // nosotros cuatro también.
  if (m.ubicacion && (await _fueraDeCobertura(m.ubicacion.lat, m.ubicacion.lng))) {
    await anotar(OUTCOME_SIN_COBERTURA);
    const salio = await enviarTexto(m.telefono, textoFueraDeCobertura(m.nombre));
    if (!salio) await anotar(`${OUTCOME_SIN_COBERTURA}:sin-salir`);
    return { estado: 'fuera-de-cobertura', telefono: m.telefono };
  }

  // ── 4. El pedido, dentro del chat ───────────────────────────────────────
  // El teléfono lo verificó Meta con su firma; por eso no se pide OTP.
  const r = await ejecutarPasoDelPedido(m, ahora);

  // Se anota ANTES de mandar, siempre. Si el envío falla, el usuario escribe
  // otra vez y eso es un mensaje nuevo con id nuevo. Al revés —mandar y luego
  // anotar— un corte a mitad dejaría el mensaje sin marcar y el reintento de
  // Meta le mandaría un segundo mensaje.
  await anotar(r.outcome);

  const salio = r.pedirUbicacion
    ? await enviarSolicitudUbicacion(m.telefono, r.cuerpo)
    : r.botones && r.botones.length > 0
      ? await enviarBotones(m.telefono, r.cuerpo, r.botones)
      : await enviarTexto(m.telefono, r.cuerpo);

  if (!salio) await anotar(`${r.outcome}:sin-salir`);

  return r.pedirUbicacion
    ? { estado: 'ubicacion-pedida', telefono: m.telefono }
    : { estado: 'respondido', telefono: m.telefono };
}

/**
 * Procesa el cuerpo del webhook. Nunca lanza: la ruta ya respondió 200.
 *
 * Meta espera un 200 rápido y reintenta si tarda. Por eso la ruta contesta en
 * cuanto valida la firma y esto corre después; un error aquí se registra, no se
 * propaga.
 */
export async function procesarEntrante(
  payload: unknown,
  ahora: Date = new Date(),
): Promise<Resultado[]> {
  const salida: Resultado[] = [];
  for (const m of mensajesDe(payload)) {
    try {
      salida.push(await procesarMensaje(m, ahora));
    } catch (e) {
      console.error('[WhatsApp] fallo procesando mensaje:', e instanceof Error ? e.message : e);
      salida.push({ estado: 'ignorado', telefono: m.telefono, motivo: 'error-interno' });
    }
  }
  return salida;
}
