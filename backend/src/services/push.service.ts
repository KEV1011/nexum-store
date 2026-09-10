import { prisma } from '../lib/prisma';
import { veredictoPush } from '../lib/veredicto-push';

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

// ── Contabilidad de envíos ────────────────────────────────────────────────────
//
// El push falla EN SILENCIO de dos formas y ninguna deja rastro útil: sin token
// registrado la función simplemente vuelve, y un fallo de envío es un
// `console.warn` en un log que nadie lee. Con Firebase perfectamente
// configurado y cero tokens, el sistema entero está muerto sin una sola pista.
//
// Esto no es telemetría: es lo mínimo para poder responder «¿están llegando?».
// Vive en memoria y se pierde al reiniciar, que basta para diagnosticar.
const _cuentas = { enviados: 0, sinToken: 0, fallidos: 0 };
let _ultimoError: string | null = null;
let _ultimoEnvio: string | null = null;

export function estadisticasPush(): {
  enviados: number; sinToken: number; fallidos: number;
  ultimoError: string | null; ultimoEnvio: string | null;
} {
  return { ..._cuentas, ultimoError: _ultimoError, ultimoEnvio: _ultimoEnvio };
}

/** Un destinatario sin token: no es un error, pero hay que poder contarlo. */
function _anotarSinToken(logRef: string): void {
  _cuentas.sinToken++;
  console.log(`[Push] Sin token registrado: ${logRef}`);
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
    _cuentas.enviados++;
    _ultimoEnvio = new Date().toISOString();
    console.log(`[Push] Sent ${logRef}`);
  } catch (err) {
    // Token inválido/expirado es esperable (app desinstalada); no es fatal.
    _cuentas.fallidos++;
    _ultimoError = err instanceof Error ? err.message : 'error desconocido';
    console.warn(`[Push] Send failed ${logRef}:`, _ultimoError);
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
  if (!driver?.fcmToken) { _anotarSinToken(`driver=${driverId}`); return; }
  await _sendToToken(driver.fcmToken, payload, `driver=${driverId} type=${payload.data?.['type'] ?? 'generic'}`);
}

export async function sendPushToClient(userId: string, payload: PushPayload): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });
  if (!user?.fcmToken) { _anotarSinToken(`user=${userId}`); return; }
  await _sendToToken(user.fcmToken, payload, `user=${userId} type=${payload.data?.['type'] ?? 'generic'}`);
}

// ── Diagnóstico real del push ─────────────────────────────────────────────────
//
// `/health` solo mira si hay credenciales de Firebase: con ellas perfectamente
// puestas y CERO tokens registrados, el resultado es el mismo que no tener push
// —nadie recibe nada— y no hay forma de notarlo. La cobertura de tokens es el
// dato que falta.

export interface PushProbe {
  /** 'firebase' | 'apagado' — el modo configurado. */
  mode: string;
  /** Conductores con token registrado, sobre el total. */
  conductores: string;
  /** Clientes con token, sobre el total. */
  clientes: string;
  /** Envíos desde el último reinicio. */
  envios: string;
  /** Último error de envío, si lo hubo. */
  ultimoError: string | null;
  /** Resumen accionable en español. */
  veredicto: string;
}

export async function probePush(): Promise<PushProbe> {
  const stats = estadisticasPush();
  const [condTotal, condConToken, cliTotal, cliConToken] = await Promise.all([
    prisma.driver.count(),
    prisma.driver.count({ where: { fcmToken: { not: null } } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { fcmToken: { not: null }, deletedAt: null } }),
  ]);

  const activo = _getMessaging() != null;
  const envios =
    `${stats.enviados} enviados · ${stats.sinToken} sin token · ${stats.fallidos} fallidos`;

  const veredicto = veredictoPush({
    activo,
    conductoresTotal: condTotal,
    conductoresConToken: condConToken,
    enviados: stats.enviados,
    fallidos: stats.fallidos,
    ultimoError: stats.ultimoError,
  });

  return {
    mode: activo ? 'firebase' : 'apagado',
    conductores: `${condConToken}/${condTotal}`,
    clientes: `${cliConToken}/${cliTotal}`,
    envios,
    ultimoError: stats.ultimoError,
    veredicto,
  };
}

/**
 * Envío de prueba a un conductor concreto, desde el panel.
 *
 * Cierra el ciclo que ninguna sonda puede cerrar sola: que el aviso SALGA no
 * prueba que ENTRE. Esto se manda y el admin mira el teléfono.
 */
export async function enviarPushDePrueba(driverId: string): Promise<{ enviado: boolean; motivo: string }> {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { fcmToken: true, name: true },
  });
  if (!driver) return { enviado: false, motivo: 'Conductor no encontrado.' };
  if (!driver.fcmToken) {
    return {
      enviado: false,
      motivo: `${driver.name} no tiene token registrado. Que abra la app con sesión iniciada y acepte las notificaciones.`,
    };
  }
  if (!_getMessaging()) {
    return { enviado: false, motivo: 'Firebase no está configurado: no saldría nada.' };
  }
  const antes = estadisticasPush().fallidos;
  await _sendToToken(driver.fcmToken, {
    title: 'Prueba de ZIPA',
    body: 'Si ves esto, las notificaciones te están llegando bien.',
    data: { type: 'prueba' },
  }, `driver=${driverId} type=prueba`);
  const fallo = estadisticasPush().fallidos > antes;
  return fallo
    ? { enviado: false, motivo: estadisticasPush().ultimoError ?? 'Falló el envío.' }
    : { enviado: true, motivo: `Enviado a ${driver.name}. Mira su teléfono.` };
}
