import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import pinoHttp from 'pino-http';

import { PORT, CORS_ORIGIN } from './config/constants';
import { setupWebSocket } from './websocket/ws.handler';
import { scheduleDocumentExpiryChecks, docKillSwitchEnforced } from './services/document-expiry.service';
import { logger } from './lib/logger';
import { initSentry, captureError } from './lib/sentry';
import { globalLimiter, authLimiter } from './middleware/rate-limit.middleware';
import { prisma } from './lib/prisma';
import { otpMode } from './services/otp.service';
import { kycProviderName, kycEnforced, pilotSkipVerification } from './services/kyc.service';
import { pruneRateLimits } from './services/fraud.service';
import { pruneSafetyState } from './services/safety-alerts.service';
import { ocrProviderName } from './services/ocr.service';
import { backgroundProviderName } from './services/background-check.service';
import { legalConsentEnforced } from './services/legal.service';

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
import operatorRouter from './routes/operator.routes';
import geoRouter from './routes/geo.routes';
import legalRouter from './routes/legal.routes';

// Crash reporting (no-op sin SENTRY_DSN).
initSentry();

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

// Headers de seguridad (X-Content-Type-Options, X-Frame-Options, HSTS, etc.).
// CSP apagado: el panel /admin es HTML embebido con scripts inline y los
// portales sirven imágenes de /uploads desde otros orígenes.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// ─── Health ───────────────────────────────────────────────────────────────────
// Registrado antes de los limitadores para que el health-check nunca se limite.

const startTime = Date.now();

// Raíz amigable: la gente abre la URL del backend en el navegador y un
// "Route not found" parece un servicio caído. Esto orienta sin exponer nada.
app.get('/', (_req, res) => {
  res.status(200).json({
    service: 'ZIPA API',
    status: 'ok',
    salud: '/health',
    panel: '/admin',
  });
});

app.get('/health', async (_req, res) => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    /* DB no disponible */
  }
  // commit + modo OTP: diagnóstico remoto de producción con una sola captura
  // (¿qué build corre Render? ¿qué código de login espera?). No expone secretos:
  // solo el MODO, nunca el valor del código.
  const modes = otpMode();
  res.status(200).json({
    status: 'ok',
    db,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    commit: (process.env['RENDER_GIT_COMMIT'] ?? '').slice(0, 7) || 'desconocido',
    otp: modes.users,
    otpAdmin: modes.admin,
    // Diagnóstico de infraestructura: una mirada dice si las fotos sobreviven
    // al redeploy y si los push llegan con la app cerrada.
    uploads: process.env['S3_BUCKET'] ? 's3-r2' : 'disco-efimero',
    push: process.env['FIREBASE_SERVICE_ACCOUNT'] ? 'firebase' : 'apagado',
    // KYC: qué proveedor de identidad corre y si el gating bloquea el "conectarse".
    kyc: kycProviderName(),
    kycEnforce: kycEnforced(),
    // Kill-switch documental: 'activo' = documentos vencidos bloquean el match.
    docKillSwitch: docKillSwitchEnforced() ? 'activo' : 'apagado',
    // OCR y antecedentes (env-gated): qué proveedor corre cada uno.
    ocr: ocrProviderName(),
    background: backgroundProviderName() === 'none' ? 'apagado' : backgroundProviderName(),
    // Clickwrap legal: 'activo' = el registro exige aceptar términos.
    legalConsent: legalConsentEnforced() ? 'activo' : 'apagado',
    // Piloto: si está activo, el despacho ignora la verificación (probar arranque).
    pilotSkipVerification: pilotSkipVerification(),
  });
});

// ─── Rate limiting ─────────────────────────────────────────────────────────────
// Estricto en autenticación/OTP; global (generoso) en el resto.

app.use(['/auth', '/client/auth', '/admin/auth', '/operator/auth', '/legal/takedown'], authLimiter);
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
app.use('/operator', operatorRouter);
app.use('/geo', geoRouter);
app.use('/legal', legalRouter);

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
    captureError(err);
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  },
);

// ─── Errores a nivel de proceso (no tumban el server en silencio) ──────────────

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  captureError(reason);
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  captureError(err);
});

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
setupWebSocket(wss);

server.listen(PORT, () => {
  logger.info(
    { port: PORT, env: process.env['NODE_ENV'] ?? 'development' },
    'ZIPA API + WebSocket escuchando',
  );
  scheduleDocumentExpiryChecks();
  // Purga periódica del mapa en memoria del rate-limit por cliente (antifraude).
  setInterval(pruneRateLimits, 5 * 60 * 1000).unref();
  setInterval(pruneSafetyState, 10 * 60 * 1000).unref();
});

export default app;
