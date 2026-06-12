// ─────────────────────────────────────────────────────────────────────────────
// SMS OTP via Twilio Verify (https://www.twilio.com/docs/verify/api).
//
// Activación por configuración: con TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
// TWILIO_VERIFY_SID definidos, el envío y la comprobación del código se
// delegan a Twilio (Twilio genera el código, lo envía por SMS y lo valida —
// nunca toca nuestra base de datos). Sin ellos, isSmsConfigured() devuelve
// false y otp.service usa el flujo local (código en BD, sin SMS).
//
// Se usa fetch (Node ≥ 18) en vez del SDK de Twilio para no sumar
// dependencias: Verify son dos endpoints REST con Basic Auth.
// ─────────────────────────────────────────────────────────────────────────────

const TWILIO_ACCOUNT_SID = process.env['TWILIO_ACCOUNT_SID'] ?? '';
const TWILIO_AUTH_TOKEN = process.env['TWILIO_AUTH_TOKEN'] ?? '';
const TWILIO_VERIFY_SID = process.env['TWILIO_VERIFY_SID'] ?? '';
// Remitente para SMS transaccionales (alertas SOS): un Messaging Service SID
// ("MG...") o un número Twilio en E.164. Independiente de Verify.
const TWILIO_MESSAGING_SERVICE_SID = process.env['TWILIO_MESSAGING_SERVICE_SID'] ?? '';
const TWILIO_FROM_NUMBER = process.env['TWILIO_FROM_NUMBER'] ?? '';

const VERIFY_BASE = 'https://verify.twilio.com/v2/Services';
const MESSAGES_URL = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

export function isSmsConfigured(): boolean {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_VERIFY_SID);
}

/** Hay credenciales para SMS transaccionales (no OTP), p. ej. alertas SOS. */
export function isSmsSenderConfigured(): boolean {
  return Boolean(
    TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && (TWILIO_MESSAGING_SERVICE_SID || TWILIO_FROM_NUMBER),
  );
}

/** Teléfono en E.164 estricto (Twilio rechaza espacios): "+573124567890". */
export function toE164(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}

function _authHeader(): string {
  const raw = `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

async function _post(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${VERIFY_BASE}/${TWILIO_VERIFY_SID}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: _authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Twilio devuelve { message, code } en errores; nunca propagar el token.
    const msg = typeof body['message'] === 'string' ? body['message'] : `Twilio HTTP ${res.status}`;
    throw new Error(`SMS provider error: ${msg}`);
  }
  return body;
}

/** Pide a Twilio Verify que genere y envíe un código por SMS. */
export async function sendSmsVerification(phone: string): Promise<void> {
  await _post('Verifications', { To: toE164(phone), Channel: 'sms' });
}

/**
 * Comprueba el código contra Twilio Verify.
 * Devuelve true solo si Twilio responde status "approved".
 */
export async function checkSmsVerification(phone: string, code: string): Promise<boolean> {
  try {
    const body = await _post('VerificationCheck', { To: toE164(phone), Code: code });
    return body['status'] === 'approved';
  } catch (err) {
    // Twilio responde 404 cuando la verificación expiró o ya fue usada —
    // para el llamador eso es simplemente un código inválido.
    if (err instanceof Error && /404|not found/i.test(err.message)) return false;
    throw err;
  }
}

/**
 * Envía un SMS transaccional (alertas SOS, links de seguimiento).
 * Devuelve true si Twilio aceptó el mensaje. No lanza: las alertas nunca
 * deben tumbar el flujo que las origina.
 */
export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!isSmsSenderConfigured()) return false;
  try {
    const form: Record<string, string> = { To: toE164(to), Body: body };
    if (TWILIO_MESSAGING_SERVICE_SID) form['MessagingServiceSid'] = TWILIO_MESSAGING_SERVICE_SID;
    else form['From'] = TWILIO_FROM_NUMBER;

    const res = await fetch(MESSAGES_URL, {
      method: 'POST',
      headers: {
        Authorization: _authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form).toString(),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      console.error(`[SMS] Twilio rechazó el envío (HTTP ${res.status}): ${String(err['message'] ?? '')}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[SMS] Error de red enviando SMS:', err instanceof Error ? err.message : 'unknown');
    return false;
  }
}
