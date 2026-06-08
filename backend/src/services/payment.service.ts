import { randomUUID } from 'crypto';
import { createHmac } from 'crypto';
import { prisma } from '../lib/prisma';

const WOMPI_PUBLIC_KEY = process.env['WOMPI_PUBLIC_KEY'] ?? '';
const WOMPI_PRIVATE_KEY = process.env['WOMPI_PRIVATE_KEY'] ?? '';
const WOMPI_EVENTS_SECRET = process.env['WOMPI_EVENTS_SECRET'] ?? '';
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

export async function handleWompiWebhook(body: unknown, signature: string): Promise<{ handled: boolean; referenceCode?: string }> {
  if (WOMPI_EVENTS_SECRET) {
    const evt = body as Record<string, unknown>;
    const data = evt['data'] as Record<string, unknown> | undefined;
    const tx = data?.['transaction'] as Record<string, unknown> | undefined;
    const toSign = `${tx?.['id'] ?? ''}${tx?.['status'] ?? ''}${tx?.['amount_in_cents'] ?? ''}${WOMPI_EVENTS_SECRET}`;
    const expected = createHmac('sha256', WOMPI_EVENTS_SECRET).update(toSign).digest('hex');
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
      const newStatus: PaymentStatus = status === 'APPROVED' ? 'approved'
        : status === 'DECLINED' ? 'rejected'
        : status === 'VOIDED' ? 'voided'
        : 'pending';
      await prisma.payment.update({
        where: { referenceCode: ref },
        data: { status: newStatus },
      }).catch(() => { /* payment may not exist */ });
    }
    return { handled: true, referenceCode: ref };
  }
  return { handled: true };
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

// Suppress unused variable warning for WOMPI_PRIVATE_KEY (reserved for future server-side use)
void WOMPI_PRIVATE_KEY;
