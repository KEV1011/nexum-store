import { randomUUID, createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { sendPushToClient } from './push.service';

const WOMPI_PUBLIC_KEY = process.env['WOMPI_PUBLIC_KEY'] ?? '';
const WOMPI_PRIVATE_KEY = process.env['WOMPI_PRIVATE_KEY'] ?? '';
const WOMPI_EVENTS_SECRET = process.env['WOMPI_EVENTS_SECRET'] ?? '';
// Secreto de integridad del comercio (Wompi → Desarrolladores → Llaves).
// Obligatorio para que el checkout web acepte el link cuando la cuenta tiene
// firma de integridad activada (default en cuentas nuevas).
const WOMPI_INTEGRITY_SECRET = process.env['WOMPI_INTEGRITY_SECRET'] ?? '';
const APP_URL = process.env['APP_URL'] ?? 'http://localhost:3000';

type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'voided';

export interface PaymentRecord {
  id: string;
  referenceCode: string;
  amount: number;
  currency: 'COP';
  description: string;
  clientId: string;
  orderId?: string;
  tripId?: string;
  status: PaymentStatus;
  createdAt: Date;
  paymentUrl: string;
}

/** API base según el ambiente de las llaves (test → sandbox). */
function _wompiApiBase(): string {
  const isTest = WOMPI_PRIVATE_KEY.startsWith('prv_test_') || WOMPI_PUBLIC_KEY.startsWith('pub_test_');
  return isTest ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1';
}

export async function createPaymentLink(
  clientId: string,
  params: {
    amount: number;
    description: string;
    orderId?: string;
    tripId?: string;
    customerEmail?: string;
  },
): Promise<{ paymentId: string; referenceCode: string; paymentUrl: string; amount: number }> {
  const referenceCode = `NX-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const amountCents = Math.round(params.amount * 100);

  let paymentUrl: string;
  if (WOMPI_PUBLIC_KEY) {
    const redirectUrl = encodeURIComponent(`${APP_URL}/payment/result?ref=${referenceCode}`);
    paymentUrl =
      `https://checkout.wompi.co/p/` +
      `?public-key=${WOMPI_PUBLIC_KEY}` +
      `&currency=COP` +
      `&amount-in-cents=${amountCents}` +
      `&reference=${referenceCode}` +
      `&redirect-url=${redirectUrl}`;
    if (WOMPI_INTEGRITY_SECRET) {
      // SHA256(referencia + monto-en-centavos + moneda + secreto de integridad)
      const integrity = createHash('sha256')
        .update(`${referenceCode}${amountCents}COP${WOMPI_INTEGRITY_SECRET}`)
        .digest('hex');
      paymentUrl += `&signature%3Aintegrity=${integrity}`;
    }
  } else {
    paymentUrl = `https://checkout.wompi.co/p/?public-key=pub_test_nexum_demo&currency=COP&amount-in-cents=${amountCents}&reference=${referenceCode}`;
  }

  const payment = await prisma.payment.create({
    data: {
      referenceCode,
      amount: params.amount,
      currency: 'COP',
      description: params.description,
      clientId,
      orderId: params.orderId ?? null,
      tripId: params.tripId ?? null,
      status: 'pending',
      paymentUrl,
    },
  });

  return { paymentId: payment.id, referenceCode: payment.referenceCode, paymentUrl: payment.paymentUrl, amount: payment.amount };
}

/**
 * Aplica un cambio de estado a un pago y dispara los efectos colaterales
 * (push al cliente). Idempotente: re-aplicar el mismo estado no duplica nada.
 */
async function _applyPaymentStatus(referenceCode: string, newStatus: PaymentStatus): Promise<void> {
  const existing = await prisma.payment.findUnique({ where: { referenceCode } });
  if (!existing || existing.status === newStatus) return;

  await prisma.payment.update({ where: { referenceCode }, data: { status: newStatus } });

  if (newStatus === 'approved') {
    void sendPushToClient(existing.clientId, {
      title: 'Pago aprobado',
      body: `Tu pago de $${existing.amount.toLocaleString('es-CO')} fue aprobado. ¡Gracias!`,
      data: { type: 'payment_approved', referenceCode },
    });
  } else if (newStatus === 'rejected') {
    void sendPushToClient(existing.clientId, {
      title: 'Pago rechazado',
      body: 'Tu pago no pudo procesarse. Puedes intentarlo de nuevo desde la app.',
      data: { type: 'payment_rejected', referenceCode },
    });
  }
}

function _mapWompiStatus(status: string | undefined): PaymentStatus {
  return status === 'APPROVED' ? 'approved'
    : status === 'DECLINED' ? 'rejected'
    : status === 'VOIDED' || status === 'ERROR' ? 'voided'
    : 'pending';
}

export async function handleWompiWebhook(body: unknown, signature: string): Promise<{ handled: boolean; referenceCode?: string }> {
  if (WOMPI_EVENTS_SECRET) {
    const evt = body as Record<string, unknown>;
    const data = evt['data'] as Record<string, unknown> | undefined;
    const tx = data?.['transaction'] as Record<string, unknown> | undefined;
    // Wompi checksum: SHA256(id + status + amount_in_cents + eventsSecret) — plain hash, not HMAC.
    const toSign = `${tx?.['id'] ?? ''}${tx?.['status'] ?? ''}${tx?.['amount_in_cents'] ?? ''}${WOMPI_EVENTS_SECRET}`;
    const expected = createHash('sha256').update(toSign).digest('hex');
    if (signature !== expected) return { handled: false };
  }

  const evt = body as Record<string, unknown>;
  const evtType = evt['event'] as string | undefined;
  if (evtType === 'transaction.updated') {
    const data = evt['data'] as Record<string, unknown> | undefined;
    const tx = data?.['transaction'] as Record<string, unknown> | undefined;
    const ref = tx?.['reference'] as string | undefined;
    const status = tx?.['status'] as string | undefined;
    if (ref) {
      await _applyPaymentStatus(ref, _mapWompiStatus(status)).catch(() => { /* payment may not exist */ });
    }
    return { handled: true, referenceCode: ref };
  }
  return { handled: true };
}

/**
 * Reconciliación activa: consulta el estado real de la transacción en la API
 * de Wompi (fallback para webhooks perdidos). Solo actúa sobre pagos
 * `pending` y cuando hay llave privada configurada.
 */
export async function reconcilePayment(referenceCode: string): Promise<void> {
  if (!WOMPI_PRIVATE_KEY) return;
  const payment = await prisma.payment.findUnique({ where: { referenceCode } });
  if (!payment || payment.status !== 'pending') return;

  try {
    const res = await fetch(
      `${_wompiApiBase()}/transactions?reference=${encodeURIComponent(referenceCode)}`,
      { headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` } },
    );
    if (!res.ok) return;
    const body = (await res.json()) as { data?: Array<{ status?: string }> };
    const tx = body.data?.[0];
    if (!tx) return; // el usuario aún no completa el checkout
    const mapped = _mapWompiStatus(tx.status);
    if (mapped !== 'pending') await _applyPaymentStatus(referenceCode, mapped);
  } catch {
    // Red caída o Wompi no disponible: el webhook o el próximo poll resolverá.
  }
}

export async function getPaymentByReference(ref: string): Promise<PaymentRecord | undefined> {
  const p = await prisma.payment.findUnique({ where: { referenceCode: ref } });
  if (!p) return undefined;
  return {
    id: p.id,
    referenceCode: p.referenceCode,
    amount: p.amount,
    currency: p.currency as 'COP',
    description: p.description,
    clientId: p.clientId,
    orderId: p.orderId ?? undefined,
    tripId: p.tripId ?? undefined,
    status: p.status as PaymentStatus,
    createdAt: p.createdAt,
    paymentUrl: p.paymentUrl,
  };
}
