/**
 * Los papeles que viajan CON la carga.
 *
 * QUÉ FALTABA. El repo ya guardaba los documentos del CONDUCTOR (cédula,
 * licencia, SOAT: `DriverDocument`) y los de la EMPRESA (habilitación:
 * `OperatorDocument`), pero no los del ENVÍO. Y son los que de verdad se
 * piden en la carretera: la remesa, el manifiesto de carga, la factura de
 * la mercancía, la guía. Hoy van en una carpeta en la cabina, y cuando se
 * mojan, se pierden o se quedan en la bodega, el viaje se para.
 *
 * UNA SOLA TABLA, NO UNA POR DUEÑO. Es la lección que este repo ya pagó
 * con `CargoTrip` construido al lado de `FreightRequest`: la trazabilidad
 * quedó repartida y hubo que unificarla después. Un documento cuelga del
 * viaje de carga, del flete o del envío urbano, igual que `FreightEvent`,
 * y exactamente de UNO.
 *
 * LO QUE ESTO NO ES. No es validación: nadie comprueba que la remesa sea
 * auténtica ni que el número exista en el RNDC. Es custodia — que el papel
 * esté donde hace falta, con su tipo, su número y quién lo subió, y que lo
 * pueda abrir el conductor en la vía y la flota al facturar.
 */

export class DocumentoEnvioInvalido extends Error {}

/**
 * Catálogo CERRADO.
 *
 * Con texto libre uno escribe «remesa», otro «Remesa terrestre» y otro
 * «RTC», y después no se puede ni filtrar ni responder «¿tiene manifiesto
 * este viaje?», que es justo la pregunta que se hace en un retén.
 */
export const TIPOS_DOCUMENTO_ENVIO = [
  'REMESA',
  'MANIFIESTO',
  'FACTURA',
  'GUIA',
  'ACTA_ENTREGA',
  'SOPORTE',
] as const;
export type TipoDocumentoEnvio = (typeof TIPOS_DOCUMENTO_ENVIO)[number];

export const ETIQUETA_DOCUMENTO_ENVIO: Record<TipoDocumentoEnvio, string> = {
  REMESA: 'Remesa terrestre de carga',
  MANIFIESTO: 'Manifiesto de carga',
  FACTURA: 'Factura o remisión de la mercancía',
  GUIA: 'Guía de transporte',
  ACTA_ENTREGA: 'Acta de entrega firmada',
  SOPORTE: 'Otro soporte',
};

/**
 * Los que normalmente van firmados.
 *
 * No se EXIGE la firma —hay remesas que se firman en destino y facturas que
 * no se firman nunca—, pero la pantalla sí puede decir «este suele ir
 * firmado» en vez de dejar al conductor adivinando cuál falta.
 */
export const SUELEN_IR_FIRMADOS: ReadonlySet<TipoDocumentoEnvio> = new Set([
  'REMESA',
  'MANIFIESTO',
  'ACTA_ENTREGA',
]);

export function esTipoDocumentoEnvio(v: unknown): v is TipoDocumentoEnvio {
  return typeof v === 'string'
    && (TIPOS_DOCUMENTO_ENVIO as readonly string[]).includes(v);
}

/** La etiqueta de lo guardado. Lo desconocido no tumba la consulta. */
export function etiquetaDocumentoEnvio(v: unknown): string | undefined {
  return esTipoDocumentoEnvio(v) ? ETIQUETA_DOCUMENTO_ENVIO[v] : undefined;
}

/** A qué cuelga el documento. Exactamente uno. */
export type DuenoDocumento =
  | { clase: 'cargoTrip'; id: string }
  | { clase: 'freight'; id: string }
  | { clase: 'trip'; id: string };

export function duenoDeDocumento(clase: unknown, id: unknown): DuenoDocumento {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new DocumentoEnvioInvalido('Falta el servicio al que pertenece el documento.');
  }
  if (clase === 'cargoTrip' || clase === 'freight' || clase === 'trip') {
    return { clase, id: id.trim() };
  }
  throw new DocumentoEnvioInvalido('El tipo de servicio debe ser cargoTrip, freight o trip.');
}

export interface DatosDocumento {
  tipo: TipoDocumentoEnvio;
  /** El número del papel: «066», «FE-1234». Opcional pero muy útil. */
  numero?: string;
  /** Fecha del documento, no la de la subida. */
  fechaDocumento?: Date;
  nota?: string;
}

const MAX_NUMERO = 40;
const MAX_NOTA = 300;

/**
 * Sanea lo que llega del formulario.
 *
 * El tipo es OBLIGATORIO y no cae a `SOPORTE` por defecto: un montón de
 * fotos sin tipo es la carpeta de la cabina otra vez, y el valor de esto
 * era poder preguntar «¿falta el manifiesto?».
 */
export function saneaDatosDocumento(v: unknown): DatosDocumento {
  const raw = (typeof v === 'object' && v !== null ? v : {}) as {
    tipo?: unknown; numero?: unknown; fechaDocumento?: unknown; nota?: unknown;
  };

  const tipo = typeof raw.tipo === 'string' ? raw.tipo.trim().toUpperCase() : '';
  if (!esTipoDocumentoEnvio(tipo)) {
    throw new DocumentoEnvioInvalido(
      `Elige qué documento es (${TIPOS_DOCUMENTO_ENVIO.join(', ')}).`,
    );
  }

  const salida: DatosDocumento = { tipo };

  if (typeof raw.numero === 'string') {
    // Se conserva TAL CUAL lo escribió quien lo subió —solo sin espacios
    // sobrantes—: «066» no es «66», y normalizar un consecutivo ajeno es
    // inventarse el número de un documento que existe en papel.
    const n = raw.numero.trim().replace(/\s+/g, ' ').slice(0, MAX_NUMERO);
    if (n.length > 0) salida.numero = n;
  }

  if (raw.fechaDocumento !== undefined && raw.fechaDocumento !== null && raw.fechaDocumento !== '') {
    const d = new Date(raw.fechaDocumento as string);
    if (Number.isNaN(d.getTime())) {
      throw new DocumentoEnvioInvalido('La fecha del documento no es válida.');
    }
    // Una fecha futura en un papel que ya se tiene en la mano es un dedazo
    // al teclear el año, y un documento fechado mañana no sirve en un retén.
    // Un día de margen por los husos.
    if (d.getTime() > Date.now() + 24 * 3600 * 1000) {
      throw new DocumentoEnvioInvalido('La fecha del documento no puede ser futura.');
    }
    salida.fechaDocumento = d;
  }

  if (typeof raw.nota === 'string') {
    const n = raw.nota.trim().slice(0, MAX_NOTA);
    if (n.length > 0) salida.nota = n;
  }

  return salida;
}

/**
 * Qué documentos le faltan a un viaje de carga.
 *
 * Es una AYUDA, no una guarda: no bloquea despachar. Quien decide si sale
 * el camión es la empresa, que conoce su operación y puede tener el papel
 * en la mano sin haberlo subido. Bloquear con esto dejaría un camión
 * cargado parado por una foto.
 *
 * Y por eso mismo la lista es corta: solo los dos que de verdad se piden
 * en la vía. Pedir seis documentos convierte el aviso en ruido y se deja
 * de leer.
 */
export const EXIGIBLES_EN_VIA: ReadonlyArray<TipoDocumentoEnvio> = ['REMESA', 'MANIFIESTO'];

export function faltantesEnVia(
  tiposPresentes: ReadonlyArray<unknown>,
): TipoDocumentoEnvio[] {
  const hay = new Set(tiposPresentes.filter(esTipoDocumentoEnvio));
  return EXIGIBLES_EN_VIA.filter((t) => !hay.has(t));
}

/**
 * Si un documento se puede retirar.
 *
 * Un documento FIRMADO no se borra. Es la misma regla del pago anulado y
 * de la cuenta de cobro emitida: un papel firmado que desaparece deja de
 * probar nada, y el reclamo en el que haría falta es justo el que llega
 * meses después. Se sube la versión corregida al lado.
 */
export function motivoParaNoBorrar(doc: { signedAt?: Date | null }): string | null {
  if (doc.signedAt) {
    return 'Un documento firmado no se borra. Sube la versión corregida y quedan los dos.';
  }
  return null;
}
