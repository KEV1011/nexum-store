import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';

import { PORT, CORS_ORIGIN, NODE_ENV } from './config/constants';
import { setupWebSocket } from './websocket/ws.handler';
import { logger } from './utils/logger';
import { requestLogger } from './middleware/request-logger.middleware';
import { securityHeaders } from './middleware/security.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

import authRouter from './routes/auth.routes';
import driverRouter from './routes/driver.routes';
import tripsRouter from './routes/trips.routes';
import earningsRouter from './routes/earnings.routes';
import businessRouter from './routes/business.routes';
import clientRouter from './routes/client.routes';
import webhooksRouter from './routes/webhooks.routes';
import adminRouter from './routes/admin.routes';
import catalogRouter from './routes/catalog.routes';

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();

// Confiamos en el proxy (Railway/Render) para obtener la IP real del cliente,
// necesaria para el rate limiting por IP.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(securityHeaders);
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// ─── Health ───────────────────────────────────────────────────────────────────

const startTime = Date.now();

app.get('/health', (_req, res) => {
  const mem = process.memoryUsage();
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    memory: {
      rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
    },
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/auth', authRouter);
app.use('/driver', driverRouter);
app.use('/trips', tripsRouter);
app.use('/earnings', earningsRouter);
app.use('/business', businessRouter);
app.use('/client', clientRouter);
app.use('/webhooks', webhooksRouter);
app.use('/admin', adminRouter);
app.use('/catalog', catalogRouter);

// ─── 404 + manejador de errores global (deben ir al final) ────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
setupWebSocket(wss);

server.listen(PORT, () => {
  logger.info(`REST API escuchando en http://localhost:${PORT}`);
  logger.info(`WebSocket escuchando en ws://localhost:${PORT}`);
  logger.info(`Entorno: ${NODE_ENV}`);
});

// ─── Apagado controlado ───────────────────────────────────────────────────────
//
// Al recibir SIGTERM/SIGINT (deploy, reinicio, Ctrl-C) cerramos las conexiones
// WebSocket y el servidor HTTP de forma ordenada, con un tope de tiempo para no
// quedar colgados si algún socket no responde.

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Recibido ${signal}, cerrando servidor...`);

  const forceExit = setTimeout(() => {
    logger.error('Cierre forzado tras timeout');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  for (const client of wss.clients) {
    client.terminate();
  }
  wss.close(() => {
    server.close(() => {
      logger.info('Servidor cerrado limpiamente');
      clearTimeout(forceExit);
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Promesa rechazada sin manejar', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});
process.on('uncaughtException', (err) => {
  logger.error('Excepción no capturada', { message: err.message, stack: err.stack });
});

export default app;
