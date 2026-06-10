import { prisma } from '../lib/prisma';

// ─── Firebase Admin init ──────────────────────────────────────────────────────

let _messaging: import('firebase-admin/messaging').Messaging | null = null;
let _mockMode = false;

function getMessaging(): import('firebase-admin/messaging').Messaging | null {
  if (_messaging) return _messaging;

  const raw = process.env['FIREBASE_SERVICE_ACCOUNT'];
  if (!raw) {
    _mockMode = true;
    return null;
  }

  try {
    const { initializeApp, cert } = require('firebase-admin/app') as typeof import('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging') as typeof import('firebase-admin/messaging');

    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(json) as import('firebase-admin').ServiceAccount;

    const app = initializeApp({ credential: cert(serviceAccount) }, 'nexum-push');
    _messaging = getMessaging(app);
    return _messaging;
  } catch (err) {
    console.error('[Push] Firebase init failed, switching to mock mode:', err instanceof Error ? err.message : err);
    _mockMode = true;
    return null;
  }
}

// ─── Token registration ───────────────────────────────────────────────────────

export async function registerDriverFcmToken(driverId: string, token: string): Promise<void> {
  await prisma.driver.update({ where: { id: driverId }, data: { fcmToken: token } });
}

export async function registerClientFcmToken(userId: string, token: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { fcmToken: token } });
}

// ─── Push sending ─────────────────────────────────────────────────────────────

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

async function _send(token: string, payload: PushPayload): Promise<void> {
  if (_mockMode || !getMessaging()) {
    console.log('[Push:mock] title=%s body=%s token_present=%s', payload.title, payload.body, !!token);
    return;
  }
  try {
    await _messaging!.send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  } catch (err) {
    console.error('[Push] send failed:', err instanceof Error ? err.message : err);
  }
}

export async function sendPushToDriver(driverId: string, payload: PushPayload): Promise<void> {
  const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { fcmToken: true } });
  if (!driver?.fcmToken) return;
  await _send(driver.fcmToken, payload);
}

export async function sendPushToClient(userId: string, payload: PushPayload): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
  if (!user?.fcmToken) return;
  await _send(user.fcmToken, payload);
}
