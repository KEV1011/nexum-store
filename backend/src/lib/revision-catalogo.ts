// ── Revisar el catálogo que el negocio YA tiene cargado ──────────────────────
//
// POR QUÉ EXISTE. El lector de la foto y su revisor con IA trabajan sobre la
// VISTA PREVIA de una carta nueva: lo que ya estaba en el catálogo no lo
// volvía a mirar nadie. Y es justo ahí donde están los errores que el cliente
// ve: «Hamburgesa doble», «HAMBURGUESA SENCILLA (carne, queso, tocineta)»,
// la sección «Bebidas» escrita de tres formas, una gaseosa a $35.000.
//
// Esto PROPONE y el dueño confirma, con el antes y el después de cada plato.
// Es el mismo criterio que la vista previa obligatoria del CSV y que el
// «Revisar mi carta» al que reemplaza: son los platos de un negocio real, y
// una regla —o una IA— se puede equivocar en un renglón raro.
//
// LO QUE NUNCA HACE, y por qué:
//
//   · NO cambia precios. Con la foto, un precio solo se acepta si está
//     IMPRESO; aquí no hay carta impresa contra la cual comprobarlo. Un precio
//     que parece mal sale como AVISO para que lo mire el dueño.
//   · NO borra ni oculta productos. Uno que parece un adicional o un
//     duplicado puede estar en un carrito abierto o en el reporte del mes:
//     sale como aviso y lo decide el dueño.
//   · NO pisa lo que el dueño cambió mientras revisaba: cada cambio lleva su
//     «antes», y si el producto ya no es así, no se aplica (`conflictoConActual`).
//
// QUÉ SE REVISA SIN IA (las reglas del lector, aplicadas a lo ya cargado):
//
//   1. Adornos y espacios de sobra: «● Carne asada», «Papa , carne».
//   2. Ingredientes dentro del nombre, si el plato no tiene descripción.
//   3. Nombre todo en mayúsculas → escritura normal, respetando siglas (BBQ).
//   4. Erratas de carta, con el vocabulario cerrado de `erratas-carta`.
//   5. La misma sección escrita de varias formas, o toda en mayúsculas.
//
// Y con la IA encendida, ENCIMA de eso (ella ve el resultado de las reglas):
// erratas que el vocabulario no conoce, ingredientes pegados sin comas ni
// paréntesis, platos en la sección equivocada y bebidas que deberían
// ofrecerse al pagar. Las guardas de `carta-ia.ts` siguen mandando.

import {
  normalizar,
  type FilaRevisable,
  type ResultadoRevision,
} from './carta-ia';
import { PRECIO_MIN, tituloDeSeccion } from './carta-foto';
import type { RolCarta } from './carta-rol';
import { corregirErratas, type Errata } from './erratas-carta';
import { separarDescripcion } from './nombre-y-descripcion';
import { limpiarTextoDeCarta, nombreDeProducto } from './texto-carta';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ProductoRevisable {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  suggestAsAddon: boolean;
  isAvailable: boolean;
}

/** Lo único que esta revisión puede cambiar. El precio NO está, a propósito. */
export interface ValoresProducto {
  name?: string;
  description?: string;
  category?: string;
  suggestAsAddon?: boolean;
}

const CAMPOS = ['name', 'description', 'category', 'suggestAsAddon'] as const;
type Campo = (typeof CAMPOS)[number];

/**
 * Los cambios van por GRUPO de campos que se aceptan juntos. El nombre y la
 * descripción van en el mismo porque separar ingredientes toca los dos a la
 * vez: aceptar solo la mitad dejaría el plato sin sus ingredientes.
 */
export type GrupoArreglo = 'texto' | 'seccion' | 'tipo';

const CAMPOS_DE_GRUPO: Record<GrupoArreglo, Campo[]> = {
  texto: ['name', 'description'],
  seccion: ['category'],
  tipo: ['suggestAsAddon'],
};

export type OrigenArreglo = 'reglas' | 'ia';

export interface PropuestaCatalogo {
  id: string;
  productId: string;
  grupo: GrupoArreglo;
  /** El nombre actual, para que el dueño reconozca el plato. */
  producto: string;
  antes: ValoresProducto;
  despues: ValoresProducto;
  /** Por qué, en palabras del dueño. Una por cosa que se arregló. */
  razones: string[];
  origen: OrigenArreglo[];
  /**
   * Nace marcada. Lo de las reglas y lo de la IA con confianza alta, sí; lo
   * que la IA propone con dudas, no. Si un grupo junta las dos cosas, nace sin
   * marcar: el dueño ve el resultado completo y decide.
   */
  marcada: boolean;
}

export type TipoAviso =
  | 'precio_atipico'
  | 'precio_raro'
  | 'sin_precio'
  | 'duplicado'
  | 'parece_adicional'
  | 'parece_guarnicion';

export interface AvisoCatalogo {
  tipo: TipoAviso;
  productIds: string[];
  texto: string;
}

export interface RevisionCatalogo {
  revisados: number;
  propuestas: PropuestaCatalogo[];
  avisos: AvisoCatalogo[];
}

// ── El trabajo en curso ──────────────────────────────────────────────────────

interface Acumulado {
  razones: string[];
  origen: Set<OrigenArreglo>;
  segura: boolean;
}

export interface TrabajoRevision {
  orden: string[];
  originales: Map<string, ProductoRevisable>;
  /** Cómo queda cada producto con TODO lo propuesto hasta ahora. */
  estado: Map<string, ProductoRevisable>;
  acumulado: Map<string, Acumulado>;
  avisos: AvisoCatalogo[];
}

const clave = (id: string, g: GrupoArreglo) => `${id}:${g}`;

function anotar(
  t: TrabajoRevision,
  id: string,
  grupo: GrupoArreglo,
  razon: string,
  origen: OrigenArreglo,
  segura: boolean,
): void {
  const k = clave(id, grupo);
  const a = t.acumulado.get(k) ?? { razones: [], origen: new Set(), segura: true };
  if (razon && !a.razones.includes(razon)) a.razones.push(razon);
  a.origen.add(origen);
  a.segura = a.segura && segura;
  t.acumulado.set(k, a);
}

// ── Las reglas ───────────────────────────────────────────────────────────────

const VOCAL = /[aeiouáéíóúü]/i;

/**
 * «HAMBURGUESA SENCILLA BBQ» → «Hamburguesa sencilla BBQ».
 *
 * Una lista de platos donde unos gritan y otros no se lee descuidada, y el
 * buscador de la app compara sin mayúsculas de todos modos. Se respetan las
 * siglas cortas sin vocales (BBQ, XL) y lo que lleva números (350ML, 4X4):
 * pasarlas a minúscula sería escribirlas mal.
 *
 * Devuelve null si el nombre no está todo en mayúsculas.
 */
export function enEscrituraNormal(nombre: string): string | null {
  const letras = nombre.replace(/[^\p{L}]/gu, '');
  if (letras.length < 4) return null;
  if (letras !== letras.toUpperCase() || letras === letras.toLowerCase()) return null;
  let primera = true;
  const salida = nombre.split(/(\s+)/).map((tok) => {
    if (!/\p{L}/u.test(tok)) return tok;
    const soloLetras = tok.replace(/[^\p{L}]/gu, '');
    const sigla = /\d/.test(tok) || (soloLetras.length <= 4 && !VOCAL.test(soloLetras));
    let t = sigla ? tok : tok.toLowerCase();
    if (primera) {
      t = t.replace(/\p{L}/u, (c) => c.toUpperCase());
      primera = false;
    }
    return t;
  });
  const r = salida.join('');
  return r === nombre ? null : r;
}

function textoDeErratas(erratas: Errata[]): string {
  return `Corregimos ${erratas.map((e) => `«${e.de}» por «${e.a}»`).join(', ')}`;
}

/** Nombre y descripción, arreglados con las reglas del lector. */
function reglasDeTexto(t: TrabajoRevision, p: ProductoRevisable): void {
  const e = t.estado.get(p.id)!;
  let nombre = e.name;
  let descripcion = e.description;

  const limpioN = limpiarTextoDeCarta(nombre);
  const limpioD = limpiarTextoDeCarta(descripcion);
  if (limpioN && limpioN !== nombre) {
    nombre = limpioN;
    anotar(t, p.id, 'texto', 'Quitamos adornos o espacios de sobra del nombre', 'reglas', true);
  }
  if (limpioD !== descripcion) {
    descripcion = limpioD;
    anotar(t, p.id, 'texto', 'Quitamos adornos o espacios de sobra de los ingredientes', 'reglas', true);
  }

  // Una descripción que el dueño ya escribió MANDA: machacarla perdería lo
  // que redactó a mano para quedarnos con lo que dedujo una regla.
  if (!descripcion) {
    const s = separarDescripcion(nombre);
    if (s.descripcion) {
      nombre = s.nombre;
      descripcion = s.descripcion;
      anotar(t, p.id, 'texto', 'Los ingredientes estaban dentro del nombre: van en la descripción', 'reglas', true);
    }
  }

  const normal = enEscrituraNormal(nombre);
  if (normal) {
    nombre = normal;
    anotar(t, p.id, 'texto', 'El nombre estaba todo en mayúsculas', 'reglas', true);
  }
  const normalD = enEscrituraNormal(descripcion);
  if (normalD) {
    descripcion = normalD;
    anotar(t, p.id, 'texto', 'Los ingredientes estaban todos en mayúsculas', 'reglas', true);
  }

  const en = corregirErratas(nombre);
  const ed = corregirErratas(descripcion);
  const erratas = [...en.erratas, ...ed.erratas];
  if (erratas.length > 0) {
    nombre = en.texto;
    descripcion = ed.texto;
    anotar(t, p.id, 'texto', textoDeErratas(erratas), 'reglas', true);
  }

  t.estado.set(p.id, { ...e, name: nombre, description: descripcion });
}

/**
 * La llave con que dos secciones son «la misma»: sin tildes, sin mayúsculas,
 * sin espacios de sobra y sin la «s» del plural («Hamburguesa» y
 * «HAMBURGUESAS» son una sola).
 */
export function claveDeSeccion(s: string): string {
  return normalizar(s)
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

const todoMayusculas = (s: string) => {
  const l = s.replace(/[^\p{L}]/gu, '');
  return l.length > 0 && l === l.toUpperCase() && l !== l.toLowerCase();
};

/**
 * Una sección escrita de varias formas sale en la app como DOS secciones, con
 * los platos repartidos. Se queda la forma que más platos usa; a igualdad, la
 * que no grita. Y si la elegida va toda en mayúsculas, se escribe normal.
 */
function reglasDeSecciones(t: TrabajoRevision): void {
  const grupos = new Map<string, Map<string, number>>();
  for (const id of t.orden) {
    const c = t.estado.get(id)!.category.trim();
    if (!c) continue;
    const k = claveDeSeccion(c);
    if (!k) continue;
    const g = grupos.get(k) ?? new Map<string, number>();
    g.set(c, (g.get(c) ?? 0) + 1);
    grupos.set(k, g);
  }

  const canonica = new Map<string, { nombre: string; formas: string[] }>();
  for (const [k, formas] of grupos) {
    const lista = [...formas.entries()].sort((a, b) =>
      b[1] - a[1]
      || Number(todoMayusculas(a[0])) - Number(todoMayusculas(b[0]))
      || a[0].localeCompare(b[0], 'es'));
    const elegida = lista[0]![0];
    const nombre = todoMayusculas(elegida) ? tituloDeSeccion(elegida) : elegida;
    canonica.set(k, { nombre, formas: lista.map(([f]) => f) });
  }

  for (const id of t.orden) {
    const e = t.estado.get(id)!;
    const c = e.category.trim();
    if (!c) continue;
    const can = canonica.get(claveDeSeccion(c));
    if (!can || can.nombre === e.category) continue;
    const razon = can.formas.length > 1
      ? `La sección estaba escrita de ${can.formas.length} formas (${can.formas.map((f) => `«${f}»`).join(', ')}): queda «${can.nombre}»`
      : c !== e.category
        ? `La sección tenía espacios de sobra: queda «${can.nombre}»`
        : `La sección «${c}» estaba en mayúsculas: queda «${can.nombre}»`;
    t.estado.set(id, { ...e, category: can.nombre });
    anotar(t, id, 'seccion', razon, 'reglas', true);
  }
}

/** Arranca la revisión con las reglas. No llama a nadie. */
export function revisarConReglas(productos: ProductoRevisable[]): TrabajoRevision {
  const t: TrabajoRevision = {
    orden: productos.map((p) => p.id),
    originales: new Map(productos.map((p) => [p.id, { ...p }])),
    estado: new Map(productos.map((p) => [p.id, { ...p }])),
    acumulado: new Map(),
    avisos: [],
  };
  for (const p of productos) reglasDeTexto(t, p);
  reglasDeSecciones(t);
  return t;
}

// ── La IA, encima de las reglas ──────────────────────────────────────────────

/**
 * Lo que se le manda al revisor: el catálogo YA arreglado por las reglas, en
 * la forma de las filas de la carta. La línea es la posición + 1.
 */
export function filasParaRevisor(t: TrabajoRevision): FilaRevisable[] {
  return t.orden.map((id, i) => {
    const e = t.estado.get(id)!;
    return {
      linea: i + 1,
      nombre: e.name,
      precio: e.price,
      descripcion: e.description,
      seccion: e.category,
      rol: e.suggestAsAddon ? 'acompanamiento' : 'plato',
    };
  });
}

/** Las secciones que existen: la IA solo puede mover platos entre estas. */
export function seccionesDelTrabajo(t: TrabajoRevision): string[] {
  return [...new Set(t.orden.map((id) => t.estado.get(id)!.category.trim()).filter(Boolean))];
}

/**
 * Pasa a la revisión lo que la IA propuso y la guarda aceptó.
 *
 * Lo aplicado (confianza alta) llega en `revision.filas`; cada sugerencia
 * trae su antes y su después contra ese estado. Un cambio de tipo hacia
 * «adicional» o «acompañamiento del plato» NO se aplica: convertir un
 * producto en una opción de otro plato es una decisión del dueño, así que
 * queda como aviso.
 */
export function incorporarRevisionIA(t: TrabajoRevision, revision: ResultadoRevision): void {
  const porLinea = new Map(filasParaRevisor(t).map((f) => [f.linea, f]));
  const idDe = (linea: number) => t.orden[linea - 1];

  const motivosAplicados = new Map<number, string[]>();
  for (const c of revision.aplicadas) {
    const lista = motivosAplicados.get(c.linea) ?? [];
    lista.push(c.motivo || c.titulo);
    motivosAplicados.set(c.linea, lista);
  }

  const incorporar = (antes: FilaRevisable, despues: FilaRevisable, motivo: string, segura: boolean) => {
    const id = idDe(antes.linea);
    if (!id) return;
    const e = t.estado.get(id)!;
    if (despues.nombre !== antes.nombre || despues.descripcion !== antes.descripcion) {
      t.estado.set(id, { ...t.estado.get(id)!, name: despues.nombre, description: despues.descripcion });
      anotar(t, id, 'texto', motivo, 'ia', segura);
    }
    if (despues.seccion !== antes.seccion) {
      t.estado.set(id, { ...t.estado.get(id)!, category: despues.seccion });
      anotar(t, id, 'seccion', motivo, 'ia', segura);
    }
    if (despues.rol !== antes.rol) {
      const r: RolCarta = despues.rol;
      if (r === 'acompanamiento' || r === 'plato') {
        t.estado.set(id, { ...t.estado.get(id)!, suggestAsAddon: r === 'acompanamiento' });
        anotar(t, id, 'tipo', motivo, 'ia', segura);
      } else {
        t.avisos.push({
          tipo: r === 'adicional' ? 'parece_adicional' : 'parece_guarnicion',
          productIds: [id],
          texto: r === 'adicional'
            ? `«${e.name}» parece un adicional que se cobra aparte, no un plato. Si es así, créalo en «Adiciones y bebidas» y oculta este producto.`
            : `«${e.name}» parece algo que viene con el plato y el cliente escoge. Si es así, créalo como acompañamiento en «Adiciones y bebidas» y oculta este producto.`,
        });
      }
    }
  };

  // Lo aplicado: el estado final de la IA contra lo que se le mandó.
  for (const final of revision.filas) {
    const antes = porLinea.get(final.linea);
    if (!antes) continue;
    incorporar(antes, final, (motivosAplicados.get(final.linea) ?? []).join(' · '), true);
  }

  // Las sugerencias, encima de lo aplicado.
  for (const s of revision.sugerencias) {
    for (const f of s.filas) {
      if (!f.antes || !f.despues) continue;
      incorporar(f.antes, f.despues, s.motivo || s.titulo, false);
    }
  }
}

// ── Avisos y cierre ──────────────────────────────────────────────────────────

/**
 * Cuántas veces por encima o por debajo de lo normal de la sección ya no
 * cuadra. Un cero de más es ×10; con 7 se caza sin saltar con lo legítimo de
 * una sección variada (el combo personal y el familiar se llevan ×4).
 */
export const RAZON_ATIPICA = 7;
/** Con menos platos en la sección, «lo normal» no significa nada. */
const MIN_PARA_COMPARAR = 4;

const pesos = (n: number) => `$${n.toLocaleString('es-CO')}`;

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function avisosDePrecio(t: TrabajoRevision): AvisoCatalogo[] {
  const out: AvisoCatalogo[] = [];
  const porSeccion = new Map<string, ProductoRevisable[]>();
  for (const id of t.orden) {
    const e = t.estado.get(id)!;
    if (e.price > 0) {
      const k = claveDeSeccion(e.category);
      porSeccion.set(k, [...(porSeccion.get(k) ?? []), e]);
    }
  }

  const yaAvisados = new Set<string>();
  for (const lista of porSeccion.values()) {
    if (lista.length < MIN_PARA_COMPARAR) continue;
    for (const p of lista) {
      // Lo normal se mide con los DEMÁS: con él dentro, el precio que está
      // mal tira de la mediana hacia arriba y se disimula a sí mismo.
      const m = mediana(lista.filter((x) => x !== p).map((x) => x.price));
      if (p.price >= m * RAZON_ATIPICA) {
        out.push({
          tipo: 'precio_atipico', productIds: [p.id],
          texto: `«${p.name}» cuesta ${pesos(p.price)} y en «${p.category}» lo normal es ${pesos(Math.round(m))}. ¿Le sobra un cero?`,
        });
        yaAvisados.add(p.id);
      } else if (p.price * RAZON_ATIPICA <= m) {
        out.push({
          tipo: 'precio_atipico', productIds: [p.id],
          texto: `«${p.name}» cuesta ${pesos(p.price)} y en «${p.category}» lo normal es ${pesos(Math.round(m))}. ¿Le falta un cero?`,
        });
        yaAvisados.add(p.id);
      }
    }
  }

  for (const id of t.orden) {
    const p = t.estado.get(id)!;
    if (yaAvisados.has(id)) continue;
    if (p.price === 0) {
      if (p.isAvailable) {
        out.push({
          tipo: 'sin_precio', productIds: [id],
          texto: `«${p.name}» está en $0: el cliente lo pediría gratis.`,
        });
      }
    } else if (p.price < PRECIO_MIN) {
      out.push({
        tipo: 'precio_raro', productIds: [id],
        texto: `«${p.name}» cuesta ${pesos(p.price)}. ¿Le faltan los ceros?`,
      });
    } else if (p.price % 50 !== 0) {
      out.push({
        tipo: 'precio_raro', productIds: [id],
        texto: `«${p.name}» cuesta ${pesos(p.price)}, un precio poco común. ¿Quedó bien escrito?`,
      });
    }
  }
  return out;
}

function avisosDeDuplicados(t: TrabajoRevision): AvisoCatalogo[] {
  const grupos = new Map<string, string[]>();
  for (const id of t.orden) {
    const k = normalizar(t.estado.get(id)!.name);
    if (!k) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), id]);
  }
  const out: AvisoCatalogo[] = [];
  for (const ids of grupos.values()) {
    if (ids.length < 2) continue;
    const ps = ids.map((id) => t.estado.get(id)!);
    const precios = ps.map((p) => p.price);
    const distintos = new Set(precios).size === precios.length;
    out.push({
      tipo: 'duplicado',
      productIds: ids,
      texto: distintos
        ? `«${ps[0]!.name}» está ${ids.length} veces con precios distintos (${precios.map(pesos).join(' · ')}). Si son tamaños, déjalo en un solo plato con sus tamaños en «Opciones».`
        : `«${ps[0]!.name}» está ${ids.length} veces (${precios.map(pesos).join(' · ')}). Si es el mismo plato, deja uno.`,
    });
  }
  return out;
}

const valorDe = (p: ProductoRevisable, c: Campo) => p[c];

/** Las propuestas finales y los avisos. */
export function terminarRevision(t: TrabajoRevision): RevisionCatalogo {
  const propuestas: PropuestaCatalogo[] = [];
  for (const id of t.orden) {
    const original = t.originales.get(id)!;
    const final = t.estado.get(id)!;
    for (const grupo of ['texto', 'seccion', 'tipo'] as const) {
      const a = t.acumulado.get(clave(id, grupo));
      if (!a) continue;
      const campos = CAMPOS_DE_GRUPO[grupo].filter((c) => valorDe(original, c) !== valorDe(final, c));
      if (campos.length === 0) continue;
      const antes: ValoresProducto = {};
      const despues: ValoresProducto = {};
      for (const c of campos) {
        (antes as Record<Campo, unknown>)[c] = valorDe(original, c);
        (despues as Record<Campo, unknown>)[c] = valorDe(final, c);
      }
      propuestas.push({
        id: clave(id, grupo),
        productId: id,
        grupo,
        producto: original.name,
        antes,
        despues,
        razones: a.razones.filter(Boolean),
        origen: [...a.origen],
        marcada: a.segura,
      });
    }
  }
  return {
    revisados: t.orden.length,
    propuestas,
    avisos: [...avisosDeDuplicados(t), ...avisosDePrecio(t), ...t.avisos],
  };
}

/** Atajo para la revisión sin IA. */
export function revisarCatalogo(productos: ProductoRevisable[]): RevisionCatalogo {
  return terminarRevision(revisarConReglas(productos));
}

// ── Aplicar lo que el dueño aprobó ───────────────────────────────────────────

export interface CambioPedido {
  productId: string;
  antes: ValoresProducto;
  despues: ValoresProducto;
}

/** Una revisión no toca más que esto; por encima es un error del portal. */
export const MAX_CAMBIOS = 400;

function valoresSaneados(v: unknown): ValoresProducto | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const out: ValoresProducto = {};
  if (typeof o['name'] === 'string') out.name = o['name'];
  if (typeof o['description'] === 'string') out.description = o['description'];
  if (typeof o['category'] === 'string') out.category = o['category'];
  if (typeof o['suggestAsAddon'] === 'boolean') out.suggestAsAddon = o['suggestAsAddon'];
  return out;
}

/**
 * Lo que manda el portal, con la forma comprobada. Solo pasan los cuatro
 * campos de la revisión —el PRECIO no, se mande lo que se mande— y cada campo
 * del «después» tiene que traer su «antes»: sin él no se puede saber si el
 * dueño lo cambió mientras tanto.
 */
export function sanearCambiosPedidos(crudo: unknown): CambioPedido[] {
  if (!Array.isArray(crudo)) return [];
  const out: CambioPedido[] = [];
  for (const item of crudo.slice(0, MAX_CAMBIOS)) {
    const c = (item ?? {}) as Record<string, unknown>;
    if (typeof c['productId'] !== 'string' || !c['productId']) continue;
    const antes = valoresSaneados(c['antes']);
    const despues = valoresSaneados(c['despues']);
    if (!antes || !despues) continue;
    const campos = (Object.keys(despues) as Campo[]).filter((k) => k in antes);
    if (campos.length === 0) continue;
    const a: ValoresProducto = {};
    const d: ValoresProducto = {};
    for (const k of campos) {
      (a as Record<Campo, unknown>)[k] = antes[k];
      (d as Record<Campo, unknown>)[k] = despues[k];
    }
    out.push({ productId: c['productId'], antes: a, despues: d });
  }
  return out;
}

/** El motivo para NO aplicar el cambio porque el producto ya no es como era. */
export function conflictoConActual(actual: ProductoRevisable, c: CambioPedido): string | null {
  for (const k of Object.keys(c.antes) as Campo[]) {
    const esperado = c.antes[k];
    const hay = k === 'description' || k === 'name' || k === 'category'
      ? String(actual[k] ?? '').trim()
      : actual[k];
    const era = typeof esperado === 'string' ? esperado.trim() : esperado;
    if (hay !== era) return 'Cambió mientras revisabas: no lo tocamos.';
  }
  return null;
}

/** Los datos para guardar. Lanza con el motivo si el nombre queda vacío. */
export function datosDeCambio(c: CambioPedido): {
  name?: string;
  description?: string | null;
  category?: string;
  suggestAsAddon?: boolean;
} {
  const d = c.despues;
  return {
    ...(d.name !== undefined && { name: nombreDeProducto(d.name).slice(0, 160) }),
    ...(d.description !== undefined && { description: d.description.trim().slice(0, 600) || null }),
    ...(d.category !== undefined && { category: d.category.trim().slice(0, 60) || 'General' }),
    ...(d.suggestAsAddon !== undefined && { suggestAsAddon: d.suggestAsAddon }),
  };
}
