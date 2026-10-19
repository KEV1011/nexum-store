/**
 * Plato, adicional o acompañamiento: lo que el portal necesita para la vista
 * previa de la carta por foto.
 *
 * La regla que decide el rol vive en el SERVIDOR (`backend/src/lib/carta-rol.ts`)
 * y llega en cada fila. Aquí solo hay dos cosas: cómo se llama cada rol en
 * pantalla, y `grupoDeAdicional`, que el portal necesita para pintar los
 * grupos de adicionales MIENTRAS el dueño cambia roles, antes de enviar.
 * Son copia de las del servidor (`grupoDeAdicional`, `agruparAdicionales`,
 * `nombreDeAdicional`), y `roles-carta-portal.test.ts` pasa la misma tabla de
 * casos por las dos: si divergen, el portal enseñaría un grupo «Adiciones» y
 * el servidor crearía «Adicionales», o un adicional que el dueño vio en un
 * grupo acabaría en otro.
 */

export type RolCarta = 'plato' | 'adicional' | 'acompanamiento' | 'guarnicion'

/**
 * Los nombres en pantalla. «Acompañamiento» se lo queda lo que VIENE con el
 * plato, porque así lo llama un restaurante de aquí («escoge tu
 * acompañamiento: papa o arroz»); lo que se ofrece al pagar se llama por lo
 * que hace. Antes era al revés y el dueño marcaba sus papas incluidas como
 * algo que se le vende aparte a quien va a pagar.
 */
export const ROLES_CARTA: ReadonlyArray<{ valor: RolCarta; etiqueta: string; ayuda: string }> = [
  { valor: 'plato', etiqueta: 'Plato', ayuda: 'Se pide por sí mismo.' },
  {
    valor: 'guarnicion',
    etiqueta: 'Acompañamiento del plato',
    ayuda: 'Viene con el plato y el cliente escoge uno (papa a la francesa, arroz…).',
  },
  {
    valor: 'adicional',
    etiqueta: 'Adicional (se cobra)',
    ayuda: 'Se le añade a un plato (queso, huevo…). No se vende solo.',
  },
  {
    valor: 'acompanamiento',
    etiqueta: 'Se ofrece al pagar',
    ayuda: 'Bebida o porción que se vende aparte y se le ofrece al cliente antes de pagar.',
  },
]

export const GRUPO_ADICIONALES = 'Adicionales'

/** Ver la del servidor: misma regla, mismo nombre de grupo. */
export function grupoDeAdicional(
  seccion: string,
  filas: ReadonlyArray<{ seccion: string; rol: RolCarta }>,
): string {
  const s = seccion.trim()
  if (!s) return GRUPO_ADICIONALES
  const deLaSeccion = filas.filter((f) => f.seccion.trim() === s)
  return deLaSeccion.length > 0 && deLaSeccion.every((f) => f.rol === 'adicional')
    ? s
    : GRUPO_ADICIONALES
}

/** Igual que `normalizado` del servidor: sin tildes, minúscula, sin signos. */
function normalizado(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+ ]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** «+ queso» → «Queso»: así se llama la opción que verá el cliente. */
export function nombreDeAdicional(nombre: string): string {
  const limpio = nombre
    .replace(/^\s*\+\s*/, '')
    .replace(/^\s*(adici[oó]n(al)?|extra|agregad[oa]|agregar)(\s+de)?\s+/i, '')
    .trim()
  const final = limpio || nombre.trim()
  return final.charAt(0).toUpperCase() + final.slice(1)
}

/** Los grupos que va a crear el servidor, para pintarlos antes de enviar. */
export function agruparAdicionales(
  filas: ReadonlyArray<{ nombre: string; precio: number | null; seccion: string; rol: RolCarta }>,
): Array<{ nombre: string; opciones: Array<{ nombre: string; precio: number }> }> {
  const porGrupo = new Map<string, { nombre: string; opciones: Array<{ nombre: string; precio: number }> }>()
  for (const f of filas) {
    if (f.rol !== 'adicional') continue
    if (f.precio == null || !Number.isFinite(f.precio) || f.precio < 0) continue
    const nombreGrupo = grupoDeAdicional(f.seccion, filas)
    const clave = normalizado(nombreGrupo)
    const grupo = porGrupo.get(clave) ?? { nombre: nombreGrupo, opciones: [] }
    if (grupo.nombre === GRUPO_ADICIONALES && nombreGrupo !== GRUPO_ADICIONALES) grupo.nombre = nombreGrupo
    const nombre = nombreDeAdicional(f.nombre)
    if (grupo.opciones.some((o) => normalizado(o.nombre) === normalizado(nombre))) continue
    grupo.opciones.push({ nombre, precio: Math.round(f.precio) })
    porGrupo.set(clave, grupo)
  }
  return [...porGrupo.values()]
}

// ── Guarniciones: copia de las del servidor (`carta-rol.ts`) ────────────────

export const GRUPO_GUARNICION = 'Acompañamiento'

/** Ver la del servidor: misma regla, mismo nombre de grupo. */
export function grupoDeGuarnicion(
  seccion: string,
  filas: ReadonlyArray<{ seccion: string; rol: RolCarta }>,
): string {
  const s = seccion.trim()
  const deLaSeccion = filas.filter((f) => f.seccion.trim() === s)
  if (s && deLaSeccion.length > 0 && deLaSeccion.every((f) => f.rol === 'guarnicion')) return s
  const mezcladas = new Set(
    filas
      .filter((f) => f.rol === 'guarnicion')
      .map((f) => f.seccion.trim())
      .filter((sec) => !filas.filter((x) => x.seccion.trim() === sec).every((x) => x.rol === 'guarnicion')),
  )
  if (s && mezcladas.size > 1) return `${GRUPO_GUARNICION} de ${s.toLowerCase()}`
  return GRUPO_GUARNICION
}

export interface GrupoGuarnicion {
  nombre: string
  opciones: Array<{ nombre: string; precio: number }>
  secciones: string[]
}

/** Ver la del servidor. Sin precio es CERO: viene incluida con el plato. */
export function agruparGuarniciones(
  filas: ReadonlyArray<{ nombre: string; precio: number | null; seccion: string; rol: RolCarta }>,
): GrupoGuarnicion[] {
  const porGrupo = new Map<string, GrupoGuarnicion>()
  for (const f of filas) {
    if (f.rol !== 'guarnicion') continue
    if (f.precio != null && (!Number.isFinite(f.precio) || f.precio < 0)) continue
    const nombreGrupo = grupoDeGuarnicion(f.seccion, filas)
    const clave = normalizado(nombreGrupo)
    const grupo = porGrupo.get(clave) ?? { nombre: nombreGrupo, opciones: [], secciones: [] }
    const nombre = nombreDeAdicional(f.nombre)
    if (!grupo.secciones.includes(f.seccion.trim())) grupo.secciones.push(f.seccion.trim())
    if (!grupo.opciones.some((o) => normalizado(o.nombre) === normalizado(nombre))) {
      grupo.opciones.push({ nombre, precio: f.precio == null ? 0 : Math.round(f.precio) })
    }
    porGrupo.set(clave, grupo)
  }
  return [...porGrupo.values()]
}

/** Ver la del servidor: a qué secciones va algo si el dueño no dice otra cosa. */
export function destinoPorDefecto(origen: string[], seccionesDePlatos: string[]): string[] {
  const platos = seccionesDePlatos.map((s) => s.trim())
  const elegidas = new Set<string>()
  for (const o of origen.map((x) => x.trim())) {
    if (platos.includes(o)) elegidas.add(o)
    else for (const p of platos) elegidas.add(p)
  }
  return platos.filter((p, i) => elegidas.has(p) && platos.indexOf(p) === i)
}
