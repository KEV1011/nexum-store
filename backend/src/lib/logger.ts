import pino from 'pino';

/**
 * Logger estructurado (JSON) de la app. En producción emite JSON apto para
 * agregadores (Datadog, Logtail, etc.); el nivel se ajusta con LOG_LEVEL.
 */
// `||` (no `??`) a propósito: LOG_LEVEL puede venir como string vacío desde un
// .env copiado de .env.example (`LOG_LEVEL=`). Con `??` ese "" se le pasaría a
// pino como nivel y lanzaría al arrancar; con `||` el vacío cae al default.
const level =
  process.env['LOG_LEVEL'] ||
  (process.env['NODE_ENV'] === 'production' ? 'info' : 'debug');

export const logger = pino({ level });
