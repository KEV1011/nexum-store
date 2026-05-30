import { randomUUID } from 'crypto';
import { createHmac } from 'crypto';

const WOMPI_PUBLIC_KEY = process.env['WOMPI_PUBLIC_KEY'] ?? '';
const WOMPI_PRIVATE_KEY = process.env['WOMPI_PRIVATE_KEY'] ?? '';
const WOMPI_EVENTS_SECRET = process.env['WOMPI_EVENTS_SECRET'] ?? '';
const APP_URL = process.env['APP_URL'] ?? 'http://localhost:3000';

interface Payment {
  id: string;
  referenceCode: string;
  amount: number;
  currency: 'COP';
  description: string;
  clientId: string;
  orderId?: string;
  tripId?: string;
  status: 'pending' | 'approved' | 'rejected' | 'voided';
  createdAt: Date;
  paymentUrl: string;
}

const paymentStore = new Map<string, Payment>();

export function createPaymentLink(
  clientId: string,
  params: {
    amount: number;
    description: string;
    orderId?: string;
    tripId?: string;
    customerEmail?: string;
  },
): { paymentId: string; referenceCode: string; paymentUrl: string; amount: number } {
  const referenceCode = `NX-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const amountCents = Math.round(params.amount * 100);
  const id = `pay-${randomUUID().slice(0, 8)}`;

  let paymentUrl: string;
  if (WOMPI_PUBLIC_KEY) {
    // Real Wompi checkout URL
    const redirectUrl = encodeURIComponent(`${APP_URL}/payment/result?ref=${referenceCode}`);
    paymentUrl =
      `https://checkout.wompi.co/p/` +
      `?public-key=${WOMPI_PUBLIC_KEY}` +
      `&currency=COP` +
      `&amount-in-cents=${amountCents}` +
      `&reference=${referenceCode}` +
      `&redirect-url=${redirectUrl}`;
  } else {
    // Demo mode — sandbox URL (no real charge)
    paymentUrl = `https://checkout.wompi.co/p/?public-key=pub_test_nexum_demo&currency=COP&amount-in-cents=${amountCents}&reference=${referenceCode}`;
  }

  const payment: Payment = {
    id, referenceCode, amount: params.amount, currency: 'COP',
    description: params.description, clientId,
    orderId: params.orderId, tripId: params.tripId,
    status: 'pending', createdAt: new Date(), paymentUrl,
  };

  paymentStore.set(id, payment);
  paymentStore.set(referenceCode, payment);

  return { paymentId: id, referenceCode, paymentUrl, amount: params.amount };
}

export function handleWompiWebhook(body: unknown, signature: string): { handled: boolean; referenceCode?: string } {
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
      const payment = paymentStore.get(ref);
      if (payment) {
        payment.status = status === 'APPROVED' ? 'approved'
          : status === 'DECLINED' ? 'rejected'
          : status === 'VOIDED' ? 'voided'
          : 'pending';
      }
    }
    return { handled: true, referenceCode: ref };
  }
  return { handled: true };
}

export function getPaymentByReference(ref: string): Payment | undefined {
  return paymentStore.get(ref);
}

// Suppress unused variable warning for WOMPI_PRIVATE_KEY (reserved for future server-side use)
void WOMPI_PRIVATE_KEY;
