/**
 * La puerta de «Entrar con Google / Apple».
 *
 * Un token aceptado aquí abre la sesión de la cuenta que dice ser, así que se
 * prueba cada forma conocida de colar uno falso — con llaves RSA generadas en
 * la propia prueba, sin red.
 */
import { describe, it, expect } from 'vitest';
import { createHmac, createSign, generateKeyPairSync } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  correoVerificado,
  kidDelToken,
  nombreDelToken,
  TokenInvalido,
  verificarTokenIdentidad,
  type LlavePublica,
} from './id-token';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as { n: string; e: string };
const LLAVES: LlavePublica[] = [{ kid: 'k1', kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256' }];

const AHORA = 1_800_000_000;
const GOOGLE = { emisores: ['https://accounts.google.com'], audiencias: ['web-client.apps.googleusercontent.com'] };

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

function firmar(cuerpo: object, cab: object = { alg: 'RS256', kid: 'k1', typ: 'JWT' }): string {
  const datos = `${b64(cab)}.${b64(cuerpo)}`;
  const firma = createSign('RSA-SHA256').update(datos).sign(privateKey).toString('base64url');
  return `${datos}.${firma}`;
}

const valido = {
  iss: 'https://accounts.google.com',
  aud: 'web-client.apps.googleusercontent.com',
  sub: '1122334455',
  exp: AHORA + 600,
  iat: AHORA - 10,
  email: 'Ana@Gmail.com',
  email_verified: true,
  name: 'Ana Pérez',
};

const verificar = (t: string, extra: Partial<typeof GOOGLE> = {}) =>
  verificarTokenIdentidad(t, { llaves: LLAVES, ...GOOGLE, ...extra, ahoraS: AHORA });

describe('un token auténtico', () => {
  it('pasa y entrega el sub', () => {
    expect(verificar(firmar(valido)).sub).toBe('1122334455');
  });

  it('lee el kid de la cabecera para pedir la llave', () => {
    expect(kidDelToken(firmar(valido))).toBe('k1');
    expect(kidDelToken('basura')).toBeNull();
  });
});

describe('los tokens falsos NO pasan', () => {
  it('cuerpo alterado tras firmar (cambiar el sub a otra cuenta)', () => {
    const [c, , f] = firmar(valido).split('.');
    const otro = b64({ ...valido, sub: 'cuenta-de-otra-persona' });
    expect(() => verificar(`${c}.${otro}.${f}`)).toThrow(TokenInvalido);
  });

  it('firmado con otra llave', () => {
    const otra = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const datos = `${b64({ alg: 'RS256', kid: 'k1' })}.${b64(valido)}`;
    const firma = createSign('RSA-SHA256').update(datos).sign(otra).toString('base64url');
    expect(() => verificar(`${datos}.${firma}`)).toThrow('Firma inválida');
  });

  it('alg «none» sin firma', () => {
    const t = `${b64({ alg: 'none', kid: 'k1' })}.${b64(valido)}.`;
    expect(() => verificar(t)).toThrow('Algoritmo no admitido');
  });

  it('HS256 usando la llave PÚBLICA como secreto (confusión de algoritmo)', () => {
    const datos = `${b64({ alg: 'HS256', kid: 'k1' })}.${b64(valido)}`;
    const pem = publicKey.export({ format: 'pem', type: 'spki' });
    const firma = createHmac('sha256', pem).update(datos).digest('base64url');
    expect(() => verificar(`${datos}.${firma}`)).toThrow('Algoritmo no admitido');
  });

  it('llave desconocida', () => {
    expect(() => verificar(firmar(valido, { alg: 'RS256', kid: 'otra' }))).toThrow('Llave desconocida');
  });

  it('token de OTRA aplicación (otra audiencia)', () => {
    expect(() => verificar(firmar({ ...valido, aud: 'app-ajena.apps.googleusercontent.com' })))
      .toThrow('otra aplicación');
  });

  it('sin audiencia configurada no pasa NADA', () => {
    // Si no, cualquier token de Google de cualquier app entraría.
    expect(() => verificar(firmar(valido), { audiencias: [] })).toThrow('Sin audiencia');
  });

  it('emisor distinto (un token de Apple en la puerta de Google)', () => {
    expect(() => verificar(firmar({ ...valido, iss: 'https://appleid.apple.com' }))).toThrow('Emisor');
  });

  it('vencido', () => {
    expect(() => verificar(firmar({ ...valido, exp: AHORA - 120 }))).toThrow('vencido');
  });

  it('un minuto de desfase de reloj se tolera', () => {
    expect(verificar(firmar({ ...valido, exp: AHORA - 30 })).sub).toBe('1122334455');
  });

  it('emitido en el futuro', () => {
    expect(() => verificar(firmar({ ...valido, iat: AHORA + 600 }))).toThrow('futuro');
  });

  it('sin sub', () => {
    expect(() => verificar(firmar({ ...valido, sub: '' }))).toThrow('identificador');
  });

  it('mal formado o ilegible', () => {
    expect(() => verificar('a.b')).toThrow(TokenInvalido);
    expect(() => verificar('###.###.###')).toThrow(TokenInvalido);
  });
});

describe('lo que se toma del token', () => {
  it('el correo solo si el proveedor lo verificó', () => {
    expect(correoVerificado({ ...valido })).toBe('ana@gmail.com');
    // Apple lo manda como texto.
    expect(correoVerificado({ ...valido, email_verified: 'true' })).toBe('ana@gmail.com');
    expect(correoVerificado({ ...valido, email_verified: false })).toBeNull();
    expect(correoVerificado({ ...valido, email_verified: undefined })).toBeNull();
  });

  it('el nombre, si viene', () => {
    expect(nombreDelToken(valido)).toBe('Ana Pérez');
    expect(nombreDelToken({ ...valido, name: undefined, given_name: 'Luis', family_name: 'Gil' })).toBe('Luis Gil');
    expect(nombreDelToken({ ...valido, name: undefined })).toBeNull();
  });
});

describe('el servicio entra por el sub, NUNCA por el correo', () => {
  // Si «entrar con Google» buscara la cuenta por correo, bastaría con escribir
  // el correo de otra persona en tu perfil y esperar a que ella entre con
  // Google: acabaría dentro de TU cuenta (pre-secuestro). El correo solo se
  // consulta para saber si está libre antes de guardarlo.
  const fuente = readFileSync(join(__dirname, '../services/acceso-social.service.ts'), 'utf8');

  function cuerpoDe(nombre: string): string {
    const i = fuente.indexOf(`export async function ${nombre}(`);
    expect(i).toBeGreaterThan(-1);
    const j = fuente.indexOf('\nexport ', i + 10);
    return fuente.slice(i, j === -1 ? undefined : j);
  }

  it.each(['entrarConProveedor', 'vincularProveedor'])('%s no busca usuarios por correo', (f) => {
    expect(cuerpoDe(f)).not.toMatch(/where:\s*\{\s*email/);
  });

  it('la única consulta por correo es la de «¿está libre?» y solo pide el id', () => {
    const consultas = fuente.match(/where:\s*\{\s*email[^}]*\}[^)]*\)/g) ?? [];
    expect(consultas).toHaveLength(1);
    expect(consultas[0]).toContain('select: { id: true }');
  });
});
