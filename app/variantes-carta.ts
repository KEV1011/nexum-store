// ── El mismo plato en varios tamaños, del lado del portal ────────────────────
//
// Vive aquí y no en el backend porque el portal es otro servicio y no puede
// importar de `backend/src`. Es la copia de `backend/src/lib/carta-variantes.ts`
// para lo único que el navegador necesita decidir solo: si el botón «Crear» se
// puede pulsar y, si no, qué le falta al dueño.
//
// `backend/src/lib/carta-variantes-portal.test.ts` pasa la MISMA tabla de casos
// por las dos y falla si discrepan — el patrón de `app/moneda.ts`. Sin esa
// prueba, un día el botón se habilitaría para algo que el servidor rechaza, que
// es el peor sitio donde dejar que dos copias se separen: el dueño acaba de
// revisar cuarenta platos y lo pierde en un error que no entiende.
//
// La autoridad sigue siendo el backend: esto adelanta el veredicto, no lo
// sustituye.

/** Cuántos tamaños puede tener un plato. */
export const MAX_TAMANOS = 6;

/** Cómo se llama el grupo que se crea, mientras el dueño no lo cambie. */
export const GRUPO_TAMANO = 'Tamaño'

export interface VarianteParaValidar {
  nombre?: string
  precioBase?: number
  grupo?: string
  opciones?: Array<{ nombre?: string; precioDelta?: number }>
}

function normaliza(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** `null` = se puede crear. Si no, qué le falta, en español. */
export function motivoParaNoAgrupar(v: VarianteParaValidar): string | null {
  if (!v.nombre?.trim()) return 'Escribe cómo se llama el plato.'
  if (!v.grupo?.trim()) return 'Escribe cómo se llama el grupo (por ejemplo, «Tamaño»).'
  const opciones = v.opciones ?? []
  if (opciones.length < 2) return 'Un grupo de tamaños necesita al menos dos.'
  if (opciones.length > MAX_TAMANOS) {
    return `Son demasiados tamaños (máximo ${MAX_TAMANOS}).`
  }
  if (!(Number(v.precioBase) > 0)) return 'Falta el precio del tamaño más barato.'
  if (opciones.some((o) => !o.nombre?.trim())) {
    return 'Ponle nombre a cada tamaño (pequeña, mediana, grande…).'
  }
  const vistos = new Set(opciones.map((o) => normaliza(o.nombre ?? '')))
  if (vistos.size !== opciones.length) return 'Hay dos tamaños que se llaman igual.'
  if (opciones.some((o) => !(Number(o.precioDelta) >= 0))) {
    return 'El precio base tiene que ser el del tamaño más barato.'
  }
  return null
}

/** Lo que el dueño está tecleando: cada tamaño con SU precio, como la carta. */
export interface VarianteEditable {
  nombre: string
  /** Los ingredientes del plato. Opcional: no todas las cartas los traen. */
  descripcion?: string
  seccion: string
  grupo: string
  opciones: Array<{ nombre: string; precio: string }>
}

export interface VarianteParaEnviar {
  nombre: string
  descripcion: string
  seccion: string
  grupo: string
  precioBase: number
  opciones: Array<{ nombre: string; precioDelta: number }>
}

/** Lo tecleado en pesos. Vacío o basura = sin precio. */
export function pesosDeTexto(texto: string): number | null {
  const n = Number((texto ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Convierte lo que el dueño editó en lo que viaja al servidor.
 *
 * El formulario pide el PRECIO de cada tamaño —que es lo que dice la carta que
 * tiene delante— y de ahí se derivan el precio base y los recargos. Así el
 * precio base es el menor POR CONSTRUCCIÓN y un recargo negativo no se puede
 * teclear: pedirle al dueño «base + recargo» invitaba justo al error que
 * `motivoParaNoAgrupar` tiene que cazar después.
 */
export function varianteParaEnviar(v: VarianteEditable): VarianteParaEnviar {
  const conPrecio = v.opciones
    .map((o) => ({ nombre: o.nombre.trim(), precio: pesosDeTexto(o.precio) }))
    .filter((o): o is { nombre: string; precio: number } => o.precio != null)
    .sort((a, b) => a.precio - b.precio)
  const precioBase = conPrecio[0]?.precio ?? 0
  return {
    nombre: v.nombre.trim(),
    descripcion: (v.descripcion ?? '').trim(),
    seccion: v.seccion.trim(),
    grupo: v.grupo.trim(),
    precioBase,
    opciones: conPrecio.map((o) => ({
      nombre: o.nombre,
      precioDelta: o.precio - precioBase,
    })),
  }
}
