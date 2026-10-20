/**
 * Aplicar y deshacer, sobre la vista previa, los cambios que propone la IA.
 *
 * El servidor ya decidió QUÉ cambios valen (`backend/src/lib/carta-ia.ts`):
 * ningún precio que no esté impreso, ninguna palabra que no estuviera. Aquí
 * solo se ejecutan, y la única regla propia es la que protege al dueño:
 *
 *   **un cambio solo se aplica si la fila sigue siendo la que la IA vio.**
 *
 * La revisión tarda unos segundos y la lista ya está en pantalla, así que el
 * dueño pudo corregir el precio o el nombre mientras tanto. Aplicar el
 * «después» de la IA encima le borraría lo que escribió, sin avisar. Si la
 * fila ya no coincide con el «antes», el cambio NO se aplica y se le dice.
 *
 * Todo o nada por cambio: pegar unos ingredientes a un plato y no quitar la
 * fila de la que salieron dejaría el texto dos veces.
 *
 * Sin React a propósito: así lo prueba el backend con las mismas reglas.
 */

import { pesosDeTexto } from '../../../variantes-carta'
import type { RolCarta } from '../../../roles-carta'

export interface FilaRevisable {
  linea: number
  nombre: string
  precio: number | null
  descripcion: string
  seccion: string
  rol: RolCarta
}

export interface CambioFila {
  linea: number
  antes: FilaRevisable | null
  despues: FilaRevisable | null
}

export type ConfianzaIA = 'alta' | 'media' | 'baja'

export interface CambioIA {
  id: string
  accion: string
  linea: number
  confianza: ConfianzaIA
  titulo: string
  motivo: string
  filas: CambioFila[]
}

/** Lo mínimo que este módulo necesita de una fila de la vista previa. */
export interface FilaDePantalla {
  id: number
  linea: number
  nombre: string
  /** Texto, porque el dueño lo está tecleando. */
  precio: string
  descripcion: string
  seccion: string
  rol: RolCarta
  aviso?: string
  motivoRol?: string
}

/** La fila de pantalla en la forma que entiende el revisor. */
export function filaParaRevisar(f: FilaDePantalla): FilaRevisable {
  return {
    linea: f.linea,
    nombre: f.nombre.trim(),
    precio: pesosDeTexto(f.precio),
    descripcion: f.descripcion.trim(),
    seccion: f.seccion.trim(),
    rol: f.rol,
  }
}

function coincide(f: FilaDePantalla, esperada: FilaRevisable): boolean {
  const a = filaParaRevisar(f)
  return a.nombre === esperada.nombre && a.precio === esperada.precio
    && a.descripcion === esperada.descripcion && a.seccion === esperada.seccion
    && a.rol === esperada.rol
}

function conValores<T extends FilaDePantalla>(f: T, v: FilaRevisable): T {
  // El aviso del lector («sin precio», «dos precios») ya no describe la fila:
  // la tocó la IA. Se quita en vez de dejar un ámbar que miente.
  const { aviso: _aviso, motivoRol: _motivo, ...resto } = f
  void _aviso
  void _motivo
  return {
    ...(resto as T),
    nombre: v.nombre,
    precio: v.precio == null ? '' : String(v.precio),
    descripcion: v.descripcion,
    seccion: v.seccion,
    rol: v.rol,
  }
}

export type Resultado<T> = { ok: true; filas: T[] } | { ok: false; filas: T[] }

/**
 * Pasa de un estado a otro: cada fila tiene que estar como dice `desde`, y
 * queda como dice `hacia` (null = no existe).
 */
function mover<T extends FilaDePantalla>(
  filas: T[],
  pasos: Array<{ linea: number; desde: FilaRevisable | null; hacia: FilaRevisable | null }>,
): Resultado<T> {
  // Primero se COMPRUEBA todo; solo si todo casa se escribe.
  for (const p of pasos) {
    const actual = filas.find((f) => f.linea === p.linea)
    if (p.desde === null ? actual !== undefined : !actual || !coincide(actual, p.desde)) {
      return { ok: false, filas }
    }
  }
  let nuevas = filas.slice()
  let siguienteId = filas.reduce((m, f) => Math.max(m, f.id), -1) + 1
  for (const p of pasos) {
    const i = nuevas.findIndex((f) => f.linea === p.linea)
    if (p.hacia === null) {
      nuevas = nuevas.filter((f) => f.linea !== p.linea)
    } else if (i >= 0) {
      nuevas[i] = conValores(nuevas[i]!, p.hacia)
    } else {
      // Vuelve una fila que se había quitado: a su sitio en el orden de la carta.
      const nueva = conValores({ id: siguienteId++, linea: p.linea } as T, p.hacia)
      const despues = nuevas.findIndex((f) => f.linea > p.linea)
      nuevas = despues < 0
        ? [...nuevas, nueva]
        : [...nuevas.slice(0, despues), nueva, ...nuevas.slice(despues)]
    }
  }
  return { ok: true, filas: nuevas }
}

/** Aplica un cambio. `ok: false` = alguna fila ya no es la que la IA vio. */
export function aplicarCambio<T extends FilaDePantalla>(filas: T[], c: CambioIA): Resultado<T> {
  return mover(filas, c.filas.map((f) => ({ linea: f.linea, desde: f.antes, hacia: f.despues })))
}

/** Lo contrario. `ok: false` = el dueño tocó la fila después del cambio. */
export function deshacerCambio<T extends FilaDePantalla>(filas: T[], c: CambioIA): Resultado<T> {
  return mover(
    filas,
    c.filas.slice().reverse().map((f) => ({ linea: f.linea, desde: f.despues, hacia: f.antes })),
  )
}
