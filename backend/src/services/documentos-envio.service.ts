/**
 * Los papeles del envío: subir, listar y retirar.
 *
 * LA PIEZA QUE SOSTIENE TODO ESTO ES LA PERTENENCIA. Un documento cuelga de
 * un servicio que es de alguien, y «alguien» no es lo mismo según quién
 * pregunte: el conductor puede tocar lo que lleva ÉL, la flota lo que es
 * SUYO. Las dos comprobaciones viven aquí y no en la ruta, porque si cada
 * ruta escribiera la suya acabarían divergiendo —y la que se quedara corta
 * dejaría a un conductor viendo la remesa de otra empresa—.
 */

import { prisma } from '../lib/prisma';
import {
  saneaDatosDocumento,
  duenoDeDocumento,
  etiquetaDocumentoEnvio,
  motivoParaNoBorrar,
  faltantesEnVia,
  SUELEN_IR_FIRMADOS,
  esTipoDocumentoEnvio,
  DocumentoEnvioInvalido,
  type DuenoDocumento,
  type TipoDocumentoEnvio,
} from '../lib/documentos-envio';

export { DocumentoEnvioInvalido };

export interface DocumentoEnvioDTO {
  id: string;
  type: string;
  typeLabel?: string;
  fileUrl: string;
  number?: string;
  issuedOn?: string;
  note?: string;
  signatureUrl?: string;
  signedByName?: string;
  signedAt?: string;
  /** `true` cuando este tipo suele ir firmado y todavía no lo está. */
  faltaFirma: boolean;
  uploadedAt: string;
  uploadedBy: 'conductor' | 'empresa' | 'desconocido';
}

type Fila = {
  id: string; type: string; fileUrl: string; number: string | null;
  issuedOn: Date | null; note: string | null;
  signatureUrl: string | null; signedByName: string | null; signedAt: Date | null;
  uploadedByDriverId: string | null; uploadedByOperatorId: string | null;
  uploadedAt: Date;
};

function _toDTO(d: Fila): DocumentoEnvioDTO {
  return {
    id: d.id,
    type: d.type,
    typeLabel: etiquetaDocumentoEnvio(d.type),
    fileUrl: d.fileUrl,
    number: d.number ?? undefined,
    issuedOn: d.issuedOn?.toISOString(),
    note: d.note ?? undefined,
    signatureUrl: d.signatureUrl ?? undefined,
    signedByName: d.signedByName ?? undefined,
    signedAt: d.signedAt?.toISOString(),
    // Pista, no exigencia: hay remesas que se firman en destino. Decirlo es
    // mejor que dejar al conductor adivinando cuál papel le falta.
    faltaFirma:
      esTipoDocumentoEnvio(d.type) && SUELEN_IR_FIRMADOS.has(d.type) && !d.signedAt,
    uploadedAt: d.uploadedAt.toISOString(),
    uploadedBy: d.uploadedByDriverId
      ? 'conductor'
      : d.uploadedByOperatorId
        ? 'empresa'
        : 'desconocido',
  };
}

/** El `where` que identifica al dueño, en un solo sitio. */
function _whereDueno(d: DuenoDocumento) {
  return d.clase === 'cargoTrip'
    ? { cargoTripId: d.id }
    : d.clase === 'freight'
      ? { freightId: d.id }
      : { tripId: d.id };
}

/**
 * ¿Es este servicio del CONDUCTOR que pregunta?
 *
 * Se comprueba contra la fila real y no contra lo que diga la petición. En
 * el viaje de carga la pertenencia es doble —el conductor sellado en el
 * viaje o el del flete que lo originó—, porque un viaje creado desde el
 * portal lleva al conductor en un sitio y uno tomado del marketplace en el
 * otro.
 */
async function _esDelConductor(d: DuenoDocumento, driverId: string): Promise<boolean> {
  if (d.clase === 'freight') {
    return (await prisma.freightRequest.count({ where: { id: d.id, driverId } })) > 0;
  }
  if (d.clase === 'trip') {
    return (await prisma.trip.count({ where: { id: d.id, driverId } })) > 0;
  }
  return (
    (await prisma.cargoTrip.count({
      where: { id: d.id, OR: [{ driverId }, { freight: { driverId } }] },
    })) > 0
  );
}

/** ¿Es este servicio de la FLOTA que pregunta? */
async function _esDeLaFlota(d: DuenoDocumento, operatorId: string): Promise<boolean> {
  if (d.clase === 'freight') {
    return (await prisma.freightRequest.count({ where: { id: d.id, operatorId } })) > 0;
  }
  if (d.clase === 'trip') {
    return (await prisma.trip.count({ where: { id: d.id, operatorId } })) > 0;
  }
  return (await prisma.cargoTrip.count({ where: { id: d.id, operatorId } })) > 0;
}

export type QuienSube =
  | { rol: 'conductor'; id: string }
  | { rol: 'empresa'; id: string };

async function _autorizar(d: DuenoDocumento, quien: QuienSube): Promise<void> {
  const ok = quien.rol === 'conductor'
    ? await _esDelConductor(d, quien.id)
    : await _esDeLaFlota(d, quien.id);
  if (!ok) {
    // El mismo mensaje para «no existe» y «no es tuyo», a propósito: la
    // diferencia le diría a cualquiera si un id ajeno existe.
    throw new DocumentoEnvioInvalido('El servicio no existe o no es tuyo.');
  }
}

/**
 * Sube un papel y lo cuelga del servicio.
 *
 * La firma, si viene, se sella con la hora del SERVIDOR: la del teléfono se
 * cambia en ajustes, y una constancia con la hora que elige quien firma no
 * es una constancia. Misma regla que la prueba de entrega.
 */
export async function subirDocumentoEnvio(params: {
  clase: unknown;
  servicioId: unknown;
  quien: QuienSube;
  fileUrl: string;
  datos: unknown;
  firma?: { url: string; nombre?: string | null };
}): Promise<DocumentoEnvioDTO> {
  const dueno = duenoDeDocumento(params.clase, params.servicioId);
  const datos = saneaDatosDocumento(params.datos);
  await _autorizar(dueno, params.quien);

  const fila = await prisma.shipmentDocument.create({
    data: {
      ..._whereDueno(dueno),
      type: datos.tipo,
      fileUrl: params.fileUrl,
      number: datos.numero ?? null,
      issuedOn: datos.fechaDocumento ?? null,
      note: datos.nota ?? null,
      signatureUrl: params.firma?.url ?? null,
      signedByName: params.firma?.nombre ?? null,
      signedAt: params.firma ? new Date() : null,
      uploadedByDriverId: params.quien.rol === 'conductor' ? params.quien.id : null,
      uploadedByOperatorId: params.quien.rol === 'empresa' ? params.quien.id : null,
    },
  });
  return _toDTO(fila);
}

export interface PapelesDelEnvio {
  documentos: DocumentoEnvioDTO[];
  /**
   * Qué falta de lo que piden en la vía. AVISO, no guarda: quien decide si
   * sale el camión es la empresa, que puede tener el papel en la mano sin
   * haberlo subido. Bloquear con esto dejaría un camión cargado parado por
   * una foto.
   */
  faltanEnVia: TipoDocumentoEnvio[];
}

export async function listarDocumentosEnvio(
  clase: unknown, servicioId: unknown, quien: QuienSube,
): Promise<PapelesDelEnvio> {
  const dueno = duenoDeDocumento(clase, servicioId);
  await _autorizar(dueno, quien);

  const filas = await prisma.shipmentDocument.findMany({
    where: _whereDueno(dueno),
    orderBy: { uploadedAt: 'asc' },
  });
  return {
    documentos: filas.map(_toDTO),
    faltanEnVia: faltantesEnVia(filas.map((f) => f.type)),
  };
}

/**
 * Retira un documento.
 *
 * Un documento FIRMADO no se borra: la regla vive en `lib/documentos-envio`
 * con su motivo y se devuelve tal cual, porque quien lo lee es la persona
 * que acaba de tocar el botón y necesita saber qué hacer en su lugar.
 */
export async function borrarDocumentoEnvio(
  documentoId: string, quien: QuienSube,
): Promise<void> {
  const doc = await prisma.shipmentDocument.findUnique({ where: { id: documentoId } });
  if (!doc) throw new DocumentoEnvioInvalido('El documento no existe.');

  const dueno: DuenoDocumento = doc.cargoTripId
    ? { clase: 'cargoTrip', id: doc.cargoTripId }
    : doc.freightId
      ? { clase: 'freight', id: doc.freightId }
      : doc.tripId
        ? { clase: 'trip', id: doc.tripId }
        : (() => {
            // No puede pasar —siempre se crea con uno— pero si pasara, un
            // documento huérfano no se le enseña ni se le deja borrar a
            // nadie: no hay contra qué comprobar la pertenencia.
            throw new DocumentoEnvioInvalido('El documento no está asociado a ningún servicio.');
          })();

  await _autorizar(dueno, quien);

  const motivo = motivoParaNoBorrar(doc);
  if (motivo) throw new DocumentoEnvioInvalido(motivo);

  // `deleteMany` con el id: si otro lo borró entre la lectura y aquí, esto
  // no lanza en vez de reventar con un «registro no encontrado» que al
  // usuario no le dice nada.
  await prisma.shipmentDocument.deleteMany({ where: { id: documentoId } });
}
