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
const OTP_DEV_CODE = process.env['OTP_DEV_CODE'] ?? '123456';
/** Escape explícito para pilotos en producción sin proveedor de SMS. */
const OTP_FALLBACK_CODE = process.env['OTP_FALLBACK_CODE'] ?? '';

// ── Rate limiting (en memoria, por teléfono) ──────────────────────────────────

const SEND_MIN_INTERVAL_MS = 45 * 1000;
const SEND_MAX_PER_HOUR = 5;

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

// ── Código local ──────────────────────────────────────────────────────────────

function _localCode(): string {
  if (NODE_ENV !== 'production') return OTP_DEV_CODE;
  if (OTP_FALLBACK_CODE) return OTP_FALLBACK_CODE;
  return Math.floor(100000 + Math.random() * 900000).toString();
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
  if (isSmsConfigured()) {
    const ok = await checkSmsVerification(phone, otp);
    if (!ok) throw new Error('Invalid OTP');
    return;
  }

  const session = await prisma.otpSession.findFirst({
    where: { phone, used: false, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) throw new Error('No OTP requested for this phone number');
  if (new Date() > session.expiresAt) {
    await prisma.otpSession.update({ where: { id: session.id }, data: { used: true } });
    throw new Error('OTP has expired');
  }
  if (session.code !== otp) throw new Error('Invalid OTP');

  await prisma.otpSession.update({ where: { id: session.id }, data: { used: true } });
}
