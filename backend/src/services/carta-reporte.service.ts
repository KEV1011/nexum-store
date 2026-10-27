// ── Las cartas que los dueños marcan como «se leyó mal» ─────────────────────
//
// Las reglas viven en `lib/carta-reporte.ts`; aquí se escribe y se lee la
// tabla. Nada de esto toca el catálogo del negocio.

import { prisma } from '../lib/prisma';

/** Una respuesta de OCR más grande que esto no se guarda: algo raro pasó. */
const OCR_MAX_BYTES = 4 * 1024 * 1024;
const COMENTARIO_MAX = 1000;

export interface ReporteCartaFila {
  id: string;
  businessId: string;
  negocio: string;
  photoUrl: string | null;
  tieneOcr: boolean;
  filas: number;
  comentario: string | null;
  createdAt: string;
}

export async function crearReporteCarta(input: {
  businessId: string;
  photoUrl: string | null;
  ocrRaw: unknown;
  lectura: unknown;
  comentario: string;
}): Promise<{ id: string; conOcr: boolean }> {
  let ocr = input.ocrRaw ?? null;
  if (ocr !== null && JSON.stringify(ocr).length > OCR_MAX_BYTES) ocr = null;
  const r = await prisma.cartaReporte.create({
    data: {
      businessId: input.businessId,
      photoUrl: input.photoUrl,
      ...(ocr !== null && { ocrRaw: ocr as object }),
      ...(input.lectura != null && { lectura: input.lectura as object }),
      comentario: input.comentario.replace(/\s+/g, ' ').trim().slice(0, COMENTARIO_MAX) || null,
    },
    select: { id: true },
  });
  return { id: r.id, conOcr: ocr !== null };
}

export async function listarReportesCarta(limite = 100): Promise<ReporteCartaFila[]> {
  const filas = await prisma.cartaReporte.findMany({
    orderBy: { createdAt: 'desc' },
    take: limite,
    select: {
      id: true, businessId: true, photoUrl: true, comentario: true, createdAt: true,
      ocrRaw: true, lectura: true, business: { select: { name: true } },
    },
  });
  return filas.map((f) => ({
    id: f.id,
    businessId: f.businessId,
    negocio: f.business.name,
    photoUrl: f.photoUrl,
    tieneOcr: f.ocrRaw != null,
    filas: Array.isArray((f.lectura as { lineas?: unknown } | null)?.lineas)
      ? ((f.lectura as { lineas: unknown[] }).lineas.length)
      : 0,
    comentario: f.comentario,
    createdAt: f.createdAt.toISOString(),
  }));
}

/** Todo el reporte, listo para descargar y volver prueba. */
export async function reporteCartaCompleto(id: string) {
  return prisma.cartaReporte.findUnique({
    where: { id },
    select: {
      id: true, photoUrl: true, comentario: true, createdAt: true, ocrRaw: true, lectura: true,
      business: { select: { id: true, name: true } },
    },
  });
}
