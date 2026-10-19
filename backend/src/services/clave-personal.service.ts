// ── Clave personal: guardarla, comprobarla y restablecerla ───────────────────
//
// Las reglas puras (formato, hash, bloqueo) viven en `lib/clave-personal`.
// Aquí está lo que toca la base: tres tipos de cuenta con la misma clave y un
// pase de cinco minutos para no pedir el código dos veces.

import jwt from 'jsonwebtoken';

import { JWT_SECRET } from '../config/constants';
import { prisma } from '../lib/prisma';
import { normalizeColombianPhone } from './auth.service';
import {
  claveCoincide,
  hashClave,
  minutosBloqueo,
  motivoClaveInvalida,
  trasFallo,
} from '../lib/clave-personal';

/** De quién es la clave. */
export type TipoCuenta = 'driver' | 'operator_member' | 'business';
export interface Cuenta {
  tipo: TipoCuenta;
  id: string;
}

export type CodigoClave =
  | 'clave_requerida'
  | 'clave_incorrecta'
  | 'clave_bloqueada'
  | 'clave_invalida'
  | 'pase_vencido';

/**
 * Un error de clave. OJO con el código HTTP: una clave equivocada es 403, no
 * 401. Las apps y el portal tratan TODO 401 de una petición con sesión como
 * «sesión vencida» y cierran la sesión; con 401 aquí, equivocarse al escribir
 * la clave actual para cambiarla te sacaba de la app.
 */
export class ClaveError extends Error {
  constructor(
    message: string,
    readonly code: CodigoClave,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ClaveError';
  }
}

interface Fila {
  loginPinHash: string | null;
  loginPinFails: number;
  loginPinLockedUntil: Date | null;
}

const SELECT = { loginPinHash: true, loginPinFails: true, loginPinLockedUntil: true } as const;

async function _leer(c: Cuenta): Promise<Fila | null> {
  switch (c.tipo) {
    case 'driver':
      return prisma.driver.findUnique({ where: { id: c.id }, select: SELECT });
    case 'operator_member':
      return prisma.operatorMember.findUnique({ where: { id: c.id }, select: SELECT });
    case 'business':
      return prisma.business.findUnique({ where: { id: c.id }, select: SELECT });
  }
}

async function _escribir(c: Cuenta, data: Partial<Fila>): Promise<void> {
  switch (c.tipo) {
    case 'driver':
      await prisma.driver.update({ where: { id: c.id }, data });
      return;
    case 'operator_member':
      await prisma.operatorMember.update({ where: { id: c.id }, data });
      return;
    case 'business':
      await prisma.business.update({ where: { id: c.id }, data });
      return;
  }
}

/** ¿La cuenta ya tiene clave? */
export async function tieneClave(c: Cuenta): Promise<boolean> {
  return !!(await _leer(c))?.loginPinHash;
}

/**
 * Comprueba la clave de una cuenta, o lanza `ClaveError`.
 *
 * Cuenta sin clave: pasa (es la que todavía no la ha creado; la app se la
 * pide al entrar). Cuenta bloqueada: no se mira la clave, ni siquiera la
 * correcta — si no, el bloqueo no frenaría a quien está adivinando.
 */
export async function comprobarClave(
  c: Cuenta,
  clave: string | undefined,
  ahora: Date = new Date(),
): Promise<void> {
  const fila = await _leer(c);
  if (!fila?.loginPinHash) return;

  const estado = { fallos: fila.loginPinFails, bloqueadaHasta: fila.loginPinLockedUntil };
  const min = minutosBloqueo(estado, ahora);
  if (min > 0) {
    throw new ClaveError(
      `Demasiados intentos con una clave equivocada. Espera ${min} min o pide ` +
        'que te la restablezcan desde soporte.',
      'clave_bloqueada',
      429,
    );
  }
  if (!clave || !clave.trim()) {
    throw new ClaveError('Escribe tu clave personal.', 'clave_requerida', 403);
  }
  if (!claveCoincide(fila.loginPinHash, clave)) {
    const nuevo = trasFallo(estado, ahora);
    await _escribir(c, { loginPinFails: nuevo.fallos, loginPinLockedUntil: nuevo.bloqueadaHasta });
    throw new ClaveError(
      nuevo.bloqueadaHasta
        ? 'Clave equivocada. Por seguridad, la cuenta queda bloqueada 15 minutos.'
        : 'Clave equivocada.',
      nuevo.bloqueadaHasta ? 'clave_bloqueada' : 'clave_incorrecta',
      nuevo.bloqueadaHasta ? 429 : 403,
    );
  }
  if (fila.loginPinFails > 0 || fila.loginPinLockedUntil) {
    await _escribir(c, { loginPinFails: 0, loginPinLockedUntil: null });
  }
}

/**
 * Crea o cambia la clave. Si ya tenía una, exige la ACTUAL: quien encontró el
 * teléfono desbloqueado no puede cambiarla y dejar fuera a su dueño.
 */
export async function fijarClave(
  c: Cuenta,
  nueva: unknown,
  actual?: string,
): Promise<void> {
  const motivo = motivoClaveInvalida(nueva);
  if (motivo) throw new ClaveError(motivo, 'clave_invalida', 400);
  const fila = await _leer(c);
  if (!fila) throw new ClaveError('Cuenta no encontrada.', 'clave_invalida', 404);
  if (fila.loginPinHash) {
    if (!actual) {
      throw new ClaveError('Para cambiarla, escribe primero tu clave actual.', 'clave_requerida', 403);
    }
    await comprobarClave(c, actual);
  }
  await _escribir(c, {
    loginPinHash: hashClave(String(nueva)),
    loginPinFails: 0,
    loginPinLockedUntil: null,
  });
}

/**
 * Borra la clave de TODA cuenta con ese teléfono (conductor, miembro de una
 * empresa, negocio). Lo hace el admin cuando alguien la olvidó o denuncia que
 * otra persona entró primero y se la puso. Devuelve cuántas cuentas tocó.
 */
export async function restablecerClavesPorTelefono(
  rawPhone: string,
): Promise<{ conductores: number; empresas: number; negocios: number }> {
  const phone = normalizeColombianPhone(rawPhone);
  const limpio = { loginPinHash: null, loginPinFails: 0, loginPinLockedUntil: null };
  const conductores = await prisma.driver.updateMany({ where: { phone }, data: limpio });
  const empresas = await prisma.operatorMember.updateMany({ where: { phone }, data: limpio });
  // Los negocios guardaron el teléfono como lo escribió el dueño: se compara
  // normalizado, con el mismo criterio que la recuperación del portal.
  const ultimos4 = phone.slice(-4);
  const candidatos = await prisma.business.findMany({
    where: { OR: [{ phone: { endsWith: ultimos4 } }, { whatsapp: { endsWith: ultimos4 } }] },
    select: { id: true, phone: true, whatsapp: true },
    take: 200,
  });
  const ids = candidatos
    .filter(
      (b) =>
        (b.phone != null && normalizeColombianPhone(b.phone) === phone) ||
        (b.whatsapp != null && normalizeColombianPhone(b.whatsapp) === phone),
    )
    .map((b) => b.id);
  const negocios = ids.length
    ? await prisma.business.updateMany({ where: { id: { in: ids } }, data: limpio })
    : { count: 0 };
  return { conductores: conductores.count, empresas: empresas.count, negocios: negocios.count };
}

// ── El pase de cinco minutos ─────────────────────────────────────────────────
//
// El código del login se consume al validarlo. Si la cuenta pide clave y no
// vino, no tiene sentido hacer pedir otro código: se entrega un pase corto que
// solo sirve para terminar ESE ingreso con la clave. No es una sesión —no
// abre ninguna puerta (la del conductor rechaza tokens con `purpose`)—.

interface PaseClave {
  purpose: 'clave_pendiente';
  tipo: TipoCuenta;
  /** Id de la cuenta; para negocios, el teléfono (puede tener varios). */
  ref: string;
}

export function emitirPaseClave(tipo: TipoCuenta, ref: string): string {
  const pase: PaseClave = { purpose: 'clave_pendiente', tipo, ref };
  return jwt.sign(pase, JWT_SECRET, { expiresIn: '5m' });
}

export function leerPaseClave(pase: unknown, tipo: TipoCuenta): string {
  if (typeof pase !== 'string' || !pase) {
    throw new ClaveError('Vuelve a pedir el código.', 'pase_vencido', 401);
  }
  try {
    const d = jwt.verify(pase, JWT_SECRET) as Partial<PaseClave>;
    if (d.purpose !== 'clave_pendiente' || d.tipo !== tipo || typeof d.ref !== 'string') {
      throw new Error('pase de otro tipo');
    }
    return d.ref;
  } catch {
    throw new ClaveError(
      'Pasaron más de cinco minutos. Vuelve a pedir el código.',
      'pase_vencido',
      401,
    );
  }
}
