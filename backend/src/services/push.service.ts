import { prisma } from '../lib/prisma';

// ─── Firebase Admin (lazy init) ───────────────────────────────────────────────

let _messaging: import('firebase-admin/messaging').Messaging | null = null;

function getMessaging(): import('firebase-admin/messaging').Messaging | null {
  if (_messaging) return _messaging;

  const raw = process.env['FIREBASE_SERVICE_ACCOUNT'];
  if (!raw) return null;

  try {
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');

    const serviceAccount = raw.startsWith('{')
      ? JSON.parse(raw)
      : JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));

    if (getApps().length === 0) {
      initializeApp({ credential: cert(serviceAccount) });
    }
    _messaging = getMessaging();
  } catch (err) {
    console.error('[Push] Firebase init failed:', err instanceof Error ? err.message : err);
  }

  return _messaging;
}

// ─── Token registration ───────────────────────────────────────────────────────

export async function registerDriverFcmToken(driverId: string, token: string): Promise<void> {
  await prisma.driver.update({ where: { id: driverId }, data: { fcmToken: token } });
}

export async function registerClientFcmToken(clientId: string, token: string): Promise<void> {
  await prisma.user.update({ where: { id: clientId }, data: { fcmToken: token } });
}

// ─── Send helpers ─────────────────────────────────────────────────────────────

async function sendPush(token: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
  const messaging = getMessaging();

  if (!messaging) {
    console.log(`[Push-mock] → ${title}: ${body}`);
    return;
  }

  try {
    await messaging.send({
      token,
      notification: { title, body },
      data,
      android: { priority: 'high', notification: { channelId: 'nexum_trips', sound: 'default' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
  } catch (err) {
    console.error('[Push] send failed:', err instanceof Error ? err.message : err);
  }
}

export async function sendPushToDriver(driverId: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
  const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { fcmToken: true } });
  if (!driver?.fcmToken) return;
  await sendPush(driver.fcmToken, title, body, data);
}

export async function sendPushToClient(clientId: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: clientId }, select: { fcmToken: true } });
  if (!user?.fcmToken) return;
  await sendPush(user.fcmToken, title, body, data);
}
