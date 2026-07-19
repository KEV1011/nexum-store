import { ComplianceStatus, DocumentType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { sendPushToDriver } from './push.service';

// ─────────────────────────────────────────────────────────────────────────────
// Vencimiento de documentos del conductor (SOAT, licencia…) + KILL-SWITCH.
//
// Un chequeo diario recorre los documentos APROBADOS con fecha de vencimiento:
//  1. Notifica por push al conductor cuando faltan WARN_DAYS días o menos, y
//     cuando ya venció (recordatorio de renovación).
//  2. Recalcula el `complianceStatus` del conductor: CLEAR / EXPIRING / BLOCKED.
//     BLOCKED = algún documento OBLIGATORIO vencido.
//
// El BLOQUEO REAL (caerse del matching + no poder ponerse en línea + forzar
// OFFLINE) solo aplica con DOC_KILL_SWITCH_ENFORCE=true (env-gated, default
// false → en el piloto solo se marca y notifica, sin bloquear de golpe a los
// conductores existentes — mismo patrón que KYC_ENFORCE).
//
// El estado se recalcula también al subir/renovar un documento y cuando el
// admin lo aprueba o rechaza (hooks en driver-profile.service), de modo que la
// renovación desbloquea sin esperar al barrido diario.
// ─────────────────────────────────────────────────────────────────────────────

const WARN_DAYS = 30;

/** Documentos cuyo vencimiento BLOQUEA (la foto de perfil nunca bloquea). */
const MANDATORY_TYPES: DocumentType[] = [
  DocumentType.CEDULA,
  DocumentType.LICENSE,
  DocumentType.SOAT,
  DocumentType.PROPERTY_CARD,
];

const DOC_LABELS: Record<string, string> = {
  CEDULA: 'Cédula',
  LICENSE: 'Licencia de conducción',
  SOAT: 'SOAT',
  PROPERTY_CARD: 'Tarjeta de propiedad',
  PROFILE_PHOTO: 'Foto de perfil',
};

/** El bloqueo automático solo se APLICA cuando se activa explícitamente. */
export function docKillSwitchEnforced(): boolean {
  return (process.env['DOC_KILL_SWITCH_ENFORCE'] ?? 'false').toLowerCase() === 'true';
}

// Inyección WS (patrón del repo: los servicios no importan sockets).
let _sendToDriver: ((driverId: string, msg: Record<string, unknown>) => void) | null = null;

export function registerComplianceSendToDriver(
  fn: (driverId: string, msg: Record<string, unknown>) => void,
): void {
  _sendToDriver = fn;
}

function _parseExpiry(raw: string): Date | null {
  // Acepta ISO (2026-08-01) y variantes parseables por Date.
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Recalcular cumplimiento de UN conductor ─────────────────────────────────

/**
 * Recalcula `complianceStatus` a partir de los documentos APROBADOS del
 * conductor. Notifica (WS + push) SOLO en transiciones: al quedar BLOCKED y al
 * salir de BLOCKED. Con enforce activo, quedar BLOCKED fuerza OFFLINE.
 * Devuelve el estado resultante.
 */
export async function evaluateDriverCompliance(driverId: string): Promise<ComplianceStatus> {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { complianceStatus: true, status: true },
  });
  if (!driver) return ComplianceStatus.CLEAR;

  const docs = await prisma.driverDocument.findMany({
    where: {
      driverId,
      type: { in: MANDATORY_TYPES },
      status: 'APPROVED',
      expiresAt: { not: null },
    },
    select: { type: true, expiresAt: true },
  });

  const now = Date.now();
  const expired: string[] = [];
  const expiring: string[] = [];
  for (const doc of docs) {
    const exp = _parseExpiry(doc.expiresAt!);
    if (!exp) continue;
    const daysLeft = Math.ceil((exp.getTime() - now) / 86_400_000);
    const label = DOC_LABELS[doc.type] ?? doc.type;
    if (daysLeft < 0) expired.push(label);
    else if (daysLeft <= WARN_DAYS) expiring.push(label);
  }

  const next: ComplianceStatus = expired.length
    ? ComplianceStatus.BLOCKED
    : expiring.length
      ? ComplianceStatus.EXPIRING
      : ComplianceStatus.CLEAR;

  if (next === driver.complianceStatus) return next;

  const becameBlocked = next === ComplianceStatus.BLOCKED;
  const leftBlocked = driver.complianceStatus === ComplianceStatus.BLOCKED;
  const reason = becameBlocked ? `Documento(s) vencido(s): ${expired.join(', ')}` : null;

  await prisma.driver.update({
    where: { id: driverId },
    data: {
      complianceStatus: next,
      blockedReason: reason,
      blockedAt: becameBlocked ? new Date() : null,
      // Con enforce, un conductor bloqueado no puede seguir EN LÍNEA.
      ...(becameBlocked && docKillSwitchEnforced() && driver.status === 'ONLINE'
        ? { status: 'OFFLINE' as const }
        : {}),
    },
  });

  if (becameBlocked) {
    _sendToDriver?.(driverId, {
      type: 'compliance_update',
      status: 'BLOCKED',
      reason,
      enforced: docKillSwitchEnforced(),
    });
    await sendPushToDriver(driverId, {
      title: 'Cuenta suspendida por documentos vencidos',
      body: `${reason}. Renuévalo(s) en la app para volver a recibir servicios.`,
      data: { type: 'compliance_blocked' },
    });
  } else if (leftBlocked) {
    _sendToDriver?.(driverId, { type: 'compliance_update', status: next, reason: null });
    await sendPushToDriver(driverId, {
      title: 'Cuenta reactivada',
      body: 'Tus documentos están al día. Ya puedes conectarte y recibir servicios.',
      data: { type: 'compliance_cleared' },
    });
  }
  return next;
}

/** Consulta rápida para el gate de ponerse EN LÍNEA. */
export async function getDriverCompliance(
  driverId: string,
): Promise<{ status: ComplianceStatus; reason: string | null }> {
  const d = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { complianceStatus: true, blockedReason: true },
  });
  return { status: d?.complianceStatus ?? ComplianceStatus.CLEAR, reason: d?.blockedReason ?? null };
}

/** Desbloqueo manual del admin (override). OJO: si el documento sigue vencido,
 *  el barrido diario vuelve a bloquear — corrige también el documento. */
export async function adminClearCompliance(driverId: string): Promise<void> {
  await prisma.driver.update({
    where: { id: driverId },
    data: { complianceStatus: 'CLEAR', blockedReason: null, blockedAt: null },
  });
}

// ─── Barrido diario ──────────────────────────────────────────────────────────

export interface ExpiryCheckResult {
  scanned: number;
  expiringSoon: number;
  expired: number;
  blocked: number;
}

export async function checkExpiringDocuments(): Promise<ExpiryCheckResult> {
  const docs = await prisma.driverDocument.findMany({
    where: { status: 'APPROVED', expiresAt: { not: null } },
    select: { id: true, driverId: true, type: true, expiresAt: true },
  });

  const now = Date.now();
  let expiringSoon = 0;
  let expired = 0;
  const driversToEvaluate = new Set<string>();

  for (const doc of docs) {
    const exp = _parseExpiry(doc.expiresAt!);
    if (!exp) continue;
    const daysLeft = Math.ceil((exp.getTime() - now) / 86_400_000);
    const label = DOC_LABELS[doc.type] ?? doc.type;

    if (daysLeft < 0) {
      expired++;
      driversToEvaluate.add(doc.driverId);
      await sendPushToDriver(doc.driverId, {
        title: `Tu ${label} está vencido`,
        body: `Venció hace ${Math.abs(daysLeft)} día(s). Renuévalo y súbelo en la app para seguir recibiendo viajes sin contratiempos.`,
        data: { type: 'document_expired', docType: doc.type },
      });
    } else if (daysLeft <= WARN_DAYS) {
      expiringSoon++;
      driversToEvaluate.add(doc.driverId);
      await sendPushToDriver(doc.driverId, {
        title: `Tu ${label} vence pronto`,
        body: daysLeft === 0
          ? 'Vence hoy. Renuévalo cuanto antes.'
          : `Vence en ${daysLeft} día(s). Renuévalo a tiempo para no quedar inactivo.`,
        data: { type: 'document_expiring', docType: doc.type, daysLeft: String(daysLeft) },
      });
    }
  }

  // Recalcular cumplimiento de los conductores afectados (kill-switch). También
  // de los que estaban EXPIRING/BLOCKED y hoy ya no aparecen (p. ej. el admin
  // corrigió la fecha) — así el estado nunca se queda pegado.
  const stale = await prisma.driver.findMany({
    where: { complianceStatus: { not: 'CLEAR' } },
    select: { id: true },
  });
  for (const d of stale) driversToEvaluate.add(d.id);

  let blocked = 0;
  for (const driverId of driversToEvaluate) {
    const status = await evaluateDriverCompliance(driverId);
    if (status === 'BLOCKED') blocked++;
  }

  if (expiringSoon || expired || blocked) {
    console.log(
      `[Docs] Vencimientos: ${expiringSoon} por vencer, ${expired} vencidos, ` +
        `${blocked} conductor(es) BLOCKED (enforce=${docKillSwitchEnforced()}) de ${docs.length} aprobados`,
    );
  }
  return { scanned: docs.length, expiringSoon, expired, blocked };
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
