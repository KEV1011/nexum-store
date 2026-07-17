import { Router, Request, Response } from 'express';
import {
  getBusinessService,
  getManagedProductsForBusiness,
  createBusinessProduct,
  updateBusinessProduct,
  deleteBusinessProduct,
  updateBusinessCover,
  addProductPhoto,
  deleteProductPhoto,
  setProductOptions,
} from '../services/business.service';
import { getNotificationService } from '../services/notification.service';
import {
  getClientOrdersForBusiness,
  acceptOrderByBusiness,
  rejectOrderByBusiness,
  markOrderReadyByBusiness,
} from '../services/client.service';
import {
  RegisterBusinessDTO,
  OrderStatusUpdateDTO,
  CreateDeliveryOrderDTO,
  CreateProductDTO,
  UpdateProductDTO,
  SetProductOptionsDTO,
} from '../types';
import { authMiddleware } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rate-limit.middleware';
import { documentUpload, fileToUrl } from '../lib/upload';
import { PORTAL_BASE_URL } from '../config/constants';

const router = Router();

// ─── Registro público de negocios ─────────────────────────────────────────────
// Autoservicio desde /negocio/registro (el flujo "lo registra el repartidor"
// se eliminó junto con el business_portal del app). Protegido por rate-limit.

router.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const dto = req.body as RegisterBusinessDTO;

  if (!dto.name || !dto.ownerName || !dto.phone || !dto.address || !dto.category) {
    res.status(400).json({
      success: false,
      error: 'Faltan campos requeridos: nombre, dueño, teléfono, dirección y categoría.',
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
        imageUrl: business.imageUrl,
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
    const [orders, stats] = await Promise.all([
      getBusinessService().getTodayOrdersForBusiness(business.id),
      getBusinessService().getDayStats(business.id),
    ]);

    // El portal (`/negocio/[token]`) renderiza `business.name` en el header:
    // sin este campo la página crashea con "Cannot read properties of
    // undefined (reading 'name')". Se incluye la info mínima del negocio.
    res.status(200).json({
      success: true,
      data: {
        business: { name: business.name, token, imageUrl: business.imageUrl },
        orders,
        stats,
      },
    });
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
    const order = await getBusinessService().getOrderDetail(orderId, business.id);
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

router.post('/orders', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const dto = req.body as CreateDeliveryOrderDTO;
  const driverId = req.driverId ?? '';

  if (!dto.businessId || !dto.orderRef || !dto.customerName || !dto.customerAddress) {
    res.status(400).json({ success: false, error: 'Missing required order fields' });
    return;
  }

  try {
    const order = await getBusinessService().createOrder(dto, driverId);
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
      const updated = await getBusinessService().updateOrderStatus(orderId, dto);

      // Fire WhatsApp notification if business has whatsapp configured
      if (dto.status === 'in_transit' || dto.status === 'delivered') {
        void (async () => {
          try {
            const { prisma } = await import('../lib/prisma');
            const order = await prisma.order.findUnique({ where: { id: orderId }, select: { businessId: true } });
            if (!order) return;
            const biz = await getBusinessService().getBusinessById(order.businessId);
            if (!biz.whatsapp) return;
            const notif = getNotificationService();
            const portalUrl = `${PORTAL_BASE_URL}/negocio/${biz.accessToken}`;
            if (dto.status === 'in_transit') {
              void notif.notifyOrderPickedUp(biz.whatsapp, updated);
            } else {
              void notif.notifyOrderDelivered(biz.whatsapp, updated, portalUrl);
            }
          } catch {
            // non-critical: notification failure should not fail the request
          }
        })();
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

// ─── Gestión del pedido por el restaurante (portal, token-auth) ───────────────
// El restaurante acepta y fija el tiempo de preparación (dispara el despacho),
// rechaza, o marca el pedido listo para recoger.

router.post('/:token/client-orders/:orderId/accept', async (req: Request, res: Response): Promise<void> => {
  const { token, orderId } = req.params as { token: string; orderId: string };
  const prepMinutes = Number((req.body as { prepMinutes?: unknown }).prepMinutes);
  if (!Number.isFinite(prepMinutes) || prepMinutes <= 0) {
    res.status(400).json({ success: false, error: 'prepMinutes (minutos de preparación) es requerido' });
    return;
  }
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const order = await acceptOrderByBusiness(business.id, orderId, prepMinutes);
    if (!order) {
      res.status(409).json({ success: false, error: 'El pedido ya no está pendiente de aceptación' });
      return;
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo aceptar el pedido';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.post('/:token/client-orders/:orderId/reject', async (req: Request, res: Response): Promise<void> => {
  const { token, orderId } = req.params as { token: string; orderId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const order = await rejectOrderByBusiness(business.id, orderId);
    if (!order) {
      res.status(409).json({ success: false, error: 'El pedido ya no se puede rechazar' });
      return;
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo rechazar el pedido';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.post('/:token/client-orders/:orderId/ready', async (req: Request, res: Response): Promise<void> => {
  const { token, orderId } = req.params as { token: string; orderId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const order = await markOrderReadyByBusiness(business.id, orderId);
    if (!order) {
      res.status(409).json({ success: false, error: 'El pedido no se puede marcar como listo' });
      return;
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo marcar el pedido';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// ─── Catálogo del negocio (gestión del dueño, autenticada por el token) ───────
// El token del portal ES la credencial del negocio (mismo modelo que /orders).

// Catálogo COMPLETO (incluye no disponibles) para la vista de gestión.
router.get('/:token/products', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const products = await getManagedProductsForBusiness(business.id);
    res.status(200).json({ success: true, data: products });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo cargar el catálogo';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.post('/:token/products', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const dto = req.body as CreateProductDTO;
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const product = await createBusinessProduct(business.id, dto);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo crear el producto';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.patch('/:token/products/:productId', async (req: Request, res: Response): Promise<void> => {
  const { token, productId } = req.params as { token: string; productId: string };
  const dto = req.body as UpdateProductDTO;
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const product = await updateBusinessProduct(business.id, productId, dto);
    res.status(200).json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo actualizar el producto';
    const notFound = message.includes('not found') || message.includes('no encontrado');
    res.status(notFound ? 404 : 400).json({ success: false, error: message });
  }
});

router.delete('/:token/products/:productId', async (req: Request, res: Response): Promise<void> => {
  const { token, productId } = req.params as { token: string; productId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    await deleteBusinessProduct(business.id, productId);
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo eliminar el producto';
    const notFound = message.includes('not found') || message.includes('no encontrado');
    res.status(notFound ? 404 : 400).json({ success: false, error: message });
  }
});

// Sube la foto de un producto (multipart 'file') y devuelve el producto actualizado.
router.post(
  '/:token/products/:productId/photo',
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const { token, productId } = req.params as { token: string; productId: string };
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
      return;
    }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'La foto debe ser una imagen (JPG, PNG o WebP).' });
      return;
    }
    try {
      const business = await getBusinessService().getBusinessByToken(token);
      const product = await updateBusinessProduct(business.id, productId, {
        imageUrl: fileToUrl(req.file),
      });
      res.status(201).json({ success: true, data: product });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo subir la foto';
      const notFound = message.includes('not found') || message.includes('no encontrado');
      res.status(notFound ? 404 : 400).json({ success: false, error: message });
    }
  },
);

// Reemplaza TODAS las variantes/opciones del producto (el portal guarda todo).
router.put('/:token/products/:productId/options', async (req: Request, res: Response): Promise<void> => {
  const { token, productId } = req.params as { token: string; productId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const product = await setProductOptions(business.id, productId, req.body as SetProductOptionsDTO);
    res.status(200).json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron guardar las opciones';
    const notFound = message.includes('not found') || message.includes('no encontrado');
    res.status(notFound ? 404 : 400).json({ success: false, error: message });
  }
});

// Agrega una foto a la GALERÍA del producto (además de la portada). Multipart 'file'.
router.post(
  '/:token/products/:productId/gallery',
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const { token, productId } = req.params as { token: string; productId: string };
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
      return;
    }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'La foto debe ser una imagen (JPG, PNG o WebP).' });
      return;
    }
    try {
      const business = await getBusinessService().getBusinessByToken(token);
      const product = await addProductPhoto(business.id, productId, fileToUrl(req.file));
      res.status(201).json({ success: true, data: product });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo subir la foto';
      const notFound = message.includes('not found') || message.includes('no encontrado');
      res.status(notFound ? 404 : 400).json({ success: false, error: message });
    }
  },
);

// Elimina una foto de la galería del producto.
router.delete('/:token/products/:productId/gallery/:photoId', async (req: Request, res: Response): Promise<void> => {
  const { token, productId, photoId } = req.params as { token: string; productId: string; photoId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const product = await deleteProductPhoto(business.id, productId, photoId);
    res.status(200).json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo eliminar la foto';
    const notFound = message.includes('not found') || message.includes('no encontrado');
    res.status(notFound ? 404 : 400).json({ success: false, error: message });
  }
});

// Sube la foto de portada del local (multipart 'file') y devuelve el negocio.
router.post(
  '/:token/cover',
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params as { token: string };
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
      return;
    }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'La portada debe ser una imagen (JPG, PNG o WebP).' });
      return;
    }
    try {
      const business = await getBusinessService().getBusinessByToken(token);
      const updated = await updateBusinessCover(business.id, fileToUrl(req.file));
      res.status(201).json({
        success: true,
        data: { name: updated.name, token, imageUrl: updated.imageUrl },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo subir la portada';
      res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
    }
  },
);

export default router;
