// ── OCR de documentos del conductor (env-gated) ───────────────────────────────
//
// Mismo patrón que KYC/Wompi/S3: sin proveedor configurado (OCR_PROVIDER ausente
// o 'none') es un NO-OP seguro — la revisión sigue siendo 100 % manual, igual
// que hoy. Con proveedor, al subir un documento se extraen número/nombre/fecha
// de vencimiento y:
//   • se autollenan `expiresAt` (solo si el conductor no lo escribió) y los
//     campos extraídos (`ocrFields`/`ocrConfidence`) para que el admin los vea
//     junto a la imagen al revisar;
//   • si el nombre extraído NO se parece al del conductor → flag antifraude
//     (marca para revisión, jamás bloquea).
//
// Proveedores: 'none' (default) · 'truora' | 'metamap' | 'azure-di' (puntos de
// integración: al configurar llaves se implementa la llamada real; mientras
// tanto caen a no-op con warning — nunca inventan datos) · 'fake' (solo para
// pruebas locales/E2E: devuelve campos deterministas).

import { DocumentType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface OcrFields {
  documentNumber?: string;
  fullName?: string;
  /** ISO yyyy-mm-dd */
  expiresAt?: string;
  plate?: string;
}

export interface OcrResult {
  fields: OcrFields;
  confidence: number | null;
}

/** Proveedor configurado ('none' = OCR apagado, revisión manual). */
export function ocrProviderName(): string {
  const p = (process.env['OCR_PROVIDER'] ?? '').trim().toLowerCase();
  return p || 'none';
}

async function _runProvider(
  provider: string,
  kind: DocumentType,
  fileUrl: string,
): Promise<OcrResult> {
  if (provider === 'none') return { fields: {}, confidence: null };

  // Proveedor de PRUEBAS (E2E local): campos deterministas, jamás en producción.
  if (provider === 'fake') {
    if (process.env['NODE_ENV'] === 'production') return { fields: {}, confidence: null };
    return {
      fields: {
        documentNumber: '1090123456',
        fullName: 'CONDUCTOR DE PRUEBA OCR',
        expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
        ...(kind === 'PROPERTY_CARD' ? { plate: 'ABC123' } : {}),
      },
      confidence: 0.98,
    };
  }

  // Punto de integración real (Truora / Metamap / Azure Document Intelligence).
  // Forma esperada al implementar (ejemplo Truora):
  //   const res = await fetch(`${BASE}/v1/ocr`, { method: 'POST',
  //     headers: { 'Truora-API-Key': process.env['TRUORA_API_KEY']! },
  //     body: JSON.stringify({ document_url: fileUrl, type: kind }) });
  //   → mapear a { fields: { documentNumber, fullName, expiresAt }, confidence }
  // Sin implementación/llaves: no-op con warning — NUNCA inventar datos.
  console.warn(`[OCR] proveedor '${provider}' sin integración implementada (${kind}, ${fileUrl.slice(0, 60)}…) → sin extracción`);
  return { fields: {}, confidence: null };
}

/** Normaliza para comparar nombres (mayúsculas, sin tildes ni dobles espacios). */
function _norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-ZÑ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿El nombre extraído se parece al registrado? (todas las palabras de uno en el otro). */
function _namesMatch(a: string, b: string): boolean {
  const wa = _norm(a).split(' ').filter((w) => w.length > 2);
  const wb = new Set(_norm(b).split(' '));
  if (wa.length === 0) return true;
  const hits = wa.filter((w) => wb.has(w)).length;
  return hits >= Math.min(2, wa.length);
}

export interface OcrOutcome {
  /** Fecha a usar: la del conductor si la escribió; si no, la del OCR. */
  expiresAt: string | null;
  ocrFields: string | null;
  ocrConfidence: number | null;
}

/**
 * Corre el OCR sobre un documento recién subido. Best-effort: cualquier error
 * devuelve el resultado vacío (la subida jamás falla por el OCR). El mismatch
 * de nombre incrementa `fraudFlags` (marca, no bloquea).
 */
export async function runDocumentOcr(
  driverId: string,
  kind: DocumentType,
  fileUrl: string,
  userExpiresAt: string | null | undefined,
): Promise<OcrOutcome> {
  const provider = ocrProviderName();
  const empty: OcrOutcome = {
    expiresAt: userExpiresAt ?? null,
    ocrFields: null,
    ocrConfidence: null,
  };
  if (provider === 'none') return empty;

  try {
    const result = await _runProvider(provider, kind, fileUrl);
    const hasFields = Object.keys(result.fields).length > 0;
    if (!hasFields) return empty;

    // Antifraude: el nombre del documento no corresponde al del conductor.
    if (result.fields.fullName) {
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        select: { name: true },
      });
      if (driver && !_namesMatch(result.fields.fullName, driver.name)) {
        void prisma.driver
          .update({ where: { id: driverId }, data: { fraudFlags: { increment: 1 } } })
          .catch(() => undefined);
        console.warn(
          `[OCR] nombre del documento no coincide (driver=${driverId}): '${result.fields.fullName}' vs registro`,
        );
      }
    }

    return {
      // La fecha del conductor manda; el OCR solo llena el vacío.
      expiresAt: userExpiresAt ?? result.fields.expiresAt ?? null,
      ocrFields: JSON.stringify(result.fields),
      ocrConfidence: result.confidence,
    };
  } catch (err) {
    console.warn(`[OCR] extracción falló (${kind}):`, err instanceof Error ? err.message : err);
    return empty;
  }
}
