import rateLimit from 'express-rate-limit';

/**
 * Limitador global — protege todos los endpoints de abuso básico (req/min/IP).
 * Generoso porque el grueso del tráfico en vivo va por WebSocket, no HTTP.
 */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env['RATE_LIMIT_GLOBAL'] ?? 300),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Demasiadas solicitudes, intenta de nuevo en un momento.',
  },
});

/**
 * Limitador estricto para autenticación/OTP — anti fuerza bruta y anti abuso de
 * SMS, encima del límite que ya aplica el servicio de OTP.
 */
export const authLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: Number(process.env['RATE_LIMIT_AUTH'] ?? 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  },
});
