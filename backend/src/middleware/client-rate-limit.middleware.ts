import { Request, Response, NextFunction } from 'express';
import { assertClientRequestRate, RateLimitError } from '../services/fraud.service';

/**
 * Freno anti-spam por cliente para las rutas que CREAN una solicitud de servicio
 * (viaje/mandado/pedido/flete/intercity). Va después de clientAuthMiddleware
 * (necesita req.clientId). Responde 429 si el cliente pide demasiadas veces en la
 * ventana.
 */
export function clientRequestRateLimit(req: Request, res: Response, next: NextFunction): void {
  const clientId = req.clientId;
  if (!clientId) { next(); return; }
  try {
    assertClientRequestRate(clientId);
    next();
  } catch (err) {
    if (err instanceof RateLimitError) {
      res.status(429).json({ success: false, error: err.message });
      return;
    }
    next(err as Error);
  }
}
