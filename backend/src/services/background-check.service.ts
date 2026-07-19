// ── Validación de antecedentes del conductor (env-gated) ──────────────────────
//
// Mismo patrón que KYC/OCR: sin proveedor (BACKGROUND_CHECK_PROVIDER ausente o
// 'none') es NO-OP — el estado queda UNCHECKED y nada cambia. Con proveedor se
// consulta la cédula y se persiste el veredicto:
//   • CLEAR  → sin hallazgos.
//   • HIT    → hallazgo: NUNCA auto-aprueba ni bloquea; marca para que el admin
//              revise y decida (el humano decide siempre).
//   • PENDING→ consulta en curso: jamás bloquea.
//
// Se dispara al enviar el KYC (submitDriverKyc) y a demanda desde el panel
// admin (POST /admin/drivers/:id/background).
//
// Proveedores: 'none' (default) · 'truora' (punto de integración; con llaves se
// implementa la llamada real) · 'fake' (E2E local: cédula terminada en 666 = HIT).

import { BackgroundStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class BackgroundCheckError extends Error {}

export function backgroundProviderName(): string {
  const p = (process.env['BACKGROUND_CHECK_PROVIDER'] ?? '').trim().toLowerCase();
  return p || 'none';
}

interface CheckResult {
  status: BackgroundStatus;
  reference?: string;
}

async function _runProvider(provider: string, documentNumber: string): Promise<CheckResult> {
  // Proveedor de PRUEBAS (E2E local): determinista, jamás en producción.
  if (provider === 'fake') {
    if (process.env['NODE_ENV'] === 'production') return { status: 'PENDING' };
    return documentNumber.endsWith('666')
      ? { status: 'HIT', reference: 'fake-hit-001' }
      : { status: 'CLEAR', reference: 'fake-clear-001' };
  }

  // Punto de integración real (Truora checks de antecedentes en Colombia).
  // Forma esperada al implementar:
  //   const res = await fetch('https://api.checks.truora.com/v1/checks', {
  //     method: 'POST', headers: { 'Truora-API-Key': process.env['TRUORA_API_KEY']! },
  //     body: new URLSearchParams({ national_id: documentNumber, country: 'CO', type: 'background' }) });
  //   → el check es asíncrono: crear = PENDING con reference; un poll/webhook
  //     posterior resuelve CLEAR/HIT según score.
  // Sin implementación/llaves: PENDING con warning — nunca inventar veredictos.
  console.warn(`[Antecedentes] proveedor '${provider}' sin integración implementada → PENDING`);
  return { status: 'PENDING' };
}

export interface BackgroundDTO {
  status: BackgroundStatus;
  provider: string | null;
  reference: string | null;
  checkedAt: string | null;
}

/**
 * Consulta antecedentes del conductor por su cédula y persiste el resultado.
 * NO-OP con proveedor 'none' (devuelve el estado actual sin tocar nada).
 * Best-effort cuando se llama fire-and-forget; lanza solo si falta la cédula
 * y el llamador lo pidió explícito (admin).
 */
export async function checkDriverBackground(driverId: string): Promise<BackgroundDTO> {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: {
      documentNumber: true, backgroundStatus: true,
      backgroundProvider: true, backgroundReference: true, backgroundCheckedAt: true,
    },
  });
  if (!driver) throw new BackgroundCheckError('Conductor no encontrado');

  const provider = backgroundProviderName();
  if (provider === 'none') {
    return {
      status: driver.backgroundStatus,
      provider: driver.backgroundProvider,
      reference: driver.backgroundReference,
      checkedAt: driver.backgroundCheckedAt?.toISOString() ?? null,
    };
  }
  if (!driver.documentNumber) {
    throw new BackgroundCheckError('El conductor no tiene número de cédula registrado.');
  }

  const result = await _runProvider(provider, driver.documentNumber);
  const updated = await prisma.driver.update({
    where: { id: driverId },
    data: {
      backgroundStatus: result.status,
      backgroundProvider: provider,
      backgroundReference: result.reference ?? null,
      backgroundCheckedAt: new Date(),
    },
    select: {
      backgroundStatus: true, backgroundProvider: true,
      backgroundReference: true, backgroundCheckedAt: true,
    },
  });
  if (result.status === 'HIT') {
    console.warn(`[Antecedentes] HIT driver=${driverId} (ref=${result.reference ?? '—'}) → revisión del admin`);
  }
  return {
    status: updated.backgroundStatus,
    provider: updated.backgroundProvider,
    reference: updated.backgroundReference,
    checkedAt: updated.backgroundCheckedAt?.toISOString() ?? null,
  };
}
