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
import { pagoEnLineaDisponible } from './services/payment.service';
import { isSmsSenderConfigured } from './services/sms.service';
import { otpMode, otpEnRiesgo, demoRevisionActiva } from './services/otp.service';
import { kycProviderName, kycEnforced, estadoPiloto } from './services/kyc.service';
import { pruneRateLimits } from './services/fraud.service';
import { pruneSafetyState, sweepOfflineDrivers } from './services/safety-alerts.service';
import { purgeOldTrackPoints, pruneTrackState } from './services/track.service';
import { rescatarDespacho, BARRIDO_MS } from './services/dispatch-recovery.service';
import { warmMunicipalities } from './services/municipality.service';
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
// Límite explícito de cuerpo. Sin él express.json() acepta 100 kB por defecto:
// nadie lo había notado, pero el número tiene que ser una decisión y no una
// casualidad de la librería. Ningún endpoint JSON de esta API necesita más de
// unos pocos kB — las fotos van por multipart con su propio límite (upload.ts).
//
// La excepción es la carga masiva del catálogo: el CSV viaja como texto dentro
// del JSON y un supermercado con miles de productos pasa del megabyte. Se le da
// su propio límite en vez de subir el de toda la API, que es lo que convierte
// un límite en un adorno.
const CSV_CATALOGO = /^\/business\/[^/]+\/products\/csv-(preview|import)$/;
const jsonNormal = express.json({ limit: process.env['JSON_BODY_LIMIT'] ?? '64kb' });
const jsonCatalogo = express.json({ limit: process.env['JSON_CSV_LIMIT'] ?? '4mb' });
app.use((req, res, next) =>
  (CSV_CATALOGO.test(req.path) ? jsonCatalogo : jsonNormal)(req, res, next),
);

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
  const piloto = estadoPiloto();
  res.status(200).json({
    status: 'ok',
    db,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    commit: (process.env['RENDER_GIT_COMMIT'] ?? '').slice(0, 7) || 'desconocido',
    otp: modes.users,
    otpAdmin: modes.admin,
    // true = el login de producción depende de UN código fijo que vale para
    // cualquier teléfono (modo piloto autorizado con ALLOW_FIXED_OTP).
    otpRiesgo: otpEnRiesgo(),
    // Cuenta de demostración para la revisión de App Store / Play: sin ella el
    // revisor no puede entrar (login solo por SMS a un número colombiano).
    demoRevision: demoRevisionActiva(),
    // 'wompi' = el pago en línea cobra de verdad; 'apagado' = las apps solo
    // ofrecen efectivo (un botón que no cobra es motivo de rechazo).
    pagos: pagoEnLineaDisponible() ? 'wompi' : 'apagado',
    // SOS: 'sms' = el botón de pánico avisa de verdad al contacto de confianza.
    // 'sin-canal' = solo se registra el evento y le queda el 123. Es el
    // diagnóstico que hay que mirar ANTES de que alguien lo necesite.
    sos: isSmsSenderConfigured() ? 'sms' : 'sin-canal',
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
    // Piloto: si está activo, el despacho ignora la verificación. Caduca solo
    // — la fecha y los días restantes van aquí para que no se olvide encendido.
    pilotSkipVerification: piloto.activo,
    pilotSkipVerificationUntil: piloto.hasta,
    pilotSkipVerificationDaysLeft: piloto.diasRestantes,
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
// maxPayload: ningún mensaje legítimo de esta API pasa de unos pocos kB (el
// mayor es un fix GPS con metadatos). Sin tope, `ws` acepta 100 MB por trama y
// una sola conexión podría reservar esa memoria antes de que nadie la valide.
const wss = new WebSocketServer({ server, maxPayload: 32 * 1024 });
setupWebSocket(wss);

server.listen(PORT, () => {
  logger.info(
    { port: PORT, env: process.env['NODE_ENV'] ?? 'development' },
    'ZIPA API + WebSocket escuchando',
  );
  scheduleDocumentExpiryChecks();
  // Carga la tabla de municipios para que el cálculo de rutas no arranque frío.
  void warmMunicipalities();
  // Purga periódica del mapa en memoria del rate-limit por cliente (antifraude).
  setInterval(pruneRateLimits, 5 * 60 * 1000).unref();
  setInterval(pruneSafetyState, 10 * 60 * 1000).unref();
  setInterval(pruneTrackState, 30 * 60 * 1000).unref();
  // Retención del rastro GPS: la tabla crece con cada viaje, así que se poda
  // una vez al día (TRACK_RETENTION_DAYS). Se corre una vez al arrancar por si
  // el proceso se reinicia a diario y el timer nunca llega a cumplirse.
  void purgeOldTrackPoints();
  setInterval(() => void purgeOldTrackPoints(), 24 * 60 * 60 * 1000).unref();
  // Conductor que desaparece con mercancía en curso. Es la ÚNICA alerta que no
  // puede nacer del heartbeat: aquí el problema es que el heartbeat dejó de
  // llegar, así que hace falta ir a buscarlo.
  setInterval(() => void sweepOfflineDrivers(), 60 * 1000).unref();
  // Rescate del despacho: los ciclos de oferta viven en memoria, así que un
  // redeploy los deja huérfanos y el cliente se queda mirando "buscando
  // conductor" para siempre. Se revisa al arrancar y se repite periódicamente
  // por si un ciclo se pierde sin que el proceso llegue a morir.
  void rescatarDespacho();
  setInterval(() => void rescatarDespacho(), BARRIDO_MS).unref();
});

// ─── Apagado ordenado ─────────────────────────────────────────────────────────
//
// Render manda SIGTERM y espera un poco antes de matar el proceso. Sin
// atenderlo, ese margen se desperdicia: las peticiones en vuelo se cortan a
// media respuesta y los sockets mueren sin decir nada — un `trip_status` que
// viajaba en ese instante se pierde y el viaje queda desincronizado.
//
// Aquí se aprovecha: se avisa a los sockets para que reconecten cuando vuelva
// el servicio, se deja terminar lo que ya estaba en curso y se suelta la base.

let apagando = false;

async function apagarOrdenadamente(senal: string): Promise<void> {
  if (apagando) return; // SIGTERM y SIGINT pueden llegar juntos.
  apagando = true;
  logger.info({ senal }, 'Apagando ordenadamente');

  // 1. Dejar de aceptar conexiones nuevas, sin cortar las que ya se atienden.
  server.close(() => logger.info('HTTP cerrado'));

  // 2. Avisar a los clientes conectados. Un cierre limpio con motivo hace que
  //    las apps reconecten enseguida en vez de esperar a que expire el socket.
  for (const ws of wss.clients) {
    try {
      ws.send(JSON.stringify({ type: 'server_restarting' }));
      ws.close(1012, 'server restart'); // 1012 = Service Restart
    } catch {
      /* el socket ya estaba roto */
    }
  }

  // 3. Margen para que salgan las respuestas en curso, y soltar la base.
  setTimeout(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  }, Number(process.env['SHUTDOWN_GRACE_MS'] ?? 5000)).unref();
}

process.on('SIGTERM', () => void apagarOrdenadamente('SIGTERM'));
process.on('SIGINT', () => void apagarOrdenadamente('SIGINT'));

export default app;
