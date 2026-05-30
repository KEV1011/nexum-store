import { Router } from 'express';
import { clientAuthMiddleware } from '../middleware/client-auth.middleware';
import {
  sendClientOtp,
  verifyClientOtp,
  getClientBusinesses,
  getClientBusinessById,
  placeClientOrder,
  getClientOrders,
  getClientOrderById,
} from '../services/client.service';

const router = Router();

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.post('/auth/send-otp', (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    res.status(400).json({ success: false, error: 'phone is required' });
    return;
  }
  try {
    sendClientOtp(phone);
    res.json({ success: true, data: { success: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error sending OTP';
    res.status(400).json({ success: false, error: msg });
  }
});

router.post('/auth/verify-otp', (req, res) => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };
  if (!phone || !otp) {
    res.status(400).json({ success: false, error: 'phone and otp are required' });
    return;
  }
  try {
    const result = verifyClientOtp(phone, otp);
    res.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Verification failed';
    res.status(401).json({ success: false, error: msg });
  }
});

// ─── Businesses ───────────────────────────────────────────────────────────────

router.get('/businesses', (_req, res) => {
  res.json({ success: true, data: getClientBusinesses() });
});

router.get('/businesses/:id', (req, res) => {
  try {
    res.json({ success: true, data: getClientBusinessById(req.params['id']!) });
  } catch (err) {
    res.status(404).json({ success: false, error: 'Business not found' });
  }
});

// ─── Orders (auth required) ───────────────────────────────────────────────────

router.post('/orders', clientAuthMiddleware, (req, res) => {
  const clientId = req.clientId!;
  const clientPhone = req.clientPhone!;
  const dto = req.body as { businessId?: string; deliveryAddress?: string; items?: unknown[] };

  if (!dto.businessId || !dto.deliveryAddress || !Array.isArray(dto.items) || dto.items.length === 0) {
    res.status(400).json({ success: false, error: 'businessId, deliveryAddress and items are required' });
    return;
  }

  try {
    const order = placeClientOrder(clientId, clientPhone, {
      businessId: dto.businessId,
      deliveryAddress: dto.deliveryAddress,
      items: dto.items as Array<{ productId: string; quantity: number; unitPrice: number }>,
    });
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to place order';
    res.status(400).json({ success: false, error: msg });
  }
});

router.get('/orders', clientAuthMiddleware, (req, res) => {
  res.json({ success: true, data: getClientOrders(req.clientId!) });
});

router.get('/orders/:id', clientAuthMiddleware, (req, res) => {
  const order = getClientOrderById(req.clientId!, req.params['id']!);
  if (!order) { res.status(404).json({ success: false, error: 'Order not found' }); return; }
  res.json({ success: true, data: order });
});

export default router;
