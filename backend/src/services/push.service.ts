import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Push notification service (Firebase Cloud Messaging).
//
// Activación por configuración: si la variable de entorno
// FIREBASE_SERVICE_ACCOUNT contiene el JSON de la cuenta de servicio (texto
// plano o base64), se inicializa firebase-admin y los push son reales. Sin
// ella el servicio opera en modo mock (log sin datos sensibles) para que el
// resto del backend no necesite condicionar nada.
//
// Privacidad: nunca se loguean tokens FCM, teléfonos ni nombres — solo IDs
// internos y el tipo de notificación.
// ─────────────────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  /** Datos extra que la app usa para abrir la pantalla correcta. */
  data?: Record<string, string>;
}

type Messaging = {
  send(message: {
    token: string;
    notification: { title: string; body: string };
    data?: Record<string, string>;
    android: { priority: 'high' | 'normal' };
  }): Promise<string>;
};

let _messaging: Messaging | null = null;
let _initAttempted = false;

function _getMessaging(): Messaging | null {
  if (_initAttempted) return _messaging;
  _initAttempted = true;

  const raw = process.env['FIREBASE_SERVICE_ACCOUNT'];
  if (!raw) {
    console.log('[Push] FIREBASE_SERVICE_ACCOUNT not set — running in mock mode');
    return null;
  }

  try {
    const json = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');
    const credentials = JSON.parse(json) as Record<string, unknown>;

    // Import dinámico para que el backend arranque aunque firebase-admin no
    // esté instalado en entornos donde el push está deshabilitado.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const adminApp = require('firebase-admin/app') as typeof import('firebase-admin/app');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const adminMessaging = require('firebase-admin/messaging') as typeof import('firebase-admin/messaging');
    const app = adminApp.getApps()[0]
      ?? adminApp.initializeApp({ credential: adminApp.cert(credentials as never) });
    _messaging = adminMessaging.getMessaging(app);
    console.log('[Push] Firebase Admin initialized — push notifications enabled');
  } catch (err) {
    console.error('[Push] Failed to initialize Firebase Admin:', err instanceof Error ? err.message : 'unknown error');
    _messaging = null;
  }
  return _messaging;
}

async function _sendToToken(token: string, payload: PushPayload, logRef: string): Promise<void> {
  const messaging = _getMessaging();
  if (!messaging) {
    console.log(`[Push:mock] ${logRef} — "${payload.title}"`);
    return;
  }
  try {
    await messaging.send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: { priority: 'high' },
    });
    console.log(`[Push] Sent ${logRef}`);
  } catch (err) {
    // Token inválido/expirado es esperable (app desinstalada); no es fatal.
    console.warn(`[Push] Send failed ${logRef}:`, err instanceof Error ? err.message : 'unknown error');
  }
}

// ─── Token registration ───────────────────────────────────────────────────────

export async function registerDriverFcmToken(driverId: string, token: string): Promise<void> {
  await prisma.driver.update({ where: { id: driverId }, data: { fcmToken: token } });
}

export async function registerClientFcmToken(userId: string, token: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { fcmToken: token } });
}

// ─── Senders ──────────────────────────────────────────────────────────────────

export async function sendPushToDriver(driverId: string, payload: PushPayload): Promise<void> {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { fcmToken: true },
  });
  if (!driver?.fcmToken) return;
  await _sendToToken(driver.fcmToken, payload, `driver=${driverId} type=${payload.data?.['type'] ?? 'generic'}`);
}

export async function sendPushToClient(userId: string, payload: PushPayload): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });
  if (!user?.fcmToken) return;
  await _sendToToken(user.fcmToken, payload, `user=${userId} type=${payload.data?.['type'] ?? 'generic'}`);
}
