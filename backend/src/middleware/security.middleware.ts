import { NextFunction, Request, Response } from 'express';

/**
 * Cabeceras de seguridad básicas (equivalente ligero a helmet, sin dependencia).
 *
 * La API sirve JSON a apps móviles, por lo que el conjunto se mantiene mínimo y
 * sin políticas que rompan clientes (no CSP de navegador). Endurece contra
 * sniffing de MIME, clickjacking y fugas de referer.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  // Oculta la firma por defecto de Express.
  res.removeHeader('X-Powered-By');
  next();
}
