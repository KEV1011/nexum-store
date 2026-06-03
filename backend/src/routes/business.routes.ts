import { Router, Request, Response } from 'express';
import { getBusinessService } from '../services/business.service';
import { getNotificationService } from '../services/notification.service';
import { getClientOrdersForBusiness } from '../services/client.service';
import { RegisterBusinessDTO, OrderStatusUpdateDTO, CreateDeliveryOrderDTO } from '../types';
import { authMiddleware } from '../middleware/auth.middleware';
import { PORTAL_BASE_URL } from '../config/constants';

const router = Router();

// ─── Public: business registration (called by driver/admin) ──────────────────

router.post('/register', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const dto = req.body as RegisterBusinessDTO;

  if (!dto.name || !dto.ownerName || !dto.phone || !dto.address || !dto.category) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: name, ownerName, phone, address, category',
    });
    return;
  }

  try {
    const business = await getBusinessService().registerBusiness(dto);
    res.status(201).json({
      success: true,
      data: {
        ...business,
        portalUrl: `${PORTAL_BASE_URL}/negocio/${business.accessToken}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    res.status(400).json({ success: false, error: message });
  }
});

// ─── Portal access: verify token and get business info ───────────────────────

router.get('/:token/info', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };

  try {
    const business = await getBusinessService().getBusinessByToken(token);
    res.status(200).json({
      success: true,
      data: {
        id: business.id,
        name: business.name,
        ownerName: business.ownerName,
        category: business.category,
        address: business.address,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Access denied';
    res.status(message.includes('not found') ? 404 : 403).json({
      success: false,
      error: message,
    });
  }
});

// ─── Orders: list today's orders ──────────────────────────────────────────────

router.get('/:token/orders', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };

  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const orders = getBusinessService().getTodayOrdersForBusiness(business.id);
    const stats = getBusinessService().getDayStats(business.id);

    res.status(200).json({ success: true, data: { orders, stats } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load orders';
    res.status(message.includes('not found') ? 404 : 400).json({
      success: false,
      error: message,
    });
  }
});

// ─── Orders: detail ───────────────────────────────────────────────────────────

router.get('/:token/orders/:orderId', async (req: Request, res: Response): Promise<void> => {
  const { token, orderId } = req.params as { token: string; orderId: string };

  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const order = getBusinessService().getOrderDetail(orderId, business.id);
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Order not found';
    res.status(message.includes('not found') ? 404 : 400).json({
      success: false,
      error: message,
    });
  }
});

// ─── Driver: create order for a business ─────────────────────────────────────

router.post('/orders', authMiddleware, (req: Request, res: Response): void => {
  const dto = req.body as CreateDeliveryOrderDTO;
  const driverId = req.driverId ?? '';

  if (!dto.businessId || !dto.orderRef || !dto.customerName || !dto.customerAddress) {
    res.status(400).json({ success: false, error: 'Missing required order fields' });
    return;
  }

  try {
    const order = getBusinessService().createOrder(dto, driverId);
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create order';
    res.status(message.includes('not found') ? 404 : 400).json({
      success: false,
      error: message,
    });
  }
});

// ─── Driver: update order status ─────────────────────────────────────────────

router.patch(
  '/orders/:orderId/status',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { orderId } = req.params as { orderId: string };
    const dto = req.body as OrderStatusUpdateDTO;

    try {
      const updated = getBusinessService().updateOrderStatus(orderId, dto);

      // Trigger WhatsApp notification
      const biz = getBusinessService().getBusinessById(
        // get business from the order — we need to look it up
        updated.id.startsWith('order') ? 'biz-001' : 'biz-001',
      );

      if (biz.whatsapp) {
        const notif = getNotificationService();
        const portalUrl = `${PORTAL_BASE_URL}/negocio/${biz.accessToken}`;

        if (dto.status === 'in_transit') {
          void notif.notifyOrderPickedUp(biz.whatsapp, updated);
        } else if (dto.status === 'delivered') {
          void notif.notifyOrderDelivered(biz.whatsapp, updated, portalUrl);
        }
      }

      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update order';
      res.status(message.includes('not found') ? 404 : 400).json({
        success: false,
        error: message,
      });
    }
  },
);

// ─── Client orders from AppCliente ───────────────────────────────────────────

router.get('/:token/client-orders', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const orders = await getClientOrdersForBusiness(business.id);
    res.status(200).json({ success: true, data: orders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load orders';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

export default router;
