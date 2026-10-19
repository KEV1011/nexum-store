// ── Qué es cada renglón de la carta: plato, adicional o acompañamiento ───────
//
// POR QUÉ EXISTE. Una carta impresa mezcla tres cosas que en la app se modelan
// distinto, y el lector las metía todas como platos:
//
//   * PLATO — se pide por sí mismo («Arepa rellena 20.000»). Es un producto.
//   * ADICIONAL — no se pide solo, se le AÑADE a un plato («ADICIONALES:
//     Queso 3.000, Huevo 2.000»). Es una OPCIÓN dentro de un grupo de la
//     biblioteca, que los platos adjuntan. Como producto suelto, el cliente
//     podría pedir «un huevo» a domicilio y la cocina no sabría con qué.
//   * ACOMPAÑAMIENTO — es otro producto, pero de los que se ofrecen al cerrar
//     el pedido («Gaseosa 350 ml 3.500», «Porción de papas»). Producto con
//     `suggestAsAddon`: descuenta existencias y entra en el reporte de ventas.
//
// Lo que sale de aquí es una PROPUESTA para la vista previa: cada fila trae su
// rol y el MOTIVO, y el dueño lo cambia con un selector (por fila o por
// sección entera). Nunca se decide en silencio.
//
// ANTE LA DUDA, PLATO. Es el rol que menos daño hace al equivocarse: un plato
// de más se ve en la carta y el dueño lo corrige; un plato tomado por
// adicional DESAPARECE de la carta (queda escondido dentro de otro), y uno
// tomado por acompañamiento se le ofrece a todo el que va a pagar.

export const ROLES_CARTA = ['plato', 'adicional', 'acompanamiento'] as const;
export type RolCarta = (typeof ROLES_CARTA)[number];

/** Para comparar: sin tildes, en minúscula, sin signos. */
function normalizado(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+ ]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Palabras con las que una carta titula la sección de lo que se AÑADE. */
const SECCION_ADICIONAL = [
  'adicion', 'adiciones', 'adicional', 'adicionales', 'extra', 'extras',
  'agregado', 'agregados', 'agregar', 'topping', 'toppings', 'complemento',
  'complementos', 'ingrediente', 'ingredientes',
];

/**
 * Palabras con las que se titula lo que se pide APARTE para acompañar.
 *
 * «Porciones» está a propósito: en una carta de aquí es la sección de las
 * papas, la yuca y el patacón. Los postres NO: son un plato que se pide por
 * sí mismo, y ofrecerle un postre de 15.000 a todo el que paga una gaseosa
 * es justo el ruido que esto quiere quitar.
 */
const SECCION_ACOMPANAMIENTO = [
  'bebida', 'bebidas', 'gaseosa', 'gaseosas', 'jugo', 'jugos', 'limonada',
  'limonadas', 'malteada', 'malteadas', 'batido', 'batidos', 'refresco',
  'refrescos', 'cerveza', 'cervezas', 'licor', 'licores', 'vino', 'vinos',
  'cafe', 'cafes', 'acompanamiento', 'acompanamientos', 'porcion', 'porciones',
  'acompanante', 'acompanantes',
];

/**
 * El NOMBRE de un renglón suena a BEBIDA.
 *
 * Se mira solo la PRIMERA palabra: «Gaseosa 350 ml» y «Coca cola» lo son;
 * «Hamburguesa con papas» no, aunque diga papas.
 *
 * Solo bebidas, a propósito. «Patacón con hogao», «Papas criollas» o «Yuca
 * frita» van tan a menudo en ENTRADAS como en acompañamientos, y por el
 * nombre no se distingue: para esos manda la sección («Porciones»,
 * «Acompañamientos»). Una entrada tomada por acompañamiento se le ofrecería
 * a todo el que va a pagar. «Porción de…» sí entra: lo dice la palabra.
 */
const INICIO_ACOMPANAMIENTO = [
  'gaseosa', 'jugo', 'limonada', 'malteada', 'batido', 'agua', 'cerveza',
  'coca', 'cocacola', 'pepsi', 'postobon', 'colombiana', 'sprite', 'quatro',
  'kola', 'te', 'cafe', 'tinto', 'aromatica', 'soda', 'refresco', 'porcion',
];

/** Cómo empieza un adicional escrito dentro de cualquier sección. */
const INICIO_ADICIONAL = /^(\+|(adicion(al)?( de)?|extra( de)?|agregar|agregado( de)?)( |$))/;

/** Qué dice el TÍTULO de la sección. `null` = no dice nada. */
export function rolDeSeccion(seccion: string): RolCarta | null {
  const n = normalizado(seccion);
  if (!n) return null;
  const palabras = n.split(' ');
  // La sección de adicionales manda sobre la de bebidas: «Adiciones y
  // bebidas» se trata como adicionales y el dueño separa las bebidas.
  if (palabras.some((p) => SECCION_ADICIONAL.includes(p))) return 'adicional';
  if (palabras.some((p) => SECCION_ACOMPANAMIENTO.includes(p))) return 'acompanamiento';
  return null;
}

export interface RolPropuesto {
  rol: RolCarta;
  /** Por qué, en palabras del dueño. Ausente = plato por defecto. */
  motivo?: string;
}

/**
 * El rol que se le propone a un renglón, de la pista más fuerte a la más débil:
 *
 *   1. El renglón EMPIEZA como un adicional («+ Queso», «Adición de huevo»):
 *      lo dice la propia carta, esté donde esté.
 *   2. La SECCIÓN en la que cayó.
 *   3. El nombre suena a bebida o acompañamiento — solo si la sección no dijo
 *      nada: una gaseosa dentro de «Arepas» es un acompañamiento suelto, pero
 *      dentro de «Adicionales» manda la sección.
 *   4. Plato.
 */
export function rolDeLinea(linea: { nombre: string; seccion: string }): RolPropuesto {
  const nombre = normalizado(linea.nombre);
  if (INICIO_ADICIONAL.test(nombre)) {
    return { rol: 'adicional', motivo: 'Empieza como un adicional («+», «Adición de…»).' };
  }
  const porSeccion = rolDeSeccion(linea.seccion);
  if (porSeccion === 'adicional') {
    return { rol: 'adicional', motivo: `Está en la sección «${linea.seccion}».` };
  }
  if (porSeccion === 'acompanamiento') {
    return { rol: 'acompanamiento', motivo: `Está en la sección «${linea.seccion}».` };
  }
  if (suenaAAcompanamiento(linea.nombre)) {
    return { rol: 'acompanamiento', motivo: 'Suena a bebida o acompañamiento.' };
  }
  return { rol: 'plato' };
}

/**
 * ¿Un producto ya creado suena a bebida o acompañamiento?
 *
 * Lo usa el portal para ORDENAR lo que propone en «Bebidas y acompañamientos»
 * y para avisar cuando se marcó algo que parece un plato. Nunca decide nada:
 * el dueño puede ofrecer una empanada al pagar si quiere.
 */
export function suenaAAcompanamiento(nombre: string, seccion = ''): boolean {
  if (rolDeSeccion(seccion) === 'acompanamiento') return true;
  const palabras = normalizado(nombre).split(' ').filter(Boolean);
  if (palabras.length === 0) return false;
  return INICIO_ACOMPANAMIENTO.includes(palabras[0]!);
}

/** Lo que llega del navegador. Desconocido = plato, el rol que menos rompe. */
export function sanearRol(valor: unknown): RolCarta {
  return typeof valor === 'string' && (ROLES_CARTA as readonly string[]).includes(valor)
    ? (valor as RolCarta)
    : 'plato';
}

/** Quita «+», «Adición de», «Extra» del nombre: la opción se llama «Queso». */
export function nombreDeAdicional(nombre: string): string {
  const limpio = nombre
    .replace(/^\s*\+\s*/, '')
    .replace(/^\s*(adici[oó]n(al)?|extra|agregad[oa]|agregar)(\s+de)?\s+/i, '')
    .trim();
  const final = limpio || nombre.trim();
  return final.charAt(0).toUpperCase() + final.slice(1);
}

/** El grupo al que va un adicional cuando su sección no es solo de adicionales. */
export const GRUPO_ADICIONALES = 'Adicionales';

/**
 * Cómo se llama el grupo de la biblioteca en el que cae un adicional.
 *
 * Si TODAS las filas de su sección son adicionales, la sección ES la lista
 * («Adiciones hamburguesas») y el grupo se llama como ella: una carta con dos
 * listas distintas tiene dos grupos, y cada uno va a sus platos. Si no —un
 * «+ Tocineta» suelto dentro de «Hamburguesas»—, va a «Adicionales»: un grupo
 * llamado «Hamburguesas» se leería como si fuera el plato.
 *
 * Se decide con las FILAS y no con el título, para que el portal —que tiene
 * las mismas filas, con los roles que el dueño haya cambiado— pinte el mismo
 * grupo que va a crear el servidor. Su copia es `app/roles-carta.ts`, y
 * `roles-carta-portal.test.ts` pasa la misma tabla de casos por las dos.
 */
export function grupoDeAdicional(
  seccion: string,
  filas: ReadonlyArray<{ seccion: string; rol: RolCarta }>,
): string {
  const s = seccion.trim();
  if (!s) return GRUPO_ADICIONALES;
  const deLaSeccion = filas.filter((f) => f.seccion.trim() === s);
  return deLaSeccion.length > 0 && deLaSeccion.every((f) => f.rol === 'adicional')
    ? s
    : GRUPO_ADICIONALES;
}

/**
 * Las filas marcadas como adicional, agrupadas como irán a la biblioteca.
 *
 * Recibe TODAS las filas (no solo las adicionales) porque el nombre del grupo
 * depende de si la sección entera lo es — ver `grupoDeAdicional`.
 *
 * Dos grupos que se llaman igual escritos distinto («Adicionales» por defecto
 * y una sección «ADICIONALES») son UNO: si no, la biblioteca acabaría con dos
 * grupos del mismo nombre en cada plato. Se queda con el nombre de la sección,
 * que es como lo escribió la carta.
 *
 * Los repetidos por nombre se quedan con el PRIMERO y se cuentan: dos «Queso»
 * a precios distintos en el mismo grupo dejarían al cliente eligiendo entre
 * dos renglones iguales.
 */
export function agruparAdicionales(
  filas: ReadonlyArray<{ nombre: string; precio: number | null; seccion: string; rol: RolCarta }>,
): { grupos: Array<{ nombre: string; opciones: Array<{ nombre: string; precio: number }> }>; repetidos: number; sinPrecio: number } {
  const porGrupo = new Map<string, { nombre: string; opciones: Array<{ nombre: string; precio: number }> }>();
  let repetidos = 0;
  let sinPrecio = 0;
  for (const f of filas) {
    if (f.rol !== 'adicional') continue;
    // Un adicional sin precio no se inventa en cero: «Queso» gratis cuando
    // cuesta 3.000 es plata que pierde el local en cada pedido.
    if (f.precio == null || !Number.isFinite(f.precio) || f.precio < 0) {
      sinPrecio++;
      continue;
    }
    const nombreGrupo = grupoDeAdicional(f.seccion, filas);
    const clave = normalizado(nombreGrupo);
    const grupo = porGrupo.get(clave) ?? { nombre: nombreGrupo, opciones: [] };
    if (grupo.nombre === GRUPO_ADICIONALES && nombreGrupo !== GRUPO_ADICIONALES) grupo.nombre = nombreGrupo;
    const nombre = nombreDeAdicional(f.nombre);
    if (grupo.opciones.some((o) => normalizado(o.nombre) === normalizado(nombre))) {
      repetidos++;
      continue;
    }
    grupo.opciones.push({ nombre, precio: Math.round(f.precio) });
    porGrupo.set(clave, grupo);
  }
  return { grupos: [...porGrupo.values()], repetidos, sinPrecio };
}

/** Mismo nombre de grupo, escrito como sea. Para no duplicar la biblioteca. */
export function mismoNombreDeGrupo(a: string, b: string): boolean {
  return normalizado(a) === normalizado(b);
}
