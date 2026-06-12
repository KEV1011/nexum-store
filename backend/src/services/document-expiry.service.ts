import { prisma } from '../lib/prisma';
import { sendPushToDriver } from './push.service';

// ─────────────────────────────────────────────────────────────────────────────
// Vencimiento de documentos del conductor (SOAT, licencia…).
//
// Un chequeo diario recorre los documentos APROBADOS con fecha de vencimiento
// y notifica por push al conductor cuando faltan WARN_DAYS días o menos, y
// cuando ya venció. No bloquea automáticamente al conductor: esa decisión
// queda en manos del admin (panel /admin), que ve el mismo estado.
//
// La notificación se repite como máximo una vez por ejecución diaria; tras un
// reinicio del servidor puede repetirse ese día — aceptable para el piloto.
// ─────────────────────────────────────────────────────────────────────────────

const WARN_DAYS = 30;

const DOC_LABELS: Record<string, string> = {
  CEDULA: 'Cédula',
  LICENSE: 'Licencia de conducción',
  SOAT: 'SOAT',
  PROPERTY_CARD: 'Tarjeta de propiedad',
  PROFILE_PHOTO: 'Foto de perfil',
};

function _parseExpiry(raw: string): Date | null {
  // Acepta ISO (2026-08-01) y variantes parseables por Date.
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface ExpiryCheckResult {
  scanned: number;
  expiringSoon: number;
  expired: number;
}

export async function checkExpiringDocuments(): Promise<ExpiryCheckResult> {
  const docs = await prisma.driverDocument.findMany({
    where: { status: 'APPROVED', expiresAt: { not: null } },
    select: { id: true, driverId: true, type: true, expiresAt: true },
  });

  const now = Date.now();
  let expiringSoon = 0;
  let expired = 0;

  for (const doc of docs) {
    const exp = _parseExpiry(doc.expiresAt!);
    if (!exp) continue;
    const daysLeft = Math.ceil((exp.getTime() - now) / 86_400_000);
    const label = DOC_LABELS[doc.type] ?? doc.type;

    if (daysLeft < 0) {
      expired++;
      await sendPushToDriver(doc.driverId, {
        title: `Tu ${label} está vencido`,
        body: `Venció hace ${Math.abs(daysLeft)} día(s). Renuévalo y súbelo en la app para seguir recibiendo viajes sin contratiempos.`,
        data: { type: 'document_expired', docType: doc.type },
      });
    } else if (daysLeft <= WARN_DAYS) {
      expiringSoon++;
      await sendPushToDriver(doc.driverId, {
        title: `Tu ${label} vence pronto`,
        body: daysLeft === 0
          ? 'Vence hoy. Renuévalo cuanto antes.'
          : `Vence en ${daysLeft} día(s). Renuévalo a tiempo para no quedar inactivo.`,
        data: { type: 'document_expiring', docType: doc.type, daysLeft: String(daysLeft) },
      });
    }
  }

  if (expiringSoon || expired) {
    console.log(`[Docs] Vencimientos: ${expiringSoon} por vencer, ${expired} vencidos (de ${docs.length} aprobados)`);
  }
  return { scanned: docs.length, expiringSoon, expired };
}

const DAILY_MS = 24 * 60 * 60 * 1000;

/** Programa el chequeo diario (y uno inicial poco después de arrancar). */
export function scheduleDocumentExpiryChecks(): void {
  setTimeout(() => {
    void checkExpiringDocuments().catch((err) =>
      console.error('[Docs] Chequeo inicial falló:', err instanceof Error ? err.message : err),
    );
  }, 30_000);
  setInterval(() => {
    void checkExpiringDocuments().catch((err) =>
      console.error('[Docs] Chequeo diario falló:', err instanceof Error ? err.message : err),
    );
  }, DAILY_MS);
}
