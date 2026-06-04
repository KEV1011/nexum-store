import { FIREBASE_SERVICE_ACCOUNT_JSON } from '../config/constants';

/**
 * Servicio de push (Firebase Cloud Messaging).
 *
 * Diseñado para ser *build-safe*: si `firebase-admin` no está instalado o no se
 * configura `FIREBASE_SERVICE_ACCOUNT_JSON`, todo el servicio hace no-op y solo
 * registra en consola. Así la app y el backend funcionan sin push hasta que se
 * provea la credencial de Firebase.
 */

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// Registro de tokens por usuario (en memoria, como el resto del flujo de viajes
// en vivo). Para producción a largo plazo conviene persistirlo en la BD.
const tokensByUser = new Map<string, Set<string>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let messaging: any = null;
let initTried = false;

// Carga perezosa de firebase-admin para no requerir la dependencia en compilación.
function getMessaging(): unknown {
  if (initTried) return messaging;
  initTried = true;

  if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.log('[push] FCM no configurado (FIREBASE_SERVICE_ACCOUNT_JSON vacío).');
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin');
    const credential = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(credential) });
    messaging = admin.messaging(app);
    console.log('[push] FCM inicializado correctamente.');
  } catch (err) {
    console.error('[push] No se pudo inicializar FCM:', err);
    messaging = null;
  }
  return messaging;
}

export function registerDeviceToken(userId: string, token: string): void {
  if (!token) return;
  if (!tokensByUser.has(userId)) tokensByUser.set(userId, new Set());
  tokensByUser.get(userId)!.add(token);
}

export function unregisterDeviceToken(userId: string, token: string): void {
  tokensByUser.get(userId)?.delete(token);
}

/**
 * Envía un push a todos los dispositivos de un usuario. No-op si FCM no está
 * configurado o el usuario no tiene tokens. Limpia tokens inválidos.
 */
export async function sendToUser(
  userId: string,
  message: PushMessage,
): Promise<void> {
  const tokens = [...(tokensByUser.get(userId) ?? [])];
  if (tokens.length === 0) return;

  const fcm = getMessaging() as {
    sendEachForMulticast: (msg: unknown) => Promise<{
      responses: Array<{ success: boolean }>;
    }>;
  } | null;

  if (!fcm) {
    console.log(`[push → ${userId}] ${message.title} — ${message.body}`);
    return;
  }

  try {
    const res = await fcm.sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      data: message.data ?? {},
      android: { priority: 'high' },
    });
    // Purga tokens que el servidor reportó como inválidos.
    res.responses.forEach((r, i) => {
      if (!r.success) unregisterDeviceToken(userId, tokens[i]!);
    });
  } catch (err) {
    console.error('[push] Error enviando notificación:', err);
  }
}
