import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import pinoHttp from 'pino-http';

import { PORT, CORS_ORIGIN } from './config/constants';
import { setupWebSocket } from './websocket/ws.handler';
import { scheduleDocumentExpiryChecks } from './services/document-expiry.service';
import { logger } from './lib/logger';
import { globalLimiter, authLimiter } from './middleware/rate-limit.middleware';
import { prisma } from './lib/prisma';

import authRouter from './routes/auth.routes';
import driverRouter from './routes/driver.routes';
import tripsRouter from './routes/trips.routes';
import earningsRouter from './routes/earnings.routes';
import businessRouter from './routes/business.routes';
import clientRouter from './routes/client.routes';
import webhooksRouter from './routes/webhooks.routes';
import paymentRouter from './routes/payment.routes';
import safetyRouter from './routes/safety.routes';
import adminRouter from './routes/admin.routes';
import geoRouter from './routes/geo.routes';

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();

// Detrás del proxy de Render: confiar en el primer proxy para que req.ip (y por
// tanto el rate-limiting) use la IP real del cliente desde X-Forwarded-For.
app.set('trust proxy', 1);

// Logging estructurado de cada request (omite el health-check, muy ruidoso).
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === '/health' },
  }),
);

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// ─── Health ───────────────────────────────────────────────────────────────────
// Registrado antes de los limitadores para que el health-check nunca se limite.

const startTime = Date.now();

app.get('/health', async (_req, res) => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    /* DB no disponible */
  }
  res.status(200).json({
    status: 'ok',
    db,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

// ─── Rate limiting ─────────────────────────────────────────────────────────────
// Estricto en autenticación/OTP; global (generoso) en el resto.

app.use(['/auth', '/client/auth', '/admin/auth'], authLimiter);
app.use(globalLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/auth', authRouter);
app.use('/driver', driverRouter);
app.use('/trips', tripsRouter);
app.use('/earnings', earningsRouter);
app.use('/business', businessRouter);
app.use('/client', clientRouter);
app.use('/webhooks', webhooksRouter);
app.use('/payment', paymentRouter);
app.use('/safety', safetyRouter);
app.use('/admin', adminRouter);
app.use('/geo', geoRouter);

// Serve uploaded driver documents (protected path — no directory listing).
const uploadsDir = path.resolve(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir, { index: false, dotfiles: 'deny' }));

// ─── 404 Catch-all ───────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Manejador de errores global (red de seguridad) ────────────────────────────

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void => {
    req.log.error({ err }, 'Unhandled request error');
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  },
);

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
setupWebSocket(wss);

server.listen(PORT, () => {
  logger.info(
    { port: PORT, env: process.env['NODE_ENV'] ?? 'development' },
    'Nexum API + WebSocket escuchando',
  );
  scheduleDocumentExpiryChecks();
});

export default app;
