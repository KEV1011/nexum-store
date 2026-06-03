import { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from '../utils/logger';

/**
 * Error de dominio con código HTTP explícito. Lanzarlo desde servicios/rutas
 * permite que el manejador global responda con el estado correcto y el
 * contrato uniforme `{ success: false, error }`.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, code?: string): ApiError {
    return new ApiError(400, message, code);
  }

  static unauthorized(message = 'No autorizado', code?: string): ApiError {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'Acceso denegado', code?: string): ApiError {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Recurso no encontrado', code?: string): ApiError {
    return new ApiError(404, message, code);
  }

  static conflict(message: string, code?: string): ApiError {
    return new ApiError(409, message, code);
  }
}

/**
 * Envuelve un handler asíncrono para que cualquier promesa rechazada se reenvíe
 * a `next()` y la capture el manejador de errores global, evitando el
 * `try/catch` repetido en cada ruta.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** 404 uniforme para rutas no registradas. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Manejador de errores global. Convierte cualquier excepción en una respuesta
 * JSON consistente. Los 5xx se registran con su stack; los 4xx solo como aviso.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // Express identifica el handler de error por su aridad (4 args); `next` debe
  // existir aunque no se use.
  _next: NextFunction,
): void {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : 500;
  const message =
    err instanceof Error ? err.message : 'Error interno del servidor';

  const meta = {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    requestId: (req as Request & { id?: string }).id,
  };

  if (statusCode >= 500) {
    logger.error(message, {
      ...meta,
      stack: err instanceof Error ? err.stack : undefined,
    });
  } else {
    logger.warn(message, meta);
  }

  // No filtramos detalles internos en 5xx de producción.
  const safeMessage =
    statusCode >= 500 && process.env['NODE_ENV'] === 'production'
      ? 'Error interno del servidor'
      : message;

  res.status(statusCode).json({
    success: false,
    error: safeMessage,
    ...(isApiError && err.code ? { code: err.code } : {}),
  });
}
