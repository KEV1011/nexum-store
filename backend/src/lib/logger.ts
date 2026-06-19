import pino from 'pino';

/**
 * Logger estructurado (JSON) de la app. En producción emite JSON apto para
 * agregadores (Datadog, Logtail, etc.); el nivel se ajusta con LOG_LEVEL.
 */
export const logger = pino({
  level:
    process.env['LOG_LEVEL'] ??
    (process.env['NODE_ENV'] === 'production' ? 'info' : 'debug'),
});
