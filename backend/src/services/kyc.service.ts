// ── KYC / verificación de identidad del conductor ────────────────────────────
//
// Modelo env-gated (mismo patrón que OTP/Wompi/S3/FCM): si hay un proveedor
// configurado (KYC_PROVIDER + llaves), se llama para validar la identidad contra
// registros oficiales + selfie/liveness. Sin proveedor, la verificación queda en
// IN_REVIEW para que el admin la apruebe/rechace a mano desde el panel.
//
// El gating de "habilitado para conducir" (isVerified de documentos + kycStatus
// VERIFIED) solo se EXIGE cuando KYC_ENFORCE=true — así se puede desplegar el
// código sin bloquear de golpe a los conductores actuales (kycStatus=PENDING).

import { KycStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class KycError extends Error {}

/** Proveedor configurado ('manual' si no hay ninguno externo). */
export function kycProviderName(): string {
  const p = (process.env['KYC_PROVIDER'] ?? '').trim().toLowerCase();
  return p || 'manual';
}

/** El gating de conducir exige KYC verificado solo si se activa explícitamente. */
export function kycEnforced(): boolean {
  return (process.env['KYC_ENFORCE'] ?? 'false').toLowerCase() === 'true';
}

export interface KycStatusDTO {
  status: KycStatus;
  provider: string | null;
  hasSelfie: boolean;
  checkedAt: string | null;
  /** true si el conductor ya puede enviar la verificación (tiene selfie + datos). */
  canSubmit: boolean;
  enforced: boolean;
}

export async function getDriverKyc(driverId: string): Promise<KycStatusDTO> {
  const d = await prisma.driver.findUnique({
    where: { id: driverId },
    select: {
      kycStatus: true, kycProvider: true, kycCheckedAt: true,
      selfieUrl: true, documentNumber: true, licenseNumber: true,
    },
  });
  if (!d) throw new KycError('Conductor no encontrado');
  return {
    status: d.kycStatus,
    provider: d.kycProvider,
    hasSelfie: !!d.selfieUrl,
    checkedAt: d.kycCheckedAt?.toISOString() ?? null,
    canSubmit: !!d.selfieUrl && (!!d.documentNumber || !!d.licenseNumber),
    enforced: kycEnforced(),
  };
}

/** Guarda la URL de la selfie subida por el conductor. */
export async function setDriverSelfie(driverId: string, selfieUrl: string): Promise<void> {
  await prisma.driver.update({ where: { id: driverId }, data: { selfieUrl } });
}

/**
 * El conductor envía su verificación de identidad. Con proveedor externo se
 * dispara la validación real (cédula/licencia + selfie); sin proveedor pasa a
 * IN_REVIEW para revisión manual del admin. Idempotente: si ya está VERIFIED no
 * hace nada.
 */
export async function submitDriverKyc(driverId: string): Promise<KycStatusDTO> {
  const d = await prisma.driver.findUnique({
    where: { id: driverId },
    select: {
      kycStatus: true, selfieUrl: true, name: true,
      documentNumber: true, licenseNumber: true,
    },
  });
  if (!d) throw new KycError('Conductor no encontrado');
  if (d.kycStatus === 'VERIFIED') return getDriverKyc(driverId);
  if (!d.selfieUrl) throw new KycError('Sube primero una selfie para la verificación.');
  if (!d.documentNumber && !d.licenseNumber) {
    throw new KycError('Falta el número de cédula o licencia para verificar tu identidad.');
  }

  const provider = kycProviderName();
  const result = await _runProvider(provider, {
    driverId,
    fullName: d.name,
    documentNumber: d.documentNumber,
    licenseNumber: d.licenseNumber,
    selfieUrl: d.selfieUrl,
  });

  await prisma.driver.update({
    where: { id: driverId },
    data: {
      kycStatus: result.status,
      kycProvider: provider,
      kycReference: result.reference ?? null,
      kycCheckedAt: new Date(),
    },
  });
  // Si el proveedor confirmó, sincroniza el flag de habilitación por si los
  // documentos ya estaban aprobados.
  return getDriverKyc(driverId);
}

/** El admin fija el resultado de la verificación (revisión manual o corrección). */
export async function setDriverKycStatus(
  driverId: string,
  status: 'VERIFIED' | 'REJECTED' | 'IN_REVIEW',
  reference?: string,
): Promise<KycStatusDTO> {
  const d = await prisma.driver.findUnique({ where: { id: driverId }, select: { id: true } });
  if (!d) throw new KycError('Conductor no encontrado');
  await prisma.driver.update({
    where: { id: driverId },
    data: {
      kycStatus: status as KycStatus,
      kycProvider: 'manual',
      kycReference: reference ?? null,
      kycCheckedAt: new Date(),
    },
  });
  return getDriverKyc(driverId);
}

/**
 * Un conductor está HABILITADO PARA CONDUCIR si sus documentos están aprobados
 * (isVerified) y, cuando el gating KYC está activo, su identidad está VERIFIED.
 * Con KYC_ENFORCE=false se comporta como antes (solo documentos).
 */
export async function isDriverCleared(driverId: string): Promise<boolean> {
  const d = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { isVerified: true, kycStatus: true },
  });
  if (!d) return false;
  if (!d.isVerified) return false;
  if (kycEnforced() && d.kycStatus !== 'VERIFIED') return false;
  return true;
}

// ── Proveedor de KYC (abstracción) ────────────────────────────────────────────

interface KycInput {
  driverId: string;
  fullName: string;
  documentNumber: string | null;
  licenseNumber: string | null;
  selfieUrl: string;
}
interface KycResult {
  status: KycStatus;
  reference?: string;
}

/**
 * Ejecuta la verificación con el proveedor configurado. Hoy soporta:
 *  - 'manual' (default): sin proveedor externo → IN_REVIEW (lo aprueba el admin).
 *  - '<otro>': punto de integración para Truora/Metamap/etc. — cuando se
 *    configuren las llaves, se implementa la llamada real aquí y se devuelve el
 *    veredicto. Mientras no haya integración, cae a IN_REVIEW (nunca auto-aprueba).
 */
async function _runProvider(provider: string, input: KycInput): Promise<KycResult> {
  if (provider === 'manual') {
    return { status: 'IN_REVIEW' };
  }
  // Punto de integración real (Truora, Metamap, RUNT…). Ejemplo de forma:
  //   const res = await fetch(`${BASE}/checks`, { headers: { 'Truora-API-Key': KEY },
  //     method: 'POST', body: JSON.stringify({ national_id: input.documentNumber, ... }) });
  //   → mapear a { status: 'VERIFIED'|'REJECTED'|'IN_REVIEW', reference }
  // Sin implementación/llaves, jamás auto-aprobamos: queda en revisión manual.
  console.warn(
    `[KYC] proveedor '${provider}' sin integración implementada (driver=${input.driverId}) → revisión manual`,
  );
  return { status: 'IN_REVIEW' };
}
