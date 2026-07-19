// ── Blindaje legal: términos versionados, consentimientos y takedown DMCA ─────
//
// Infraestructura para el clickwrap (aceptación explícita con constancia):
//  • Documentos legales VERSIONADOS servidos por el backend (una sola fuente de
//    verdad para apps y web). La v1 se siembra sola al primer uso con el texto
//    base en español — cláusula de arbitraje, transparencia de IA y takedown
//    DMCA incluidos. NOTA: la redacción final la valida un abogado; publicar
//    una versión nueva desactiva la anterior (re-aceptación).
//  • Constancia de aceptación { quién, versión, fecha, IP } al registrarse
//    (cliente/conductor/empresa) — soporte probatorio del arbitraje.
//  • Enforcement env-gated: LEGAL_CONSENT_ENFORCE=true exige acceptedTerms en
//    el registro (default false: las apps viejas siguen funcionando y la
//    constancia se guarda cuando el campo llega).
//  • Solicitudes de retiro DMCA (POST /legal/takedown) procesadas por el admin.

import { LegalDocKind } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class LegalError extends Error {}

export function legalConsentEnforced(): boolean {
  return (process.env['LEGAL_CONSENT_ENFORCE'] ?? 'false').toLowerCase() === 'true';
}

// ── Textos base v1 (es-CO). El abogado ajusta; el versionado hace el resto. ──

const V1 = '2026-07-19';

const TERMS_V1 = `TÉRMINOS Y CONDICIONES DE USO — ZIPA (v ${V1})

1. OBJETO. ZIPA es una plataforma tecnológica que conecta usuarios con
conductores, mensajeros y empresas de transporte habilitadas para servicios de
movilidad, envíos, mandados, pedidos y transporte intermunicipal y de carga en
Colombia. ZIPA actúa como intermediario tecnológico.

2. REGISTRO Y VERACIDAD. El usuario declara que la información suministrada es
veraz. Los conductores se obligan a mantener vigentes sus documentos (cédula,
licencia, SOAT, tarjeta de propiedad y demás exigidos por la ley); la
plataforma puede suspender cuentas con documentos vencidos.

3. USO DE INTELIGENCIA ARTIFICIAL. ZIPA utiliza algoritmos y sistemas de
inteligencia artificial para: (a) emparejar solicitudes con conductores según
cercanía y disponibilidad; (b) estimar rutas, tiempos y tarifas; (c) detectar
anomalías y posibles fraudes (p. ej. señales GPS inconsistentes, desvíos de
ruta); y (d) priorizar la seguridad operativa. Estas decisiones automatizadas
pueden ser revisadas por personas a solicitud del usuario.

4. CONTENIDO DE USUARIOS Y RETIRO (DMCA/DERECHOS DE AUTOR). El usuario es el
único responsable del contenido que sube (documentos, fotografías, imágenes de
catálogo, pruebas de entrega, mensajes). Al subirlo declara tener los derechos
necesarios. ZIPA dispone de un procedimiento de notificación y retiro: los
titulares de derechos pueden reportar contenido en /legal/takedown; ZIPA podrá
retirar el contenido reportado y suspender cuentas reincidentes. La
responsabilidad por contenido infractor recae en quien lo subió.

5. CLÁUSULA DE ARBITRAJE Y RENUNCIA A ACCIONES COLECTIVAS. Toda controversia
derivada de estos términos o del uso de la plataforma se resolverá mediante
arbitraje individual conforme a las reglas del centro de arbitraje que ZIPA
designe en la ciudad de domicilio del usuario en Colombia, renunciando las
partes, en la máxima medida permitida por la ley, a iniciar o participar en
acciones colectivas o de clase. Nada de lo anterior limita los derechos
irrenunciables del consumidor bajo la ley colombiana.

6. TARIFAS Y PAGOS. Las tarifas se informan antes de confirmar cada servicio.
Los pagos en línea se procesan a través de pasarelas certificadas; ZIPA no
almacena datos de tarjetas.

7. LIMITACIÓN DE RESPONSABILIDAD. En la máxima medida legal, ZIPA responde
como intermediario tecnológico; el servicio de transporte es prestado por el
conductor o la empresa habilitada.

8. MODIFICACIONES. ZIPA puede publicar nuevas versiones de estos términos; el
uso posterior de la plataforma tras la notificación implica la aceptación de
la versión vigente, y el registro exigirá re-aceptación cuando aplique.`;

const PRIVACY_V1 = `POLÍTICA DE PRIVACIDAD Y TRATAMIENTO DE DATOS — ZIPA (v ${V1})

Conforme a la Ley 1581 de 2012 y sus decretos reglamentarios (Colombia).

1. RESPONSABLE. ZIPA, plataforma de movilidad y envíos. Contacto: el canal de
soporte dentro de la app.

2. DATOS QUE RECOLECTAMOS Y SU FINALIDAD.
 • Identificación (nombre, teléfono, correo): crear y operar tu cuenta.
 • Ubicación (GPS del dispositivo): emparejar servicios, seguimiento en vivo,
   seguridad de la ruta y geocercas de llegada. Los conductores comparten
   ubicación en segundo plano mientras están en línea.
 • Documentos e imágenes (cédula, licencia, SOAT, selfies, fotos de entrega):
   verificación de identidad y cumplimiento normativo del transporte.
 • Datos de uso y del dispositivo (identificadores, token de notificaciones):
   notificaciones push, prevención de fraude y soporte.
 • Datos de pago: procesados por la pasarela (Wompi); ZIPA no almacena
   números de tarjeta.

3. USO DE INTELIGENCIA ARTIFICIAL. Utilizamos algoritmos e inteligencia
artificial para el emparejamiento de servicios, la estimación de rutas y
tarifas y la detección de fraudes y anomalías de seguridad. Puedes solicitar
revisión humana de decisiones automatizadas a través de soporte.

4. COMPARTIR DATOS. Compartimos lo mínimo necesario con: el conductor/cliente
de tu servicio (nombre y referencia de contacto protegida), la empresa de
transporte cuando el servicio lo presta una flota, autoridades cuando la ley
lo exige, y proveedores tecnológicos (almacenamiento, notificaciones,
verificación de identidad y antecedentes) bajo contratos de confidencialidad.

5. TUS DERECHOS (HABEAS DATA). Conocer, actualizar, rectificar y suprimir tus
datos, y revocar la autorización, a través del canal de soporte. Conservamos
los datos el tiempo necesario para las finalidades descritas y las
obligaciones legales (p. ej. registros de viajes).

6. SEGURIDAD. Aplicamos medidas técnicas y organizativas razonables:
comunicación cifrada, números de teléfono enmascarados entre las partes y
control de acceso interno.

7. MENORES. La plataforma no está dirigida a menores de edad.

8. CAMBIOS. Publicaremos las nuevas versiones en la app y la web; el registro
exigirá re-aceptación cuando la versión cambie.`;

// ── Documentos ────────────────────────────────────────────────────────────────

/** Documento vigente del tipo pedido; siembra la v1 si no existe ninguno. */
export async function getActiveLegalDoc(kind: LegalDocKind): Promise<{
  kind: LegalDocKind; version: string; title: string; body: string; publishedAt: string;
}> {
  let doc = await prisma.legalDocument.findFirst({
    where: { kind, active: true },
    orderBy: { publishedAt: 'desc' },
  });
  if (!doc) {
    doc = await prisma.legalDocument.create({
      data: {
        kind,
        version: V1,
        title: kind === 'TERMS' ? 'Términos y Condiciones de Uso' : 'Política de Privacidad',
        body: kind === 'TERMS' ? TERMS_V1 : PRIVACY_V1,
      },
    });
  }
  return {
    kind: doc.kind,
    version: doc.version,
    title: doc.title,
    body: doc.body,
    publishedAt: doc.publishedAt.toISOString(),
  };
}

// ── Consentimientos ───────────────────────────────────────────────────────────

export type ConsentSubject = 'user' | 'driver' | 'operator';

/**
 * Registra la aceptación de los documentos VIGENTES (términos + privacidad)
 * por el sujeto. Best-effort cuando se llama fire-and-forget desde el registro.
 */
export async function recordConsent(
  subjectKind: ConsentSubject,
  subjectId: string,
  ip?: string | null,
): Promise<void> {
  const [terms, privacy] = await Promise.all([
    getActiveLegalDoc('TERMS'),
    getActiveLegalDoc('PRIVACY'),
  ]);
  await prisma.legalConsent.createMany({
    data: [
      { subjectKind, subjectId, docKind: 'TERMS', docVersion: terms.version, ip: ip ?? null },
      { subjectKind, subjectId, docKind: 'PRIVACY', docVersion: privacy.version, ip: ip ?? null },
    ],
  });
}

/** ¿El sujeto ya aceptó la versión VIGENTE de ambos documentos? */
export async function hasCurrentConsent(
  subjectKind: ConsentSubject,
  subjectId: string,
): Promise<boolean> {
  const [terms, privacy] = await Promise.all([
    getActiveLegalDoc('TERMS'),
    getActiveLegalDoc('PRIVACY'),
  ]);
  const [t, p] = await Promise.all([
    prisma.legalConsent.findFirst({
      where: { subjectKind, subjectId, docKind: 'TERMS', docVersion: terms.version },
    }),
    prisma.legalConsent.findFirst({
      where: { subjectKind, subjectId, docKind: 'PRIVACY', docVersion: privacy.version },
    }),
  ]);
  return !!t && !!p;
}

// ── Takedown DMCA ─────────────────────────────────────────────────────────────

export interface TakedownDTO {
  id: string; reporterName: string; reporterEmail: string;
  contentUrl: string; reason: string; status: string;
  createdAt: string; resolvedAt: string | null; resolvedBy: string | null;
}

function _takedownToDTO(t: {
  id: string; reporterName: string; reporterEmail: string; contentUrl: string;
  reason: string; status: string; createdAt: Date; resolvedAt: Date | null; resolvedBy: string | null;
}): TakedownDTO {
  return {
    id: t.id, reporterName: t.reporterName, reporterEmail: t.reporterEmail,
    contentUrl: t.contentUrl, reason: t.reason, status: t.status,
    createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    resolvedBy: t.resolvedBy,
  };
}

export async function createTakedownRequest(dto: {
  reporterName?: string; reporterEmail?: string; contentUrl?: string; reason?: string;
}): Promise<TakedownDTO> {
  const name = dto.reporterName?.trim();
  const email = dto.reporterEmail?.trim();
  const url = dto.contentUrl?.trim();
  const reason = dto.reason?.trim();
  if (!name || !email || !url || !reason) {
    throw new LegalError('Se requieren reporterName, reporterEmail, contentUrl y reason.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new LegalError('El correo del reportante no es válido.');
  }
  const t = await prisma.takedownRequest.create({
    data: {
      reporterName: name.slice(0, 200),
      reporterEmail: email.slice(0, 200),
      contentUrl: url.slice(0, 500),
      reason: reason.slice(0, 2000),
    },
  });
  console.warn(`[DMCA] Nueva solicitud de retiro ${t.id}: ${url}`);
  return _takedownToDTO(t);
}

export async function listTakedowns(): Promise<TakedownDTO[]> {
  const rows = await prisma.takedownRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map(_takedownToDTO);
}

export async function resolveTakedown(
  id: string,
  action: 'REMOVED' | 'REJECTED',
  resolvedBy: string,
): Promise<TakedownDTO | null> {
  const t = await prisma.takedownRequest.findUnique({ where: { id } });
  if (!t) return null;
  const updated = await prisma.takedownRequest.update({
    where: { id },
    data: { status: action, resolvedAt: new Date(), resolvedBy },
  });
  return _takedownToDTO(updated);
}
