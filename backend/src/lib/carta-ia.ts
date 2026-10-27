// ── El revisor de la carta: lo que la IA PROPONE y lo que de verdad se acepta ──
//
// POR QUÉ EXISTE. El lector de la foto (`carta-foto.ts`) decide con reglas qué
// es un plato, qué es un título, qué son los ingredientes y qué es un
// adicional. Las reglas aciertan en lo común y fallan en lo raro, y cada carta
// tiene algo raro: «Arroz de la casa preparado con vegetales» suelto debajo
// del plato, una hamburguesa ofrecida como bebida, un teléfono convertido en
// producto. Hasta hoy el dueño tenía que ENCONTRAR esos fallos fila por fila,
// que es justo el trabajo que la foto venía a quitar.
//
// El revisor mira la foto y la lista ya leída y devuelve CORRECCIONES. Este
// archivo decide cuáles se aceptan, y es la parte que importa: un modelo de
// lenguaje se equivoca con mucha seguridad, así que nada de lo que diga entra
// sin pasar por aquí.
//
// LAS REGLAS QUE IMPIDEN QUE INVENTE, una por acción:
//
//   · Un PRECIO solo vale si está IMPRESO en la carta (o lo escribió el dueño
//     en su instrucción). Un plato a un precio que nadie puso es plata y una
//     queja; es la regla más cara de romper.
//   · Separar ingredientes solo REPARTE palabras que ya estaban: no puede
//     añadir «queso» a un plato que no lo lleva.
//   · Corregir un NOMBRE es arreglar letras mal leídas («Hamburgesa»), no
//     rebautizar: si el nombre nuevo no se parece al viejo, se descarta.
//   · Una SECCIÓN tiene que existir en la carta; no se inventan títulos.
//   · QUITAR, pegar como ingredientes o convertir en título solo se le hace a
//     una fila SIN precio: una fila con precio es un plato hasta que el dueño
//     diga lo contrario, y perderlo es peor que dejar una fila de más.
//
// LO QUE SE APLICA SOLO Y LO QUE SE PREGUNTA. El dueño pidió no tener que
// buscar los errores, así que las correcciones de confianza ALTA se aplican de
// una — y quedan listadas con «Deshacer». Las demás se ofrecen para que las
// acepte. Un cambio de precio sobre una fila que YA tenía precio nunca se
// aplica solo, diga lo que diga la confianza: ahí la carta y el lector ya
// estaban de acuerdo en un número.
//
// CADA CAMBIO LLEVA EL «ANTES» Y EL «DESPUÉS» de cada fila que toca. Así el
// portal no necesita saber qué significa cada acción: aplica `despues`,
// deshace con `antes`, y si la fila ya no es igual al `antes` —porque el dueño
// la tocó entre medias— no la pisa.

import { ROLES_CARTA, type RolCarta } from './carta-rol';
import { PRECIO_MAX, PRECIO_MIN, preciosDeLinea, tituloDeSeccion } from './carta-foto';

export const ACCIONES_IA = [
  'rol',
  'descripcion_de',
  'separar_ingredientes',
  'precio',
  'seccion',
  'es_titulo',
  'quitar',
  'nombre',
] as const;
export type AccionIA = (typeof ACCIONES_IA)[number];

export type ConfianzaIA = 'alta' | 'media' | 'baja';

/** Lo que la IA propone, ya saneado de forma (no de contenido). */
export interface CorreccionIA {
  linea: number;
  accion: AccionIA;
  rol?: RolCarta;
  /** Para `descripcion_de`: el plato al que pertenecen estos ingredientes. */
  lineaDestino?: number;
  nombre?: string;
  descripcion?: string;
  precio?: number;
  seccion?: string;
  confianza: ConfianzaIA;
  /** Por qué, dicho al dueño. Lo escribe la IA; se recorta. */
  motivo: string;
}

/** Una fila de la vista previa, en la forma que entiende el revisor. */
export interface FilaRevisable {
  linea: number;
  nombre: string;
  precio: number | null;
  descripcion: string;
  seccion: string;
  rol: RolCarta;
}

export interface CambioFila {
  linea: number;
  /** Null = la fila no existía (no lo usa ninguna acción de hoy). */
  antes: FilaRevisable | null;
  /** Null = la fila desaparece. */
  despues: FilaRevisable | null;
}

export interface CambioIA {
  id: string;
  accion: AccionIA;
  linea: number;
  confianza: ConfianzaIA;
  /** Qué cambia, redactado por el SERVIDOR: la IA no decide cómo se describe. */
  titulo: string;
  motivo: string;
  filas: CambioFila[];
}

export interface Descarte {
  linea: number;
  accion: string;
  razon: string;
}

export interface ContextoRevision {
  /** El texto que leyó el OCR: la única fuente de precios y secciones. */
  textoCrudo: string;
  secciones: string[];
  /** Lo que el dueño escribió («las papas vienen con el plato»). */
  instruccion?: string;
  /**
   * `revision`: la IA mira por su cuenta; solo lo seguro se aplica solo.
   * `instruccion`: el dueño PIDIÓ el cambio, así que se aplica todo lo válido.
   */
  modo: 'revision' | 'instruccion';
}

export interface ResultadoRevision {
  /** Las filas con lo aplicado ya dentro. */
  filas: FilaRevisable[];
  aplicadas: CambioIA[];
  sugerencias: CambioIA[];
  descartadas: Descarte[];
}

/** Más que esto no es una revisión, es reescribir la carta. */
export const MAX_CORRECCIONES = 80;
const MOTIVO_MAX = 160;
const DESCRIPCION_MAX = 300;
const SECCION_MAX = 40;

/** Cómo llama el portal a cada tipo: el dueño reconoce estas palabras. */
const ETIQUETA_ROL: Record<RolCarta, string> = {
  plato: 'Plato',
  adicional: 'Adicional que se cobra',
  guarnicion: 'Acompañamiento del plato',
  acompanamiento: 'Se ofrece al pagar',
};

// ── Saneo de la forma ─────────────────────────────────────────────────────────

function texto(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
}

function entero(v: unknown): number | undefined {
  // Una cadena sin dígitos NO es cero: `Number('')` lo sería, y «x» acabaría
  // apuntando a una línea 0 que se trataría como real.
  if (typeof v === 'string' && !/\d/.test(v)) return undefined;
  const n = typeof v === 'string' ? Number(v.replace(/[^\d]/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : undefined;
}

/**
 * Lee la salida de la IA. Lo que no tenga la forma esperada se cae sin tumbar
 * lo demás: una corrección mal escrita no puede costar las otras setenta.
 */
export function sanearCorrecciones(crudo: unknown): CorreccionIA[] {
  const lista = (crudo as { correcciones?: unknown } | null)?.correcciones;
  if (!Array.isArray(lista)) return [];
  const out: CorreccionIA[] = [];
  for (const item of lista) {
    if (out.length >= MAX_CORRECCIONES) break;
    const c = (item ?? {}) as Record<string, unknown>;
    const linea = entero(c['linea']);
    const accion = c['accion'];
    if (linea === undefined || typeof accion !== 'string') continue;
    if (!(ACCIONES_IA as readonly string[]).includes(accion)) continue;
    const confianza: ConfianzaIA =
      c['confianza'] === 'alta' || c['confianza'] === 'media' ? c['confianza'] : 'baja';
    const rol = typeof c['rol'] === 'string' && (ROLES_CARTA as readonly string[]).includes(c['rol'])
      ? (c['rol'] as RolCarta)
      : undefined;
    const lineaDestino = entero(c['lineaDestino']);
    const nombre = texto(c['nombre'], 120);
    const descripcion = texto(c['descripcion'], DESCRIPCION_MAX);
    const precio = entero(c['precio']);
    const seccion = texto(c['seccion'], SECCION_MAX);
    out.push({
      linea,
      accion: accion as AccionIA,
      confianza,
      motivo: texto(c['motivo'], MOTIVO_MAX) ?? '',
      ...(rol && { rol }),
      ...(lineaDestino !== undefined && { lineaDestino }),
      ...(nombre && { nombre }),
      ...(descripcion && { descripcion }),
      ...(precio !== undefined && { precio }),
      ...(seccion && { seccion }),
    });
  }
  return out;
}

/** Una carta no tiene más; por encima es un error o un abuso del cupo. */
export const MAX_FILAS = 300;

/**
 * Las filas que manda el portal. Una línea repetida se queda con la primera:
 * la línea es la llave con la que se aplican y se deshacen los cambios, y dos
 * filas con la misma no se podrían distinguir.
 */
export function sanearFilas(crudo: unknown): FilaRevisable[] {
  if (!Array.isArray(crudo)) return [];
  const out: FilaRevisable[] = [];
  const vistas = new Set<number>();
  for (const item of crudo) {
    if (out.length >= MAX_FILAS) break;
    const f = (item ?? {}) as Record<string, unknown>;
    const linea = entero(f['linea']);
    if (linea === undefined || vistas.has(linea)) continue;
    const nombre = typeof f['nombre'] === 'string' ? f['nombre'].trim().slice(0, 200) : '';
    const precio = f['precio'] === null || f['precio'] === undefined || f['precio'] === ''
      ? null
      : entero(f['precio']) ?? null;
    const rol = typeof f['rol'] === 'string' && (ROLES_CARTA as readonly string[]).includes(f['rol'])
      ? (f['rol'] as RolCarta)
      : 'plato';
    vistas.add(linea);
    out.push({
      linea,
      nombre,
      precio,
      descripcion: typeof f['descripcion'] === 'string' ? f['descripcion'].trim().slice(0, DESCRIPCION_MAX) : '',
      seccion: typeof f['seccion'] === 'string' ? f['seccion'].trim().slice(0, 80) : '',
      rol,
    });
  }
  return out;
}

// ── Comparar textos ───────────────────────────────────────────────────────────

/** Sin tildes, minúscula y sin signos: para comparar palabras, no para mostrar. */
export function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function palabras(t: string): string[] {
  const n = normalizar(t);
  return n ? n.split(' ') : [];
}

/**
 * Las palabras de enlace que la IA puede añadir al repartir un nombre: «Carne
 * de res queso vegetales» → «Carne de res» + «queso y vegetales». Sin ellas,
 * una redacción correcta se rechazaría por una «y».
 */
const ENLACES = new Set(['y', 'e', 'con', 'de', 'del', 'en', 'a', 'al', 'la', 'el', 'los', 'las', 'o']);

/** Distancia de edición, para saber si un nombre se CORRIGIÓ o se CAMBIÓ. */
function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0]!;
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = fila[j]!;
      fila[j] = a[i - 1] === b[j - 1]
        ? previo
        : 1 + Math.min(previo, fila[j]!, fila[j - 1]!);
      previo = guardado;
    }
  }
  return fila[b.length]!;
}

/** 1 = idénticos. Por debajo de 0,7 ya no es una errata, es otro nombre. */
export function parecido(a: string, b: string): number {
  const x = normalizar(a);
  const y = normalizar(b);
  const largo = Math.max(x.length, y.length);
  return largo === 0 ? 1 : 1 - distancia(x, y) / largo;
}

const PARECIDO_MIN = 0.7;

// ── Lo que la carta autoriza ──────────────────────────────────────────────────

/** Todos los precios impresos en la carta (y en la instrucción del dueño). */
export function preciosPermitidos(ctx: ContextoRevision): Set<number> {
  const fuentes = [ctx.textoCrudo, ctx.modo === 'instruccion' ? ctx.instruccion ?? '' : ''];
  const s = new Set<number>();
  for (const f of fuentes) {
    for (const renglon of f.split('\n')) for (const p of preciosDeLinea(renglon)) s.add(p);
  }
  return s;
}

/**
 * El precio sale de un renglón de la carta que nombra este plato y trae VARIOS
 * precios. Se busca por el nombre y no por el número de línea porque el texto
 * del OCR y las filas medidas de la foto no se numeran igual.
 */
function precioDeUnaLineaConVarios(nombre: string, precio: number, textoCrudo: string): boolean {
  const n = normalizar(nombre);
  if (n.length < 3) return false;
  return textoCrudo.split('\n').some((renglon) => {
    if (!` ${normalizar(renglon)} `.includes(` ${n} `)) return false;
    const precios = preciosDeLinea(renglon);
    return precios.length > 1 && precios.includes(precio);
  });
}

function seccionPermitida(seccion: string, filas: FilaRevisable[], ctx: ContextoRevision): boolean {
  const n = normalizar(seccion);
  if (!n) return false;
  const conocidas = [...ctx.secciones, ...filas.map((f) => f.seccion)].map(normalizar);
  if (conocidas.includes(n)) return true;
  // Un título que la carta trae impreso aunque el lector no lo reconociera.
  if (` ${normalizar(ctx.textoCrudo)} `.includes(` ${n} `)) return true;
  return ctx.modo === 'instruccion' && ` ${normalizar(ctx.instruccion ?? '')} `.includes(` ${n} `);
}

// ── Validar y aplicar ─────────────────────────────────────────────────────────

const igual = (a: FilaRevisable, b: FilaRevisable): boolean =>
  a.nombre === b.nombre && a.precio === b.precio && a.descripcion === b.descripcion
  && a.seccion === b.seccion && a.rol === b.rol;

function unirTexto(base: string, mas: string): string {
  const b = base.trim();
  const m = mas.trim();
  if (!b) return m.slice(0, DESCRIPCION_MAX);
  if (!m) return b;
  const sep = /[.,;:]$/.test(b) ? ' ' : '. ';
  return `${b}${sep}${m}`.slice(0, DESCRIPCION_MAX);
}

/** El motivo para descartar la corrección, o null si se puede aplicar. */
export function motivoParaDescartar(
  c: CorreccionIA,
  filas: FilaRevisable[],
  ctx: ContextoRevision,
): string | null {
  const fila = filas.find((f) => f.linea === c.linea);
  if (!fila) return 'la fila ya no existe';

  switch (c.accion) {
    case 'rol':
      if (!c.rol) return 'no dice qué tipo';
      if (c.rol === fila.rol) return 'no cambia nada';
      return null;

    case 'precio': {
      if (c.precio === undefined) return 'no trae precio';
      if (c.precio < PRECIO_MIN || c.precio > PRECIO_MAX) return 'precio fuera de rango';
      if (c.precio === fila.precio) return 'no cambia nada';
      if (!preciosPermitidos(ctx).has(c.precio)) return 'ese precio no está impreso en la carta';
      // Quedarse con UNO de los precios de una línea que trae varios es el
      // error caro de siempre: la pizza familiar vendida al precio de la
      // personal. Eso se resuelve agrupando tamaños, no eligiendo un número.
      if (fila.precio === null && precioDeUnaLineaConVarios(fila.nombre, c.precio, ctx.textoCrudo)) {
        return 'esa línea trae varios precios (tamaños): se agrupan, no se deja uno';
      }
      return null;
    }

    case 'seccion':
      if (!c.seccion) return 'no dice qué sección';
      if (normalizar(c.seccion) === normalizar(fila.seccion)) return 'no cambia nada';
      if (!seccionPermitida(c.seccion, filas, ctx)) return 'esa sección no aparece en la carta';
      return null;

    case 'nombre': {
      if (!c.nombre) return 'no trae nombre';
      if (c.nombre === fila.nombre) return 'no cambia nada';
      if (parecido(c.nombre, fila.nombre) >= PARECIDO_MIN) return null;
      // El dueño PUEDE rebautizar: si lo escribió en su instrucción, vale.
      if (ctx.modo === 'instruccion') {
        const dichas = new Set([...palabras(ctx.instruccion ?? ''), ...palabras(fila.nombre)]);
        if (palabras(c.nombre).every((p) => dichas.has(p) || ENLACES.has(p))) return null;
      }
      return 'el nombre nuevo no se parece al de la carta';
    }

    case 'separar_ingredientes': {
      if (!c.nombre || !c.descripcion) return 'falta el nombre o los ingredientes';
      const habia = new Set(palabras(`${fila.nombre} ${fila.descripcion}`));
      const nuevas = [...palabras(c.nombre), ...palabras(c.descripcion)];
      const inventadas = nuevas.filter((p) => !habia.has(p) && !ENLACES.has(p));
      if (inventadas.length > 0) return `añade palabras que la carta no tenía (${inventadas.slice(0, 3).join(', ')})`;
      if (c.nombre === fila.nombre && c.descripcion === fila.descripcion) return 'no cambia nada';
      return null;
    }

    case 'descripcion_de': {
      if (fila.precio !== null) return 'la fila tiene precio: es un producto, no unos ingredientes';
      if (c.lineaDestino === undefined || c.lineaDestino === c.linea) return 'no dice de qué plato';
      if (!filas.some((f) => f.linea === c.lineaDestino)) return 'el plato de destino no existe';
      return null;
    }

    case 'es_titulo':
      if (fila.precio !== null) return 'la fila tiene precio: un título no se cobra';
      if (!fila.nombre.trim() || fila.nombre.length > SECCION_MAX) return 'no sirve como título';
      return null;

    case 'quitar':
      if (fila.precio !== null) return 'la fila tiene precio: no se quita un plato';
      return null;
  }
}

/** Aplica una corrección YA validada. Devuelve las filas nuevas y lo que tocó. */
function aplicar(filas: FilaRevisable[], c: CorreccionIA): { filas: FilaRevisable[]; cambios: CambioFila[] } {
  const i = filas.findIndex((f) => f.linea === c.linea);
  const fila = filas[i]!;
  const cambios: CambioFila[] = [];
  let nuevas = filas.slice();
  const reemplazar = (idx: number, despues: FilaRevisable) => {
    cambios.push({ linea: nuevas[idx]!.linea, antes: nuevas[idx]!, despues });
    nuevas[idx] = despues;
  };

  switch (c.accion) {
    case 'rol': reemplazar(i, { ...fila, rol: c.rol! }); break;
    case 'precio': reemplazar(i, { ...fila, precio: c.precio! }); break;
    case 'seccion': reemplazar(i, { ...fila, seccion: c.seccion! }); break;
    case 'nombre': reemplazar(i, { ...fila, nombre: c.nombre! }); break;
    case 'separar_ingredientes':
      reemplazar(i, { ...fila, nombre: c.nombre!, descripcion: c.descripcion! });
      break;
    case 'descripcion_de': {
      const d = nuevas.findIndex((f) => f.linea === c.lineaDestino);
      const destino = nuevas[d]!;
      const sobrante = [fila.nombre, fila.descripcion].filter((t) => t.trim()).join('. ');
      reemplazar(d, { ...destino, descripcion: unirTexto(destino.descripcion, sobrante) });
      cambios.push({ linea: fila.linea, antes: fila, despues: null });
      nuevas = nuevas.filter((f) => f.linea !== fila.linea);
      break;
    }
    case 'es_titulo': {
      // Lo que venía debajo del falso plato y compartía su sección pasa a la
      // sección nueva, hasta el primer renglón que ya estaba en otra.
      const titulo = tituloDeSeccion(fila.nombre);
      for (let j = i + 1; j < nuevas.length && nuevas[j]!.seccion === fila.seccion; j++) {
        reemplazar(j, { ...nuevas[j]!, seccion: titulo });
      }
      cambios.unshift({ linea: fila.linea, antes: fila, despues: null });
      nuevas = nuevas.filter((f) => f.linea !== fila.linea);
      break;
    }
    case 'quitar':
      cambios.push({ linea: fila.linea, antes: fila, despues: null });
      nuevas = nuevas.filter((f) => f.linea !== fila.linea);
      break;
  }
  return { filas: nuevas, cambios: cambios.filter((x) => !x.antes || !x.despues || !igual(x.antes, x.despues)) };
}

/** Qué cambia, en palabras del portal. */
function tituloDeCambio(c: CorreccionIA, filas: FilaRevisable[]): string {
  const fila = filas.find((f) => f.linea === c.linea)!;
  const n = `«${fila.nombre}»`;
  switch (c.accion) {
    case 'rol': return `${n} pasa a ser: ${ETIQUETA_ROL[c.rol!]}`;
    case 'precio': return `${n} cuesta $${c.precio!.toLocaleString('es-CO')}`;
    case 'seccion': return `${n} pasa a la sección «${c.seccion}»`;
    case 'nombre': return `${n} se escribe «${c.nombre}»`;
    case 'separar_ingredientes': return `«${c.nombre}» con sus ingredientes aparte`;
    case 'descripcion_de': {
      const destino = filas.find((f) => f.linea === c.lineaDestino)!;
      return `${n} son los ingredientes de «${destino.nombre}»`;
    }
    case 'es_titulo': return `${n} es el título de una sección, no un plato`;
    case 'quitar': return `${n} no es un producto: se quita`;
  }
}

/**
 * ¿Se aplica sin preguntar? Solo lo seguro: confianza alta, y nunca un precio
 * que sustituya a otro que la carta ya tenía.
 */
export function seAplicaSola(c: CorreccionIA, antes: FilaRevisable, ctx: ContextoRevision): boolean {
  if (ctx.modo === 'instruccion') return true;
  if (c.confianza !== 'alta') return false;
  if (c.accion === 'precio' && antes.precio !== null) return false;
  return true;
}

/**
 * La revisión completa: valida cada corrección, aplica las seguras y deja las
 * demás como sugerencia.
 *
 * Las aplicadas van ENCADENADAS (cada una sobre el resultado de la anterior),
 * porque el portal las aplica en ese mismo orden. Las sugerencias, en cambio,
 * se calculan cada una contra el estado FINAL de lo aplicado y no entre sí: el
 * dueño puede aceptar cualquier subconjunto, y una sugerencia escrita contra
 * otra que no aceptó no casaría con su pantalla.
 */
export function revisarFilas(
  filas: FilaRevisable[],
  correcciones: CorreccionIA[],
  ctx: ContextoRevision,
): ResultadoRevision {
  let trabajo = filas.slice();
  const aplicadas: CambioIA[] = [];
  const pendientes: CorreccionIA[] = [];
  const descartadas: Descarte[] = [];
  const vistas = new Set<string>();

  for (const c of correcciones.slice(0, MAX_CORRECCIONES)) {
    const clave = `${c.linea}:${c.accion}`;
    if (vistas.has(clave)) {
      descartadas.push({ linea: c.linea, accion: c.accion, razon: 'repetida' });
      continue;
    }
    vistas.add(clave);
    const razon = motivoParaDescartar(c, trabajo, ctx);
    if (razon) {
      descartadas.push({ linea: c.linea, accion: c.accion, razon });
      continue;
    }
    const antes = trabajo.find((f) => f.linea === c.linea)!;
    if (!seAplicaSola(c, antes, ctx)) {
      pendientes.push(c);
      continue;
    }
    const titulo = tituloDeCambio(c, trabajo);
    const r = aplicar(trabajo, c);
    if (r.cambios.length === 0) continue;
    trabajo = r.filas;
    aplicadas.push({
      id: `ia-${aplicadas.length + 1}-${c.accion}-${c.linea}`,
      accion: c.accion, linea: c.linea, confianza: c.confianza,
      titulo, motivo: c.motivo, filas: r.cambios,
    });
  }

  const sugerencias: CambioIA[] = [];
  const orden: Record<ConfianzaIA, number> = { alta: 0, media: 1, baja: 2 };
  for (const c of pendientes.sort((a, b) => orden[a.confianza] - orden[b.confianza])) {
    const razon = motivoParaDescartar(c, trabajo, ctx);
    if (razon) {
      descartadas.push({ linea: c.linea, accion: c.accion, razon });
      continue;
    }
    const titulo = tituloDeCambio(c, trabajo);
    const r = aplicar(trabajo, c);
    if (r.cambios.length === 0) continue;
    sugerencias.push({
      id: `ia-s${sugerencias.length + 1}-${c.accion}-${c.linea}`,
      accion: c.accion, linea: c.linea, confianza: c.confianza,
      titulo, motivo: c.motivo, filas: r.cambios,
    });
  }

  return { filas: trabajo, aplicadas, sugerencias, descartadas };
}
