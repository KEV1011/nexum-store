// ── KYC / verificación de identidad del PASAJERO (anti-robo) ──────────────────
//
// Mismo modelo env-gated que el KYC del conductor. El pasajero sube una selfie y
// envía su verificación; sin proveedor externo queda IN_REVIEW para que el admin
// la apruebe. El conductor ve "cliente verificado" en la oferta del viaje, para
// decidir con confianza. `CLIENT_KYC_ENFORCE` puede exigirla para pedir viajes.

import { KycStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class ClientKycError extends Error {}

export function clientKycProviderName(): string {
  const p = (process.env['KYC_PROVIDER'] ?? '').trim().toLowerCase();
  return p || 'manual';
}

export function clientKycEnforced(): boolean {
  return (process.env['CLIENT_KYC_ENFORCE'] ?? 'false').toLowerCase() === 'true';
}

export interface ClientKycDTO {
  status: KycStatus;
  hasSelfie: boolean;
  canSubmit: boolean;
  checkedAt: string | null;
  enforced: boolean;
}

export async function getClientKyc(clientId: string): Promise<ClientKycDTO> {
  const u = await prisma.user.findUnique({
    where: { id: clientId },
    select: { kycStatus: true, selfieUrl: true, kycCheckedAt: true, name: true },
  });
  if (!u) throw new ClientKycError('Usuario no encontrado');
  return {
    status: u.kycStatus,
    hasSelfie: !!u.selfieUrl,
    canSubmit: !!u.selfieUrl && !!u.name,
    checkedAt: u.kycCheckedAt?.toISOString() ?? null,
    enforced: clientKycEnforced(),
  };
}

export async function setClientSelfie(clientId: string, selfieUrl: string): Promise<void> {
  await prisma.user.update({ where: { id: clientId }, data: { selfieUrl } });
}

export async function submitClientKyc(clientId: string): Promise<ClientKycDTO> {
  const u = await prisma.user.findUnique({
    where: { id: clientId },
    select: { kycStatus: true, selfieUrl: true, name: true },
  });
  if (!u) throw new ClientKycError('Usuario no encontrado');
  if (u.kycStatus === 'VERIFIED') return getClientKyc(clientId);
  if (!u.selfieUrl) throw new ClientKycError('Sube primero una selfie para la verificación.');
  if (!u.name) throw new ClientKycError('Agrega tu nombre en el perfil antes de verificarte.');

  const provider = clientKycProviderName();
  // Sin proveedor externo: revisión manual del admin (nunca auto-aprueba).
  const status: KycStatus = 'IN_REVIEW';
  if (provider !== 'manual') {
    console.warn(`[KYC-cliente] proveedor '${provider}' sin integración (client=${clientId}) → revisión manual`);
  }

  await prisma.user.update({
    where: { id: clientId },
    data: { kycStatus: status, kycProvider: provider, kycCheckedAt: new Date() },
  });
  return getClientKyc(clientId);
}

/** El admin fija el resultado de la verificación del cliente (revisión manual). */
export async function setClientKycStatus(
  clientId: string,
  status: 'VERIFIED' | 'REJECTED' | 'IN_REVIEW',
): Promise<ClientKycDTO> {
  const u = await prisma.user.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!u) throw new ClientKycError('Usuario no encontrado');
  await prisma.user.update({
    where: { id: clientId },
    data: { kycStatus: status as KycStatus, kycProvider: 'manual', kycCheckedAt: new Date() },
  });
  return getClientKyc(clientId);
}

/** ¿Puede el cliente pedir viajes? Solo se exige verificación si CLIENT_KYC_ENFORCE. */
export async function isClientCleared(clientId: string): Promise<boolean> {
  if (!clientKycEnforced()) return true;
  const u = await prisma.user.findUnique({ where: { id: clientId }, select: { kycStatus: true } });
  return u?.kycStatus === 'VERIFIED';
}
