/**
 * Entrar con Google o con Apple.
 *
 * POR QUÉ EXISTE. Sin un proveedor de SMS, el login por teléfono se apoya en
 * un código fijo (`OTP_FALLBACK_CODE`) que conoce todo el que prueba la app: con
 * él se entra en la cuenta de CUALQUIER número. Google y Apple sí verifican a
 * la persona — firman un token que dice «esta es la cuenta X» — y no cuestan
 * nada por inicio de sesión.
 *
 * LAS REGLAS QUE LO HACEN SEGURO:
 *
 * 1. Se entra por el `sub` del proveedor y NUNCA por el correo. El correo de
 *    una cuenta ZIPA lo puede escribir cualquiera en su perfil: si «entrar con
 *    Google» enlazara por correo, bastaría con poner el correo de otra persona
 *    en tu cuenta y esperar a que ella entre con Google — acabaría dentro de
 *    la tuya y tú verías su actividad (pre-secuestro de cuenta).
 * 2. Una cuenta nueva nace SIN teléfono. Pedir uno que no podemos comprobar
 *    solo crearía choques con el dueño real del número.
 * 3. Vincular Google a una cuenta que ya existe se hace DESDE DENTRO de esa
 *    cuenta (con su sesión), y un `sub` que ya pertenece a otra se rechaza.
 * 4. Con el proveedor sin configurar, el botón no existe: la ruta responde
 *    503 diciéndolo, y `/client/auth/providers` no lo anuncia.
 */
import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { LIMITES, traerConLimite } from '../lib/fetch-con-limite';
import { JWT_EXPIRES_IN, JWT_SECRET } from '../config/constants';
import type { ClientDTO, ClientJwtPayload } from '../types';
import {
  correoVerificado,
  kidDelToken,
  nombreDelToken,
  TokenInvalido,
  verificarTokenIdentidad,
  type LlavePublica,
} from '../lib/id-token';

export type Proveedor = 'google' | 'apple';

const lista = (v: string | undefined): string[] =>
  (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Configuración, leída en cada uso (no al importar): así `/health` y las rutas
 * ven el valor actual, y las pruebas pueden cambiarla sin recargar módulos.
 *
 * - `GOOGLE_OAUTH_CLIENT_IDS`: los ID de cliente OAuth cuyos tokens se aceptan.
 *   El PRIMERO es el «cliente web»: la app lo usa como `serverClientId` en
 *   Android y como `clientId` en la web, así que es la audiencia de los dos.
 * - `APPLE_CLIENT_IDS`: el bundle id de iOS y/o el Services ID (web y Android).
 * - `APPLE_SERVICES_ID` + `APPLE_REDIRECT_URI`: los que usa el flujo web de
 *   Apple (Android y navegador). Sin ellos, Apple solo funcionaría en iOS.
 */
export function configAcceso() {
  const google = lista(process.env['GOOGLE_OAUTH_CLIENT_IDS']);
  const apple = lista(process.env['APPLE_CLIENT_IDS']);
  const servicesId = (process.env['APPLE_SERVICES_ID'] ?? '').trim();
  const redirectUri = (process.env['APPLE_REDIRECT_URI'] ?? '').trim();
  return {
    google: google.length > 0 ? { clientId: google[0]!, audiencias: google } : null,
    apple:
      apple.length > 0
        ? {
            audiencias: apple,
            // El flujo web exige los dos; sin uno de ellos se anuncia Apple
            // solo donde es nativo (iOS).
            web: servicesId && redirectUri ? { servicesId, redirectUri } : null,
          }
        : null,
  };
}

/** Para `/health`: qué botones de acceso existen de verdad. */
export function modoAccesoSocial(): string {
  const c = configAcceso();
  const partes = [c.google ? 'google' : null, c.apple ? 'apple' : null].filter(Boolean);
  return partes.length ? partes.join('+') : 'apagado';
}

// ── Llaves públicas del proveedor, cacheadas ─────────────────────────────────

const JWKS: Record<Proveedor, string> = {
  google: 'https://www.googleapis.com/oauth2/v3/certs',
  apple: 'https://appleid.apple.com/auth/keys',
};
const EMISORES: Record<Proveedor, string[]> = {
  google: ['https://accounts.google.com', 'accounts.google.com'],
  apple: ['https://appleid.apple.com'],
};

/** Los proveedores rotan llaves cada pocos días; seis horas sobra. */
const VIGENCIA_LLAVES_MS = 6 * 60 * 60 * 1000;
/** Un `kid` desconocido fuerza a bajar de nuevo, pero no más de una vez por minuto. */
const ESPERA_RECARGA_MS = 60 * 1000;

const _cache = new Map<Proveedor, { llaves: LlavePublica[]; en: number }>();

/** Para pruebas: inyectar llaves sin red. */
export function _fijarLlaves(p: Proveedor, llaves: LlavePublica[]): void {
  _cache.set(p, { llaves, en: Date.now() });
}

async function _bajarLlaves(p: Proveedor): Promise<LlavePublica[]> {
  // Hay alguien con el dedo en «Entrar con…»: límite de interacción.
  const res = await traerConLimite(JWKS[p], {}, LIMITES.INTERACTIVO);
  if (!res.ok) throw new Error(`No se pudieron obtener las llaves de ${p} (${res.status})`);
  const json = (await res.json()) as { keys?: LlavePublica[] };
  const llaves = Array.isArray(json.keys) ? json.keys : [];
  _cache.set(p, { llaves, en: Date.now() });
  return llaves;
}

async function _llavesPara(p: Proveedor, kid: string | null): Promise<LlavePublica[]> {
  const c = _cache.get(p);
  const ahora = Date.now();
  if (!c) return _bajarLlaves(p);
  const vieja = ahora - c.en > VIGENCIA_LLAVES_MS;
  const falta = kid !== null && !c.llaves.some((l) => l.kid === kid);
  if (vieja || (falta && ahora - c.en > ESPERA_RECARGA_MS)) {
    try {
      return await _bajarLlaves(p);
    } catch {
      return c.llaves; // sin red, las que había; si el kid no está, fallará la verificación
    }
  }
  return c.llaves;
}

export class AccesoError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AccesoError';
  }
}

async function _verificar(p: Proveedor, token: string) {
  const c = configAcceso()[p];
  if (!c) {
    throw new AccesoError(
      p === 'google' ? 'Entrar con Google no está disponible todavía.' : 'Entrar con Apple no está disponible todavía.',
      503,
    );
  }
  if (typeof token !== 'string' || token.length < 20) {
    throw new AccesoError('Falta el token del proveedor.', 400);
  }
  try {
    const llaves = await _llavesPara(p, kidDelToken(token));
    return verificarTokenIdentidad(token, { llaves, emisores: EMISORES[p], audiencias: c.audiencias });
  } catch (e) {
    if (e instanceof TokenInvalido) {
      console.warn(`[AccesoSocial] ${p}: token rechazado — ${e.message}`);
      throw new AccesoError('No pudimos confirmar tu cuenta. Intenta de nuevo.', 401);
    }
    throw e;
  }
}

// ── La sesión: la MISMA que emite el login por código ────────────────────────

export function sesionDeCliente(user: Pick<User, 'id' | 'phone' | 'name'>): {
  token: string;
  client: ClientDTO;
} {
  const client: ClientDTO = {
    id: user.id,
    phone: user.phone,
    name: user.name ?? 'Pasajero',
    ...(user.name ? {} : { needsName: true }),
  };
  const payload: ClientJwtPayload = { clientId: user.id, phone: user.phone, role: 'client' };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { token, client };
}

const _columna = (p: Proveedor): 'googleSub' | 'appleSub' => (p === 'google' ? 'googleSub' : 'appleSub');

/** El correo verificado se guarda solo si nadie más lo tiene (es único). */
async function _correoLibre(email: string | null, excepto?: string): Promise<string | null> {
  if (!email) return null;
  const otro = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return !otro || otro.id === excepto ? email : null;
}

/**
 * Entrar (o abrir cuenta) con el token del proveedor.
 *
 * `nombreApp`: Apple NO pone el nombre en el token; la app lo recibe aparte,
 * y solo la primera vez. Se usa únicamente al CREAR la cuenta.
 */
export async function entrarConProveedor(
  p: Proveedor,
  tokenProveedor: string,
  nombreApp?: string | null,
): Promise<{ token: string; client: ClientDTO; nueva: boolean }> {
  const r = await _verificar(p, tokenProveedor);
  const col = _columna(p);

  const existente = await prisma.user.findUnique({ where: { [col]: r.sub } as never });
  if (existente) {
    if (existente.deletedAt || !existente.isActive) {
      throw new AccesoError('Esta cuenta fue eliminada.', 403);
    }
    return { ...sesionDeCliente(existente), nueva: false };
  }

  const nombreLimpio = (nombreApp ?? '').trim();
  const nombre = nombreDelToken(r) ?? (nombreLimpio.length >= 2 ? nombreLimpio.slice(0, 80) : null);
  const email = await _correoLibre(correoVerificado(r));

  try {
    const user = await prisma.user.create({
      data: { [col]: r.sub, name: nombre, email } as never,
    });
    return { ...sesionDeCliente(user as User), nueva: true };
  } catch (e) {
    // Dos toques seguidos al botón: el segundo choca con el único del `sub`.
    // No es un error para quien pulsó: ya tiene cuenta, se le da su sesión.
    const ya = await prisma.user.findUnique({ where: { [col]: r.sub } as never });
    if (ya) return { ...sesionDeCliente(ya), nueva: false };
    throw e;
  }
}

/**
 * Vincular Google/Apple a la cuenta en la que ya se está (p. ej. la abierta
 * con el teléfono), para poder entrar después con el botón.
 */
export async function vincularProveedor(
  clientId: string,
  p: Proveedor,
  tokenProveedor: string,
): Promise<{ vinculado: true }> {
  const r = await _verificar(p, tokenProveedor);
  const col = _columna(p);

  const duenio = await prisma.user.findUnique({ where: { [col]: r.sub } as never, select: { id: true } });
  if (duenio && duenio.id !== clientId) {
    throw new AccesoError(
      p === 'google'
        ? 'Esa cuenta de Google ya está vinculada a otra cuenta ZIPA.'
        : 'Ese Apple ID ya está vinculado a otra cuenta ZIPA.',
      409,
    );
  }
  const yo = await prisma.user.findUnique({ where: { id: clientId } });
  if (!yo) throw new AccesoError('Usuario no encontrado', 404);
  if (yo[col] && yo[col] !== r.sub) {
    throw new AccesoError(
      'Tu cuenta ya tiene otra cuenta de ese proveedor vinculada.',
      409,
    );
  }
  const email = yo.email ? undefined : (await _correoLibre(correoVerificado(r), clientId)) ?? undefined;
  await prisma.user.update({
    where: { id: clientId },
    data: { [col]: r.sub, ...(email ? { email } : {}) } as never,
  });
  return { vinculado: true };
}

/** Qué proveedores tiene vinculados una cuenta (para la pantalla de Cuenta). */
export async function proveedoresDe(clientId: string): Promise<{ google: boolean; apple: boolean; telefono: boolean }> {
  const u = await prisma.user.findUnique({
    where: { id: clientId },
    select: { googleSub: true, appleSub: true, phone: true },
  });
  return { google: !!u?.googleSub, apple: !!u?.appleSub, telefono: !!u?.phone };
}
