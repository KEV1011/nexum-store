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
import { construirEnlace, VIGENCIA_MIN } from '../lib/enlace-magico';
import { emitirEnlaceMagico, usuarioParaTelefonoVerificado } from './enlace-magico.service';

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
 * Manda un mensaje de texto.
 *
 * Sin credenciales escribe en consola y devuelve `false`, igual que el push:
 * así el flujo entero se puede probar de punta a punta antes de que exista la
 * cuenta de Meta, y queda a la vista que no salió de verdad.
 */
export async function enviarTexto(telefono: string, cuerpo: string): Promise<boolean> {
  if (!isWhatsappConfigured()) {
    console.log(`[WhatsApp:mock] to=${telefono} text=${cuerpo.replace(/\n/g, ' ⏎ ')}`);
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
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'text',
        // Sin vista previa: ahorra que el robot de WhatsApp visite el enlace y
        // deja el mensaje más limpio.
        text: { body: cuerpo, preview_url: false },
      }),
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

// ─── Entrada ──────────────────────────────────────────────────────────────────

/** Ventana del tope: 24 h móviles, no día natural (evita la trampa del huso). */
const VENTANA_TOPE_MS = 24 * 60 * 60 * 1000;

function textoDelEnlace(nombre: string | null, enlace: string): string {
  const saludo = nombre ? `Hola, ${nombre}.` : 'Hola.';
  return (
    `${saludo} Toca este enlace para pedir tu servicio en ZIPA:\n\n` +
    `${enlace}\n\n` +
    `Es solo para ti y vence en ${VIGENCIA_MIN} minutos. ` +
    `Si se vence, escríbeme otra vez y te mando uno nuevo.`
  );
}

/** Qué se decidió con un mensaje. Se guarda para poder diagnosticar el silencio. */
export type Resultado =
  | { estado: 'respondido'; telefono: string; enlace: string }
  | { estado: 'ignorado'; telefono: string; motivo: string }
  | { estado: 'repetido'; telefono: string };

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

  // ── 3. Identidad y enlace ───────────────────────────────────────────────
  // El teléfono lo verificó Meta con su firma; por eso no se pide OTP.
  const usuario = await usuarioParaTelefonoVerificado(m.telefono, m.nombre);
  const { codigo } = await emitirEnlaceMagico(usuario.id, 'whatsapp', ahora);
  const enlace = construirEnlace(CLIENT_WEB_URL, codigo);

  // ── 4. Envío ────────────────────────────────────────────────────────────
  // Se anota ANTES de mandar: si el envío falla, el usuario escribe otra vez y
  // eso es un mensaje nuevo con id nuevo. Al revés —mandar y luego anotar— un
  // corte a mitad dejaría el mensaje sin marcar y el reintento de Meta le
  // mandaría un segundo enlace.
  await anotar('respondido');
  const salio = await enviarTexto(m.telefono, textoDelEnlace(m.nombre, enlace));
  if (!salio) await anotar('respondido:sin-salir');

  return { estado: 'respondido', telefono: m.telefono, enlace };
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
