/**
 * Lectura del webhook de WhatsApp Cloud API.
 *
 * POR QUÉ ES UN MÓDULO APARTE
 * ---------------------------
 * Lo que llega es JSON de un tercero, anidado en cinco niveles y con varias
 * formas distintas bajo la MISMA ruta. Nada de eso lo valida el compilador: si
 * se lee mal, el síntoma no es un error sino un pasajero que escribe y nadie le
 * contesta. Aquí vive la lectura, sola y probada; el servicio solo actúa.
 *
 * LAS TRES TRAMPAS QUE RESUELVE
 * -----------------------------
 * 1. Meta manda por el MISMO webhook los acuses de entrega (`statuses`), y son
 *    muchos más que los mensajes. Tratarlos como mensajes sería responderle un
 *    enlace al pasajero cada vez que su teléfono confirma que recibió algo.
 * 2. El teléfono llega SIN el `+` («573001234567»). Y puede no ser colombiano:
 *    al número le escribe quien quiera, y operamos en la frontera. Pasar un
 *    número venezolano por `normalizeColombianPhone` lo convertiría en un
 *    «+57 58412…» que no existe — una cuenta fantasma con un teléfono
 *    inventado. Aquí se rechaza en vez de deformarlo.
 * 3. Un payload raro no puede lanzar: si el webhook responde 500, Meta lo
 *    reintenta durante horas. Lo desconocido se devuelve como lista vacía.
 */

/** Un mensaje entrante ya interpretado. */
export interface MensajeWhatsapp {
  /** Id que asigna Meta (`wamid...`). Es la clave contra los reintentos. */
  waMessageId: string;
  /** Remitente en E.164 colombiano. */
  telefono: string;
  /** text | interactive | button | location | image | … */
  tipo: string;
  /** Texto si lo trae (cuerpo, título del botón o respuesta de lista); si no, ''. */
  texto: string;
  /** Nombre del perfil de WhatsApp, si Meta lo incluye. */
  nombre: string | null;
  /** Cuándo lo envió el usuario (Meta manda epoch en segundos, como texto). */
  enviadoEn: Date;
}

/** Antigüedad máxima de un mensaje al que todavía tiene sentido responder. */
export const MAX_EDAD_MIN = 10;

/**
 * Respuestas que se le mandan como mucho a un mismo teléfono en un día.
 *
 * Desde el 1 de octubre de 2026 cada mensaje saliente se paga pasados los 1.000
 * gratis del mes. Sin tope, alguien escribiendo en bucle se gasta el
 * presupuesto de toda la operación; y al que escribe cien veces, la respuesta
 * ciento uno no le aporta nada.
 */
export const TOPE_DIARIO = 10;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Normaliza el remitente a E.164 colombiano, o `null` si no lo es.
 *
 * Móvil colombiano: indicativo 57 y diez dígitos que empiezan por 3. Se acepta
 * también el fijo de diez dígitos por si algún día se usa, pero NO se
 * «arregla» un número extranjero: es mejor no contestarle a alguien de fuera
 * que abrirle una cuenta con un teléfono que no es el suyo.
 */
export function telefonoColombiano(crudo: string): string | null {
  const digitos = texto(crudo).replace(/\D/g, '');
  if (!digitos) return null;

  // Con indicativo: 57 + 10 dígitos. Sin él: 10 dígitos pelados.
  let local: string;
  if (digitos.length === 12 && digitos.startsWith('57')) local = digitos.slice(2);
  else if (digitos.length === 10) local = digitos;
  else return null;

  // Un móvil colombiano empieza por 3. Los fijos a diez dígitos empiezan por 6.
  if (!/^[36]\d{9}$/.test(local)) return null;
  return `+57${local}`;
}

/** Saca el texto útil según el tipo de mensaje. */
function textoDelMensaje(m: Record<string, unknown>, tipo: string): string {
  if (tipo === 'text' && esObjeto(m['text'])) return texto(m['text']['body']);
  if (tipo === 'button' && esObjeto(m['button'])) return texto(m['button']['text']);
  if (tipo === 'interactive' && esObjeto(m['interactive'])) {
    const i = m['interactive'];
    // Botón de respuesta y fila de lista tienen forma distinta bajo la misma clave.
    for (const clave of ['button_reply', 'list_reply']) {
      const r = i[clave];
      if (esObjeto(r)) return texto(r['title']);
    }
  }
  return '';
}

/**
 * Convierte el cuerpo del webhook en la lista de mensajes que trae.
 *
 * Devuelve `[]` para acuses de entrega, para lo desconocido y para lo
 * malformado. Nunca lanza.
 */
export function mensajesDe(payload: unknown): MensajeWhatsapp[] {
  if (!esObjeto(payload)) return [];

  const salida: MensajeWhatsapp[] = [];

  for (const entrada of lista(payload['entry'])) {
    if (!esObjeto(entrada)) continue;

    for (const cambio of lista(entrada['changes'])) {
      if (!esObjeto(cambio)) continue;
      const valor = cambio['value'];
      if (!esObjeto(valor)) continue;

      // Acuses de entrega: llegan por aquí y NO son mensajes.
      if (!Array.isArray(valor['messages'])) continue;

      // El nombre del perfil viaja aparte, en `contacts`, indexado por wa_id.
      const nombres = new Map<string, string>();
      for (const c of lista(valor['contacts'])) {
        if (!esObjeto(c)) continue;
        const waId = texto(c['wa_id']);
        const perfil = c['profile'];
        if (waId && esObjeto(perfil)) {
          const n = texto(perfil['name']).trim();
          if (n) nombres.set(waId, n);
        }
      }

      for (const crudo of valor['messages']) {
        if (!esObjeto(crudo)) continue;

        const waMessageId = texto(crudo['id']);
        const desde = texto(crudo['from']);
        const telefono = telefonoColombiano(desde);
        if (!waMessageId || !telefono) continue;

        const tipo = texto(crudo['type']) || 'desconocido';

        // El epoch viene como CADENA de segundos. Leerlo como milisegundos
        // daría una fecha de 1970 y el mensaje se descartaría siempre por viejo.
        const seg = Number.parseInt(texto(crudo['timestamp']), 10);
        const enviadoEn = Number.isFinite(seg) && seg > 0 ? new Date(seg * 1000) : new Date();

        salida.push({
          waMessageId,
          telefono,
          tipo,
          texto: textoDelMensaje(crudo, tipo),
          nombre: nombres.get(desde) ?? null,
          enviadoEn,
        });
      }
    }
  }

  return salida;
}

export interface ContextoRespuesta {
  /** Cuándo lo envió el usuario. */
  enviadoEn: Date;
  ahora: Date;
  /** Cuántas respuestas lleva ya ese teléfono hoy. */
  respuestasHoy: number;
  maxEdadMin?: number;
  topeDiario?: number;
}

/**
 * Motivo por el que NO se le responde, o `null` si sí se le responde.
 *
 * Devuelve el motivo y no un booleano a propósito: se guarda en la fila del
 * mensaje, y «no le contestamos» sin decir por qué es imposible de diagnosticar
 * cuando el pasajero llame a quejarse.
 */
export function motivoParaNoResponder(ctx: ContextoRespuesta): string | null {
  const maxEdad = ctx.maxEdadMin ?? MAX_EDAD_MIN;
  const tope = ctx.topeDiario ?? TOPE_DIARIO;

  const edadMin = (ctx.ahora.getTime() - ctx.enviadoEn.getTime()) / 60000;

  // Tras una caída, Meta entrega de golpe la cola acumulada. Contestarle «aquí
  // tienes tu taxi» a quien lo pidió hace tres horas es peor que callarse.
  if (edadMin > maxEdad) return `mensaje-viejo:${Math.round(edadMin)}min`;

  // Un reloj adelantado en el móvil del usuario daría edad negativa; eso no es
  // motivo para ignorarlo, así que solo se mira el exceso.

  if (ctx.respuestasHoy >= tope) return `tope-diario:${ctx.respuestasHoy}`;

  return null;
}
