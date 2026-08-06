// ── ¿Puede arrancar el servicio con este OTP? ────────────────────────────────
//
// Sin proveedor de SMS el "OTP" es un código fijo que vale para CUALQUIER
// teléfono: una llave maestra, no un segundo factor. Quien la conozca entra
// como cualquier usuario, conductor o empresa — y si su número está en
// ADMIN_PHONES, al panel de operación.
//
// La decisión vive aquí, pura y sin efectos, para poder probarla: la ejecuta
// `config/constants.ts` al cargar y de su resultado depende que el proceso
// arranque. Una regla de seguridad que solo se puede comprobar desplegando no
// se comprueba nunca.

export const COMO_ACTIVAR_SMS =
  'Configura Twilio Verify en Render (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ' +
  'TWILIO_VERIFY_SID) para que cada usuario reciba su propio código por SMS.';

/**
 * Códigos que no protegen nada: el 123456 está documentado en este repositorio
 * público y el resto se adivinan antes de que salte el límite de intentos.
 */
const TRIVIALES = new Set([
  '123456', '000000', '111111', '222222', '333333', '444444',
  '555555', '666666', '777777', '888888', '999999', '654321', '012345',
]);

export interface EntornoOtp {
  /** NODE_ENV === 'production'. Fuera de producción nunca se bloquea nada. */
  production: boolean;
  /** Twilio Verify completo (SID + token + verify SID). */
  twilio: boolean;
  /** ALLOW_FIXED_OTP=true: el operador acepta el modo piloto a conciencia. */
  allowFixedOtp: boolean;
  /** OTP_FALLBACK_CODE ya saneado (sin espacios ni comillas). */
  codigoFijo: string;
}

export type VeredictoOtp =
  /** Arranca sin reparos: hay SMS real, o no es producción. */
  | { arranca: true; riesgo: false }
  /** Arranca en modo piloto: hay llave maestra y el operador la autorizó. */
  | { arranca: true; riesgo: true; aviso: string }
  /** No arranca: el motivo explica qué configurar. */
  | { arranca: false; motivo: string };

export function evaluarOtp(env: EntornoOtp): VeredictoOtp {
  if (!env.production || env.twilio) return { arranca: true, riesgo: false };

  if (!env.allowFixedOtp) {
    return {
      arranca: false,
      motivo:
        'OTP inseguro: en producción no hay proveedor de SMS, así que un único código ' +
        'fijo abriría la sesión de cualquier teléfono (incluido el panel admin). ' +
        COMO_ACTIVAR_SMS +
        ' Si esto es un piloto controlado y lo aceptas a conciencia, define ' +
        'ALLOW_FIXED_OTP=true junto con un OTP_FALLBACK_CODE propio de 6 dígitos.',
    };
  }

  // Con el escape puesto pero sin código propio, el servicio caería al 123456
  // del repositorio: peor que no tener nada, porque además parece configurado.
  if (!env.codigoFijo) {
    return {
      arranca: false,
      motivo:
        'ALLOW_FIXED_OTP=true pero falta OTP_FALLBACK_CODE: el servicio caería al código ' +
        'de piloto que está publicado en el repositorio. Define OTP_FALLBACK_CODE con 6 ' +
        'dígitos que solo tú conozcas. ' + COMO_ACTIVAR_SMS,
    };
  }

  if (TRIVIALES.has(env.codigoFijo) || !/^\d{6,}$/.test(env.codigoFijo)) {
    return {
      arranca: false,
      motivo:
        'OTP_FALLBACK_CODE no sirve como llave maestra: debe tener al menos 6 dígitos y no ' +
        'ser una secuencia obvia (123456, 000000, 111111…). Elige uno al azar. ' +
        COMO_ACTIVAR_SMS,
    };
  }

  return {
    arranca: true,
    riesgo: true,
    aviso:
      'MODO PILOTO: un solo código abre la sesión de CUALQUIER teléfono ' +
      '(ALLOW_FIXED_OTP=true). No abras la plataforma a usuarios reales así. ' +
      COMO_ACTIVAR_SMS,
  };
}

/** Quita espacios y las comillas que se cuelan al pegar el valor en Render. */
export function sanearCodigo(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^["']|["']$/g, '');
}
