import { NODE_ENV } from '../config/constants';

/**
 * Logger estructurado mínimo y sin dependencias.
 *
 * En producción emite una línea JSON por evento (apto para agregadores como
 * Railway/Render/Datadog); en desarrollo imprime un formato legible y
 * coloreado. Centraliza el logging para reemplazar los `console.log` sueltos.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// En producción ocultamos el ruido de `debug` salvo que se pida explícitamente.
const MIN_LEVEL: number =
  LEVEL_ORDER[(process.env['LOG_LEVEL'] as LogLevel) ?? (NODE_ENV === 'production' ? 'info' : 'debug')] ??
  LEVEL_ORDER.info;

const isProd = NODE_ENV === 'production';

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m', // gris
  info: '\x1b[36m', // cian
  warn: '\x1b[33m', // amarillo
  error: '\x1b[31m', // rojo
};
const RESET = '\x1b[0m';

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < MIN_LEVEL) return;

  const timestamp = new Date().toISOString();

  if (isProd) {
    // Una línea JSON por evento.
    process.stdout.write(
      JSON.stringify({ timestamp, level, message, ...meta }) + '\n',
    );
    return;
  }

  // Desarrollo: legible y coloreado.
  const color = COLORS[level];
  const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  process.stdout.write(
    `${color}${timestamp} ${level.toUpperCase().padEnd(5)}${RESET} ${message}${metaStr}\n`,
  );
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};
