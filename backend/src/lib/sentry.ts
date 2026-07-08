import * as Sentry from '@sentry/node';
import { logger } from './logger';

const SENTRY_DSN = process.env['SENTRY_DSN'];

export const sentryEnabled = Boolean(SENTRY_DSN);

/**
 * Inicializa Sentry si SENTRY_DSN está definido. Sin DSN es un no-op silencioso
 * (comportamiento idéntico al actual, cero riesgo).
 */
export function initSentry(): void {
  if (!SENTRY_DSN) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env['NODE_ENV'] ?? 'development',
    // Solo reporte de errores; sin performance tracing para no añadir overhead.
    tracesSampleRate: 0,
  });
  logger.info('[Sentry] crash reporting activo');
}

/** Reporta un error a Sentry. No-op sin DSN. */
export function captureError(err: unknown): void {
  if (SENTRY_DSN) Sentry.captureException(err);
}
