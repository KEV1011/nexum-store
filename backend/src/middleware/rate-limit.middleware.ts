import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Limitador de tasa en memoria con ventana fija, sin dependencias externas.
 *
 * Pensado para proteger endpoints sensibles (OTP, login) frente a abuso y
 * fuerza bruta. Para una sola instancia es suficiente; en un despliegue
 * multi-instancia se reemplazaría por un store compartido (Redis).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Tamaño de la ventana en milisegundos. */
  windowMs: number;
  /** Máximo de peticiones permitidas por ventana y por clave. */
  max: number;
  /** Mensaje devuelto al exceder el límite. */
  message?: string;
  /** Deriva la clave del cliente (por defecto, su IP). */
  keyGenerator?: (req: Request) => string;
}

const DEFAULT_KEY = (req: Request): string =>
  req.ip ?? req.socket.remoteAddress ?? 'unknown';

export function rateLimit(options: RateLimitOptions): RequestHandler {
  const {
    windowMs,
    max,
    message = 'Demasiadas solicitudes. Intenta de nuevo más tarde.',
    keyGenerator = DEFAULT_KEY,
  } = options;

  const buckets = new Map<string, Bucket>();

  // Limpieza periódica de buckets vencidos para no crecer sin límite.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  // No debe impedir que el proceso termine.
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      setRateHeaders(res, max, max - 1, now + windowMs);
      next();
      return;
    }

    if (bucket.count >= max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      setRateHeaders(res, max, 0, bucket.resetAt);
      res.status(429).json({ success: false, error: message });
      return;
    }

    bucket.count += 1;
    setRateHeaders(res, max, max - bucket.count, bucket.resetAt);
    next();
  };
}

function setRateHeaders(
  res: Response,
  limit: number,
  remaining: number,
  resetAt: number,
): void {
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
}
