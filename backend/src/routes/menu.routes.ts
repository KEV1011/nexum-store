// ── La carta pública del local (QR de la mesa) ────────────────────────────────
//
// Rutas SIN autenticación a propósito: el comensal está sentado en el local y
// no va a instalar nada para almorzar. Lo que las protege es que el código de
// la carta no es el token del dueño (solo abre la carta) y que una mesa que el
// dueño no declaró no puede pedir.

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  calificarPedidoEnMesa,
  crearPedidoEnMesa,
  getCartaPublica,
  getPedidoEnMesa,
} from '../services/mesa.service';

const router = Router();

/**
 * Límite de pedidos desde la carta pública.
 *
 * Es por IP y **el restaurante entero comparte una sola**: todos los comensales
 * salen por el wifi del local. Un límite estrecho dejaría sin pedir a la mesa 8
 * porque las otras siete ya pidieron, así que es holgado a propósito. Lo que de
 * verdad filtra un pedido falso es la cocina, que lo ve y lo rechaza.
 */
const cartaLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: Number(process.env['RATE_LIMIT_CARTA'] ?? 120),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Muchos pedidos desde esta red en pocos minutos. Espera un momento o pide con el mesero.',
  },
});

function fallo(res: Response, err: unknown, porDefecto: string): void {
  const message = err instanceof Error ? err.message : porDefecto;
  const noExiste = /no existe|no encontrad/i.test(message);
  res.status(noExiste ? 404 : 400).json({ success: false, error: message });
}

// GET /carta/:codigo → la carta del local y sus mesas
router.get('/:codigo', async (req: Request, res: Response): Promise<void> => {
  const { codigo } = req.params as { codigo: string };
  try {
    res.status(200).json({ success: true, data: await getCartaPublica(codigo) });
  } catch (err) {
    fallo(res, err, 'No se pudo cargar la carta');
  }
});

// POST /carta/:codigo/pedido { mesa, items, nombre? }
router.post('/:codigo/pedido', cartaLimiter, async (req: Request, res: Response): Promise<void> => {
  const { codigo } = req.params as { codigo: string };
  const body = req.body as { mesa?: unknown; items?: unknown };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ success: false, error: 'Agrega algo a tu pedido.' });
    return;
  }
  try {
    const pedido = await crearPedidoEnMesa(codigo, {
      mesa: body.mesa,
      items: body.items as Parameters<typeof crearPedidoEnMesa>[1]['items'],
    });
    res.status(201).json({ success: true, data: pedido });
  } catch (err) {
    fallo(res, err, 'No se pudo enviar tu pedido');
  }
});

// GET /carta/:codigo/pedido/:orderId → el estado, para la pantalla del comensal
//
// Se busca por el id del pedido (cuid) y NO por `orderRef`: la referencia es de
// cuatro dígitos, o sea ocho mil combinaciones, y serviría para ir leyendo los
// pedidos de las otras mesas.
router.get('/:codigo/pedido/:orderId', async (req: Request, res: Response): Promise<void> => {
  const { codigo, orderId } = req.params as { codigo: string; orderId: string };
  try {
    const pedido = await getPedidoEnMesa(codigo, orderId);
    if (!pedido) {
      res.status(404).json({ success: false, error: 'No encontramos ese pedido' });
      return;
    }
    res.status(200).json({ success: true, data: pedido });
  } catch (err) {
    fallo(res, err, 'No se pudo consultar el pedido');
  }
});

// POST /carta/:codigo/pedido/:orderId/calificar { estrellas, comentario? }
//
// Sin cuenta: lo que hace de credencial es el id del pedido, un cuid que solo
// tiene quien lo pidió. Sin esta ruta, un pedido en mesa no se podía calificar
// NUNCA y la nota del restaurante salía solo de sus domicilios.
router.post(
  '/:codigo/pedido/:orderId/calificar',
  cartaLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const { codigo, orderId } = req.params as { codigo: string; orderId: string };
    const { estrellas, comentario } = req.body as {
      estrellas?: unknown; comentario?: unknown;
    };
    try {
      const r = await calificarPedidoEnMesa(codigo, orderId, estrellas, comentario);
      res.status(200).json({ success: true, data: r });
    } catch (err) {
      fallo(res, err, 'No se pudo guardar tu calificación');
    }
  },
);

export default router;
