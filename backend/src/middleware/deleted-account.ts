// ── Un token de una cuenta borrada deja de valer ─────────────────────────────
//
// Borrar la cuenta reescribe el teléfono a un valor lápida, así que nadie puede
// volver a ENTRAR con ella. Pero el token que el titular ya tenía en el
// teléfono sigue siendo criptográficamente válido treinta días más: sin esta
// comprobación, "eliminé mi cuenta" y la app seguiría pidiendo viajes con ella
// hasta que caducara. Eso no es haber borrado nada.
//
// Se comprueba contra la base con caché corta. Una lectura por clave primaria
// y por usuario cada minuto no se nota, y acota la ventana en la que un token
// recién revocado seguiría pasando — el borrado es una acción del propio
// titular, que acaba de cerrar sesión, no una carrera con un atacante.

import { prisma } from '../lib/prisma';

const TTL_MS = 60_000;

interface Entrada {
  borrada: boolean;
  hasta: number;
}

const _cache = new Map<string, Entrada>();

function _leer(clave: string, ahora: number): boolean | null {
  const e = _cache.get(clave);
  if (!e || e.hasta <= ahora) return null;
  return e.borrada;
}

function _guardar(clave: string, borrada: boolean, ahora: number): void {
  if (_cache.size > 10_000) {
    for (const [k, v] of _cache) if (v.hasta <= ahora) _cache.delete(k);
  }
  _cache.set(clave, { borrada, hasta: ahora + TTL_MS });
}

export async function clienteBorrado(clientId: string): Promise<boolean> {
  const ahora = Date.now();
  const cacheado = _leer(`c:${clientId}`, ahora);
  if (cacheado !== null) return cacheado;

  const u = await prisma.user.findUnique({
    where: { id: clientId },
    select: { deletedAt: true },
  });
  // Una cuenta que ya no existe se trata como borrada: el token apunta a nada.
  const borrada = !u || u.deletedAt !== null;
  _guardar(`c:${clientId}`, borrada, ahora);
  return borrada;
}

export async function conductorBorrado(driverId: string): Promise<boolean> {
  const ahora = Date.now();
  const cacheado = _leer(`d:${driverId}`, ahora);
  if (cacheado !== null) return cacheado;

  const d = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { deletedAt: true },
  });
  // Ojo: el conductor SIN registrar tiene un token cuyo driverId es su teléfono
  // y todavía no existe fila. Ese caso no es una cuenta borrada — es una cuenta
  // que aún no ha nacido, y el registro necesita el token para completarse.
  const borrada = d !== null && d.deletedAt !== null;
  _guardar(`d:${driverId}`, borrada, ahora);
  return borrada;
}

/** Tras borrar, invalida la entrada para que el corte sea inmediato. */
export function olvidarCuenta(tipo: 'cliente' | 'conductor', id: string): void {
  _cache.delete(`${tipo === 'cliente' ? 'c' : 'd'}:${id}`);
}

/** Solo para pruebas. */
export function _resetCacheBorrados(): void {
  _cache.clear();
}
