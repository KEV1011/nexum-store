/**
 * Verificar el token de identidad que entregan Google y Apple.
 *
 * Al entrar con esos botones, la app recibe del proveedor un JWT firmado
 * (`id_token` / `identityToken`) y nos lo manda. Este archivo decide si es
 * auténtico. Es la puerta entera: un token aceptado aquí abre una sesión de
 * la cuenta cuyo `sub` trae, así que cada comprobación cuenta y ninguna se
 * puede saltar «porque el resto ya pasó».
 *
 * Puro a propósito (las llaves llegan como argumento, la hora también): así
 * se prueba con llaves generadas en la propia prueba, sin red y sin mentirle
 * al reloj del proceso. Quien baja y cachea las llaves públicas del proveedor
 * es `acceso-social.service.ts`.
 *
 * Con `crypto` de Node y no con una librería de JWT: son cuarenta líneas, y
 * una dependencia transitiva que cambie de versión no puede tocar la puerta
 * de entrada sin que lo veamos en el diff.
 */
import { createPublicKey, verify as verificarFirma } from 'crypto';

export interface LlavePublica {
  kid: string;
  kty: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

export interface ReclamosIdentidad {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat?: number;
  email?: string;
  /** Google lo manda booleano; Apple, a veces como texto «true». */
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
  family_name?: string;
  nonce?: string;
}

export class TokenInvalido extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'TokenInvalido';
  }
}

/** Margen para relojes desfasados entre el teléfono, el proveedor y nosotros. */
const HOLGURA_S = 60;

function b64urlJson(parte: string): Record<string, unknown> {
  try {
    const v = JSON.parse(Buffer.from(parte, 'base64url').toString('utf8')) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* cae abajo */
  }
  throw new TokenInvalido('Token ilegible');
}

/** El `kid` de la cabecera, para saber qué llave pedir. */
export function kidDelToken(token: string): string | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  try {
    const cab = b64urlJson(partes[0]!);
    return typeof cab['kid'] === 'string' ? cab['kid'] : null;
  } catch {
    return null;
  }
}

export function verificarTokenIdentidad(
  token: string,
  opciones: {
    llaves: LlavePublica[];
    emisores: string[];
    audiencias: string[];
    ahoraS?: number;
  },
): ReclamosIdentidad {
  if (opciones.audiencias.length === 0) {
    // Sin audiencia configurada, cualquier token de Google de CUALQUIER app
    // pasaría: una app ajena podría entrar con el token de sus usuarios.
    throw new TokenInvalido('Sin audiencia configurada');
  }
  const partes = token.split('.');
  if (partes.length !== 3) throw new TokenInvalido('Token mal formado');
  const [cabB64, cuerpoB64, firmaB64] = partes as [string, string, string];

  const cab = b64urlJson(cabB64);
  // SOLO RS256, que es lo que firman los dos proveedores. Aceptar el `alg`
  // que diga la cabecera es la vulnerabilidad clásica de JWT («none», o HS256
  // usando la llave pública como secreto).
  if (cab['alg'] !== 'RS256') throw new TokenInvalido('Algoritmo no admitido');
  const llave = opciones.llaves.find((l) => l.kid === cab['kid']);
  if (!llave || llave.kty !== 'RSA' || !llave.n || !llave.e) {
    throw new TokenInvalido('Llave desconocida');
  }

  const publica = createPublicKey({ key: { kty: 'RSA', n: llave.n, e: llave.e }, format: 'jwk' });
  const firmaOk = verificarFirma(
    'RSA-SHA256',
    Buffer.from(`${cabB64}.${cuerpoB64}`),
    publica,
    Buffer.from(firmaB64, 'base64url'),
  );
  if (!firmaOk) throw new TokenInvalido('Firma inválida');

  const r = b64urlJson(cuerpoB64) as unknown as ReclamosIdentidad;
  if (!opciones.emisores.includes(r.iss)) throw new TokenInvalido('Emisor inesperado');

  const aud = Array.isArray(r.aud) ? r.aud : [r.aud];
  if (!aud.some((a) => opciones.audiencias.includes(a))) {
    throw new TokenInvalido('El token es de otra aplicación');
  }

  const ahora = opciones.ahoraS ?? Math.floor(Date.now() / 1000);
  if (typeof r.exp !== 'number' || r.exp + HOLGURA_S < ahora) {
    throw new TokenInvalido('Token vencido');
  }
  if (typeof r.iat === 'number' && r.iat - HOLGURA_S > ahora) {
    throw new TokenInvalido('Token emitido en el futuro');
  }
  if (typeof r.sub !== 'string' || r.sub.length === 0) {
    throw new TokenInvalido('Token sin identificador');
  }
  return r;
}

/** `email_verified` llega booleano (Google) o como texto (Apple). */
export function correoVerificado(r: ReclamosIdentidad): string | null {
  const ok = r.email_verified === true || r.email_verified === 'true';
  const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';
  return ok && email.includes('@') ? email : null;
}

/** Nombre para mostrar, si el proveedor lo trae. */
export function nombreDelToken(r: ReclamosIdentidad): string | null {
  const n = (r.name ?? [r.given_name, r.family_name].filter(Boolean).join(' ')).trim();
  return n.length >= 2 ? n.slice(0, 80) : null;
}
