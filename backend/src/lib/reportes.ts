// ─── Reportes y bloqueos: las reglas ─────────────────────────────────────────
//
// Viven sueltas y probadas porque son donde un sistema de moderación se
// degrada sin que nadie lo note: un motivo libre que nadie puede triar, un
// reporte contra uno mismo, un bloqueo que no bloquea nada.
//
// Lo que las tiendas exigen (Apple 1.2, política de contenido de usuario de
// Play) son cuatro cosas juntas: filtrar, reportar, bloquear y publicar un
// contacto. Este archivo sostiene las dos del medio.

export type QuienReporta = 'client' | 'driver';

/** Lo que se puede reportar. Cerrado a propósito: si no está aquí, no hay
 *  pantalla que lo muestre ni cola que lo revise. */
export const TIPOS_REPORTABLES = [
  'chat_message',
  'driver',
  'passenger',
  'business_review',
  'product',
  'business',
] as const;
export type TipoReportable = (typeof TIPOS_REPORTABLES)[number];

/**
 * El catálogo de motivos.
 *
 * Cerrado y corto. Un campo de texto libre como único motivo hace imposible
 * ordenar la cola: «acoso» y «me llegó frío» acaban en la misma pila y quien
 * modera tiene que leerlo todo para encontrar lo urgente. El detalle libre
 * existe, pero ACOMPAÑA al motivo, no lo sustituye.
 */
export const MOTIVOS: Record<string, { etiqueta: string; urgente: boolean }> = {
  acoso: { etiqueta: 'Acoso o amenazas', urgente: true },
  contenido_sexual: { etiqueta: 'Contenido sexual', urgente: true },
  violencia: { etiqueta: 'Violencia o incitación al odio', urgente: true },
  discriminacion: { etiqueta: 'Discriminación', urgente: true },
  conduccion_peligrosa: { etiqueta: 'Conducción peligrosa', urgente: true },
  fraude: { etiqueta: 'Fraude o estafa', urgente: false },
  spam: { etiqueta: 'Spam o publicidad', urgente: false },
  informacion_falsa: { etiqueta: 'La información no es real', urgente: false },
  otro: { etiqueta: 'Otro', urgente: false },
};

export const MOTIVOS_URGENTES = Object.entries(MOTIVOS)
  .filter(([, m]) => m.urgente)
  .map(([k]) => k);

/** Tope del detalle libre. Lo que no cabe aquí no es un reporte, es un caso de
 *  soporte — y para eso hay tickets. */
export const MAX_DETALLE = 1000;

export class ReporteInvalido extends Error {}

export interface ReporteSaneado {
  targetKind: TipoReportable;
  targetId: string;
  reason: string;
  detail: string | null;
  urgente: boolean;
}

export interface EntradaReporte {
  targetKind?: unknown;
  targetId?: unknown;
  reason?: unknown;
  detail?: unknown;
}

/**
 * Valida un reporte que llega de una app.
 *
 * [quienReporta] y [quienId] son de quien lo manda, y sirven para lo único que
 * no se puede comprobar mirando el reporte solo: que no se esté reportando a
 * sí mismo. Suena absurdo hasta que alguien lo automatiza para inundar la
 * cola.
 */
export function saneaReporte(
  entrada: EntradaReporte,
  quienReporta: QuienReporta,
  quienId: string,
): ReporteSaneado {
  const targetKind = String(entrada.targetKind ?? '').trim();
  if (!(TIPOS_REPORTABLES as readonly string[]).includes(targetKind)) {
    throw new ReporteInvalido('No sabemos qué se está reportando.');
  }

  const targetId = String(entrada.targetId ?? '').trim();
  if (!targetId) throw new ReporteInvalido('Falta qué se reporta.');

  const reason = String(entrada.reason ?? '').trim();
  const motivo = MOTIVOS[reason];
  if (!motivo) throw new ReporteInvalido('Elige un motivo de la lista.');

  // Reportarse a uno mismo. El par (tipo, id) tiene que coincidir: un
  // conductor reportando al conductor que es él.
  const propio =
    (quienReporta === 'driver' && targetKind === 'driver') ||
    (quienReporta === 'client' && targetKind === 'passenger');
  if (propio && targetId === quienId) {
    throw new ReporteInvalido('No puedes reportarte a ti mismo.');
  }

  const detalleCrudo = entrada.detail == null ? '' : String(entrada.detail).trim();
  const detail = detalleCrudo ? detalleCrudo.slice(0, MAX_DETALLE) : null;

  // «Otro» sin explicación no es un reporte: es un clic. Quien modera no
  // puede hacer nada con él y ensucia la cola de lo que sí importa.
  if (reason === 'otro' && !detail) {
    throw new ReporteInvalido('Cuéntanos qué pasó para poder revisarlo.');
  }

  return { targetKind: targetKind as TipoReportable, targetId, reason, detail, urgente: motivo.urgente };
}

// ─── Bloqueos ────────────────────────────────────────────────────────────────

export interface ParBloqueo {
  blockerKind: QuienReporta;
  blockerId: string;
  blockedKind: QuienReporta;
  blockedId: string;
}

/**
 * Valida a quién se bloquea.
 *
 * Un cliente bloquea conductores y un conductor bloquea clientes: el bloqueo
 * existe para no volver a coincidir en un servicio, y dos pasajeros nunca
 * coinciden. Permitir cliente↔cliente daría un botón que no hace nada, que es
 * peor que no tenerlo.
 */
export function saneaBloqueo(
  quienBloquea: QuienReporta,
  quienId: string,
  objetivo: { kind?: unknown; id?: unknown },
): ParBloqueo {
  const kind = String(objetivo.kind ?? '').trim();
  const id = String(objetivo.id ?? '').trim();
  if (!id) throw new ReporteInvalido('Falta a quién bloquear.');

  const esperado = quienBloquea === 'client' ? 'driver' : 'client';
  if (kind !== esperado) {
    throw new ReporteInvalido(
      quienBloquea === 'client'
        ? 'Solo puedes bloquear a un conductor.'
        : 'Solo puedes bloquear a un pasajero.',
    );
  }
  if (kind === quienBloquea && id === quienId) {
    throw new ReporteInvalido('No puedes bloquearte a ti mismo.');
  }
  return {
    blockerKind: quienBloquea,
    blockerId: quienId,
    blockedKind: esperado as QuienReporta,
    blockedId: id,
  };
}

/** Etiqueta legible de un motivo, para el panel y los correos. Nunca revienta
 *  con un motivo retirado del catálogo: devuelve la clave. */
export function etiquetaMotivo(reason: string): string {
  return MOTIVOS[reason]?.etiqueta ?? reason;
}

/**
 * El catálogo tal como lo pinta una app.
 *
 * Viaja desde el servidor por lo mismo que los métodos de pago y los elogios:
 * si la lista viviera dentro de cada app, cambiar un motivo obligaría a
 * publicar dos versiones y durante semanas convivirían tres catálogos — y un
 * motivo que la app manda pero el servidor no conoce se rechaza con un error
 * que el usuario no puede arreglar.
 *
 * `urgente` no se expone: es para ordenar la cola de quien modera, y enseñar
 * cuáles «pesan más» invita a marcarlos todos como acoso.
 */
export function motivosParaApps(): Array<{ valor: string; etiqueta: string }> {
  return Object.entries(MOTIVOS).map(([valor, m]) => ({ valor, etiqueta: m.etiqueta }));
}
