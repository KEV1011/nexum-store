import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

/**
 * Asigna un id de petición y registra una línea por respuesta con método, ruta,
 * estado y duración. El id se expone en la cabecera `X-Request-Id` para poder
 * correlacionar logs cliente↔servidor.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const id = randomUUID();
  (req as Request & { id?: string }).id = id;
  res.setHeader('X-Request-Id', id);

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const meta = {
      requestId: id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
    };

    // El health check no ensucia los logs salvo que falle.
    if (req.originalUrl === '/health' && res.statusCode < 400) return;

    if (res.statusCode >= 500) {
      logger.error('request', meta);
    } else if (res.statusCode >= 400) {
      logger.warn('request', meta);
    } else {
      logger.info('request', meta);
    }
  });

  next();
}
