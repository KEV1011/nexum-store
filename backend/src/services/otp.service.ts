import { timingSafeEqual } from 'crypto';
import { prisma } from '../lib/prisma';
import { NODE_ENV } from '../config/constants';
import { isSmsConfigured, sendSmsVerification, checkSmsVerification } from './sms.service';

// ─────────────────────────────────────────────────────────────────────────────
// OTP compartido entre conductor (auth.service) y cliente (client.service).
//
// Modos de operación, resueltos por configuración:
//   1. Twilio Verify (TWILIO_* definidos): el código se genera, envía por SMS
//      y valida en Twilio. No se guarda nada en BD.
//   2. Local (sin Twilio): el código se guarda en otp_sessions y se valida
//      contra BD. El valor depende del entorno:
//        - desarrollo: OTP_DEV_CODE (default "123456") para flujos de prueba.
//        - producción: OTP_FALLBACK_CODE si el operador lo definió
//          explícitamente (piloto sin SMS); si no, un código aleatorio que
//          NUNCA se loguea — es decir, sin Twilio y sin fallback el login en
//          producción queda efectivamente cerrado, por diseño.
// ─────────────────────────────────────────────────────────────────────────────

const OTP_TTL_MS = 5 * 60 * 1000;

/** Código fijo para entornos de desarrollo/demo. */
const OTP_DEV_CODE = (process.env['OTP_DEV_CODE'] ?? '123456').trim();
/**
 * Escape explícito para pilotos en producción sin proveedor de SMS. Se
 * saneosea el valor: en el dashboard de Render es fácil pegarlo con comillas
 * (`"123456"`) o espacios finales, que quedan dentro del valor y NUNCA casan
 * con el `123456` que el usuario escribe. Se recortan espacios y comillas.
 */
const OTP_FALLBACK_CODE = (process.env['OTP_FALLBACK_CODE'] ?? '')
  .trim()
  .replace(/^["']|["']$/g, '');

// ── Rate limiting (en memoria, por teléfono) ──────────────────────────────────

const SEND_MIN_INTERVAL_MS = 45 * 1000;
// 10/hora: suficiente contra abuso y no frena una sesión de pruebas del piloto
// (con 5/hora el operador se bloqueaba a sí mismo probando los portales).
const SEND_MAX_PER_HOUR = 10;

const _sendLog = new Map<string, number[]>();

export class OtpRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpRateLimitError';
  }
}

function _assertRateLimit(phone: string): void {
  const now = Date.now();
  const history = (_sendLog.get(phone) ?? []).filter((t) => now - t < 60 * 60 * 1000);

  const last = history[history.length - 1];
  if (last !== undefined && now - last < SEND_MIN_INTERVAL_MS) {
    const wait = Math.ceil((SEND_MIN_INTERVAL_MS - (now - last)) / 1000);
    throw new OtpRateLimitError(`Espera ${wait}s antes de pedir otro código`);
  }
  if (history.length >= SEND_MAX_PER_HOUR) {
    throw new OtpRateLimitError('Límite de códigos por hora alcanzado. Intenta más tarde.');
  }

  history.push(now);
  _sendLog.set(phone, history);

  // Poda ocasional para que el mapa no crezca sin límite.
  if (_sendLog.size > 10_000) {
    for (const [key, times] of _sendLog) {
      if (times.every((t) => now - t >= 60 * 60 * 1000)) _sendLog.delete(key);
    }
  }
}

// ── Límite de intentos de verificación (anti fuerza bruta, por teléfono) ─────
// El authLimiter HTTP protege por IP; esto protege por TELÉFONO aunque el
// atacante rote IPs. En memoria: suficiente para una sola instancia.

const VERIFY_MAX_ATTEMPTS = 8;
const VERIFY_WINDOW_MS = 15 * 60 * 1000;

const _verifyLog = new Map<string, number[]>();

function _assertVerifyLimit(phone: string): void {
  const now = Date.now();
  const fails = (_verifyLog.get(phone) ?? []).filter((t) => now - t < VERIFY_WINDOW_MS);
  _verifyLog.set(phone, fails);
  if (fails.length >= VERIFY_MAX_ATTEMPTS) {
    throw new OtpRateLimitError('Demasiados intentos fallidos. Espera 15 minutos.');
  }
  if (_verifyLog.size > 10_000) {
    for (const [key, times] of _verifyLog) {
      if (times.every((t) => now - t >= VERIFY_WINDOW_MS)) _verifyLog.delete(key);
    }
  }
}

function _recordVerifyFail(phone: string): void {
  const list = _verifyLog.get(phone) ?? [];
  list.push(Date.now());
  _verifyLog.set(phone, list);
}

// ── Código local ──────────────────────────────────────────────────────────────

function _localCode(): string {
  if (NODE_ENV !== 'production') return OTP_DEV_CODE;
  if (OTP_FALLBACK_CODE) return OTP_FALLBACK_CODE;
  // Producción SIN Twilio y SIN OTP_FALLBACK_CODE: antes se generaba un código
  // aleatorio que no se entregaba por ningún canal → login imposible (nadie
  // puede saber el código). Para un piloto sin SMS es mucho más útil un código
  // fijo conocido. Se emite una advertencia FUERTE: esto NO es seguro para
  // producción con usuarios reales — ahí se debe configurar Twilio Verify.
  console.warn(
    '[OTP] ⚠️  Sin Twilio ni OTP_FALLBACK_CODE en producción: usando el código ' +
    'de piloto 123456. Configura Twilio Verify (o OTP_FALLBACK_CODE) antes de ' +
    'abrir a usuarios reales.',
  );
  return OTP_DEV_CODE; // 123456
}

// ── Diagnóstico ───────────────────────────────────────────────────────────────

/**
 * Modo OTP efectivo para usuarios (conductor/cliente/empresa) y para el panel
 * admin. Valores en español porque se muestran tal cual en /health y en el
 * pie del panel — permiten diagnosticar producción con una sola captura.
 */
export function otpMode(): { users: string; admin: string } {
  if (isSmsConfigured()) return { users: 'twilio-sms', admin: 'twilio-sms' };
  if (NODE_ENV !== 'production') return { users: 'dev-123456', admin: 'dev-123456' };
  if (OTP_FALLBACK_CODE) return { users: 'codigo-fijo-propio', admin: 'codigo-fijo-propio' };
  return { users: 'piloto-123456', admin: 'cerrado' };
}

// ── Admin (panel de operación) ────────────────────────────────────────────────
// El admin NUNCA acepta el código piloto público en producción: el repositorio
// es público y 123456 está documentado — sería una puerta abierta. Además la
// validación es directa contra el secreto (sin otp_sessions): así nadie puede
// "sembrar" una sesión con el código de usuario desde el login de conductor y
// reutilizarla contra el panel.

export class OtpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpConfigError';
  }
}

function _adminCode(): string | null {
  if (NODE_ENV !== 'production') return OTP_DEV_CODE;
  if (OTP_FALLBACK_CODE) return OTP_FALLBACK_CODE;
  return null; // cerrado por diseño
}

function _safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a.padEnd(32, '\0'));
  const bufB = Buffer.from(b.padEnd(32, '\0'));
  return a.length === b.length && timingSafeEqual(bufA, bufB);
}

/** Envía (o habilita) el OTP del panel admin. Lanza OtpConfigError si está cerrado. */
export async function requestAdminOtp(phone: string): Promise<void> {
  _assertRateLimit(phone);
  if (isSmsConfigured()) {
    await sendSmsVerification(phone);
    return;
  }
  if (_adminCode() === null) {
    throw new OtpConfigError(
      'El acceso admin en producción está cerrado: define OTP_FALLBACK_CODE ' +
      '(o configura Twilio Verify) en Render y redespliega.',
    );
  }
  // Código fijo conocido por el operador: no hay nada que enviar ni guardar.
}

/** Valida el OTP del panel admin. Lanza Error legible si es inválido. */
export async function validateAdminOtp(phone: string, otp: string): Promise<void> {
  _assertVerifyLimit(phone);
  if (isSmsConfigured()) {
    const ok = await checkSmsVerification(phone, otp);
    if (!ok) {
      _recordVerifyFail(phone);
      throw new Error('Código inválido');
    }
    return;
  }
  const expected = _adminCode();
  if (expected === null) {
    throw new OtpConfigError(
      'El acceso admin en producción está cerrado: define OTP_FALLBACK_CODE ' +
      '(o configura Twilio Verify) en Render y redespliega.',
    );
  }
  if (!_safeEqual(otp, expected)) {
    _recordVerifyFail(phone);
    throw new Error('Código inválido');
  }
}

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Genera y envía un OTP para el teléfono dado.
 * @param driverId Si se conoce, vincula la sesión OTP local al conductor.
 */
export async function requestOtp(phone: string, driverId?: string): Promise<void> {
  _assertRateLimit(phone);

  if (isSmsConfigured()) {
    await sendSmsVerification(phone);
    return;
  }

  if (NODE_ENV === 'production' && !OTP_FALLBACK_CODE) {
    console.warn(
      '[OTP] Producción sin TWILIO_* ni OTP_FALLBACK_CODE: se generó un código ' +
      'aleatorio que no se entrega por ningún canal. Configura Twilio Verify ' +
      '(o OTP_FALLBACK_CODE para pilotos) para habilitar el login.',
    );
  }

  const code = _localCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.otpSession.updateMany({
    where: { phone, used: false },
    data: { used: true },
  });
  await prisma.otpSession.create({
    data: { phone, code, expiresAt, driverId: driverId ?? null },
  });
}

/**
 * Valida el OTP. Lanza Error con mensaje legible si es inválido/expirado.
 */
export async function validateOtp(phone: string, otp: string): Promise<void> {
  _assertVerifyLimit(phone);

  if (isSmsConfigured()) {
    const ok = await checkSmsVerification(phone, otp);
    if (!ok) {
      _recordVerifyFail(phone);
      throw new Error('Código inválido');
    }
    return;
  }

  const session = await prisma.otpSession.findFirst({
    where: { phone, used: false, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) {
    _recordVerifyFail(phone);
    throw new Error('No hay un código solicitado para este teléfono. Pide uno nuevo.');
  }
  if (new Date() > session.expiresAt) {
    await prisma.otpSession.update({ where: { id: session.id }, data: { used: true } });
    throw new Error('El código expiró. Pide uno nuevo.');
  }
  if (!_safeEqual(session.code, otp)) {
    _recordVerifyFail(phone);
    throw new Error('Código inválido');
  }

  await prisma.otpSession.update({ where: { id: session.id }, data: { used: true } });
}
