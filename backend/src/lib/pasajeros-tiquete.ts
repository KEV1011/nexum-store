/**
 * Quién viaja en cada silla.
 *
 * Hoy la reserva guarda UN nombre —el de la cuenta— sin importar cuántos
 * puestos se compren. Una familia de cuatro queda registrada como una sola
 * persona, y el conductor sube al bus con una lista que no puede contrastar
 * con nada.
 *
 * NO ES SOLO COMODIDAD: ES LA PLANILLA
 * ------------------------------------
 * El transporte intermunicipal de pasajeros se opera con una planilla que
 * identifica a quien viaja. Sin documento no hay planilla, y sin planilla la
 * empresa no puede responder por quién iba a bordo — que es exactamente lo que
 * se pregunta cuando algo sale mal.
 *
 * SE PIDE UNO POR SILLA, Y ESE ES TODO EL PUNTO
 * ---------------------------------------------
 * Aceptar menos nombres que puestos dejaría el mismo agujero con más
 * formularios. Si compra cuatro sillas, se piden cuatro personas.
 *
 * LAS APPS YA INSTALADAS NO LO MANDAN
 * -----------------------------------
 * Por eso esto NO es obligatorio de nacimiento: exigirlo hoy dejaría sin poder
 * reservar a todo el que no haya actualizado. Se guarda cuando viene, se
 * muestra honestamente cuando falta, y la exigencia se enciende con
 * `PASAJEROS_EXIGIR_DOCUMENTO` — el mismo patrón de `KYC_ENFORCE` y del
 * kill-switch documental.
 */

/**
 * Los documentos con los que de verdad se viaja.
 *
 * `CE` y `PA` no son relleno: operando desde Norte de Santander, la cédula de
 * extranjería y el pasaporte se ven a diario.
 */
export const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'PA'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ETIQUETA_DOCUMENTO: Record<TipoDocumento, string> = {
  CC: 'Cédula de ciudadanía',
  TI: 'Tarjeta de identidad',
  CE: 'Cédula de extranjería',
  PA: 'Pasaporte',
};

/** Máximo de sillas por reserva. Coincide con el tope del flujo de compra. */
export const MAX_PASAJEROS = 10;

export interface PasajeroTiquete {
  tipoDoc: TipoDocumento;
  documento: string;
  nombre: string;
}

export class PasajerosInvalidos extends Error {}

function esTipo(v: string): v is TipoDocumento {
  return (TIPOS_DOCUMENTO as readonly string[]).includes(v);
}

/**
 * Normaliza un documento para comparar.
 *
 * Sin esto, «1.090.123» y «1090123» pasarían por dos personas distintas y el
 * duplicado —que casi siempre es un copiar y pegar— se colaría en la planilla.
 */
function claveDocumento(d: string): string {
  return d.replace(/[\s.\-]/g, '').toUpperCase();
}

/**
 * Valida la lista contra los puestos comprados.
 *
 * `undefined` significa «esta app no manda pasajeros» y se devuelve `null`:
 * la reserva sigue como hasta hoy. Una lista PRESENTE sí se valida entera.
 */
export function saneaPasajeros(v: unknown, puestos: number): PasajeroTiquete[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) {
    throw new PasajerosInvalidos('Los datos de los pasajeros no tienen el formato esperado.');
  }
  if (v.length === 0) return null;

  if (puestos < 1 || puestos > MAX_PASAJEROS) {
    throw new PasajerosInvalidos(`Los puestos deben estar entre 1 y ${MAX_PASAJEROS}.`);
  }
  if (v.length !== puestos) {
    throw new PasajerosInvalidos(
      `Reservaste ${puestos} ${puestos === 1 ? 'puesto' : 'puestos'} y enviaste ` +
        `${v.length} ${v.length === 1 ? 'pasajero' : 'pasajeros'}. Hace falta uno por silla.`,
    );
  }

  const salida: PasajeroTiquete[] = [];
  const vistos = new Set<string>();

  for (let i = 0; i < v.length; i++) {
    const p = v[i];
    const puesto = i + 1;
    if (typeof p !== 'object' || p === null || Array.isArray(p)) {
      throw new PasajerosInvalidos(`Faltan los datos del pasajero ${puesto}.`);
    }
    const raw = p as { tipoDoc?: unknown; documento?: unknown; nombre?: unknown };

    const tipoDoc = typeof raw.tipoDoc === 'string' ? raw.tipoDoc.trim().toUpperCase() : '';
    if (!esTipo(tipoDoc)) {
      throw new PasajerosInvalidos(
        `El tipo de documento del pasajero ${puesto} no es válido (${TIPOS_DOCUMENTO.join(', ')}).`,
      );
    }

    const documento = typeof raw.documento === 'string' ? raw.documento.trim() : '';
    if (documento.length < 4 || documento.length > 20) {
      throw new PasajerosInvalidos(`El documento del pasajero ${puesto} no parece válido.`);
    }

    const nombre = typeof raw.nombre === 'string' ? raw.nombre.trim().replace(/\s+/g, ' ') : '';
    if (nombre.length < 3 || nombre.length > 80) {
      throw new PasajerosInvalidos(`El nombre del pasajero ${puesto} no parece válido.`);
    }

    const clave = claveDocumento(documento);
    if (vistos.has(clave)) {
      // La misma persona no puede ocupar dos sillas, y esto casi siempre es un
      // copiar y pegar que dejaría la planilla mal.
      throw new PasajerosInvalidos(
        `El documento ${documento} está repetido. Cada silla necesita una persona distinta.`,
      );
    }
    vistos.add(clave);

    salida.push({ tipoDoc, documento, nombre });
  }

  return salida;
}

/** Lo guardado en la base, tolerante: nunca tumba una consulta. */
export function pasajerosGuardados(v: unknown): PasajeroTiquete[] {
  if (!Array.isArray(v)) return [];
  const salida: PasajeroTiquete[] = [];
  for (const p of v) {
    if (typeof p !== 'object' || p === null) continue;
    const raw = p as { tipoDoc?: unknown; documento?: unknown; nombre?: unknown };
    if (
      typeof raw.tipoDoc === 'string' && esTipo(raw.tipoDoc) &&
      typeof raw.documento === 'string' && typeof raw.nombre === 'string'
    ) {
      salida.push({ tipoDoc: raw.tipoDoc, documento: raw.documento, nombre: raw.nombre });
    }
  }
  return salida;
}

/** «CC 1090123456 · María Torres», para el manifiesto del conductor. */
export function lineaDePasajero(p: PasajeroTiquete): string {
  return `${p.tipoDoc} ${p.documento} · ${p.nombre}`;
}

/**
 * Si se exige el documento para poder reservar.
 *
 * Apagado por defecto, y el motivo no es la duda: es que encenderlo hoy
 * dejaría sin reservar a todo el que tenga una app anterior a este campo.
 * Se enciende cuando los APK nuevos estén repartidos —mismo patrón que
 * `KYC_ENFORCE`, `DOC_KILL_SWITCH_ENFORCE` y `LEGAL_CONSENT_ENFORCE`— y
 * `/health` lo publica para que no se quede encendido sin querer.
 */
export function exigirDocumentoDePasajero(): boolean {
  return process.env['PASAJEROS_EXIGIR_DOCUMENTO'] === 'true';
}
