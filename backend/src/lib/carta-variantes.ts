// ── El mismo plato en varios tamaños ─────────────────────────────────────────
//
// POR QUÉ EXISTE. Una carta impresa escribe la picada tres veces —pequeña
// 39.000, mediana 46.000, grande 80.000— y el lector de la foto crea tres
// productos sueltos. En la app eso son tres filas que se leen como tres platos
// distintos, y el dueño que quiera arreglarlo tiene que borrar dos y armar el
// grupo de opciones a mano en otra pantalla. Casi nadie lo hace, así que el
// catálogo nace mal modelado y así se queda.
//
// LO QUE HACE: PROPONE. Igual que el resto del importador, no publica nada —
// devuelve una sugerencia para la vista previa, donde el dueño la acepta,
// la corrige o la deja separada. Lo que apruebe sale por el importador de
// siempre más `setProductOptions`, que son los dos caminos ya validados.
//
// LAS TRES REGLAS QUE IMPIDEN QUE ESTO ESTROPEE UN CATÁLOGO:
//
//   1. **El precio base es el MENOR, nunca el primero que aparece.** Una carta
//      que liste «Grande» arriba daría recargos negativos: la opción pequeña
//      sería un descuento, el precio de la lista sería el caro y la app no
//      diría «Desde». El orden del papel no puede decidir el precio.
//   2. **Todas las filas tienen que traer su palabra de tamaño.** Juntar
//      «Picada 39.000» con «Picada familiar 80.000» obligaría a bautizar la
//      primera («Normal»), y eso es inventarle al dueño el nombre de un
//      tamaño que su carta no escribe.
//   3. **Ante la duda no se agrupa.** Agrupar de más funde dos platos
//      distintos en uno y hace desaparecer el segundo del catálogo; no
//      agrupar deja dos filas que el dueño ve y junta en diez segundos. El
//      error barato es el segundo.

import { tituloDeSeccion, type LineaCarta } from './carta-foto';
import { esTokenDeTamano, juntarMedidas } from './palabras-tamano';

/** Cómo se llama el grupo que se crea. Editable por el dueño en el portal. */
export const GRUPO_TAMANO = 'Tamaño';

/** El grupo cuando las opciones no son tamaños («en agua / en leche»). */
export const GRUPO_OPCION = 'Opción';

/** Cada palabra de la opción nombra un tamaño («Personal», «1/2», «350ml»). */
function nombraUnTamano(nombre: string): boolean {
  const tokens = juntarMedidas(nombre).split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every(esTokenDeTamano);
}

/**
 * Lo que NUNCA se agrupa por tamaño aunque traiga la palabra: un combo, una
 * promoción. «Combo personal» (perro + papas + jugo) y «Combo familiar» (cuatro
 * hamburguesas…) son dos productos con contenido distinto; fundirlos hacía
 * desaparecer uno del catálogo.
 */
const BASE_QUE_NO_ES_UN_PLATO = /^(?:combo|combos|promo|promocion|promociones|oferta|ofertas|paquete|plan)\b/;

/**
 * Cuántos tamaños puede tener un plato.
 *
 * Más de seis no es una carta, es el lector habiendo metido varios platos en
 * el mismo nombre base. Y vale igual para una línea con muchos precios: ocho
 * números en un renglón es una columna entera que se leyó torcida.
 */
export const MAX_TAMANOS = 6;

/** El nombre base, para comparar dos filas entre sí. */
function baseNormalizada(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Deja el nombre base presentable después de quitarle el tamaño.
 *
 * Quita el «de» que encabeza lo que queda —«1/4 de pollo» deja «de pollo», y
 * eso tiene que casar con «Pollo entero»— y la puntuación que sostenía el
 * tamaño («Picada - Grande» deja «Picada -»).
 */
function limpiarBase(texto: string): string {
  return texto
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s.·•\-–—_:|/,]+|[\s.·•\-–—_:|/,]+$/g, '')
    .replace(/^(?:de|del)\s+/i, '')
    .trim();
}

/** El plato y su tamaño, separados. `null` = la línea no nombra ningún tamaño. */
export function trocearTamano(
  nombre: string,
): { base: string; etiqueta: string } | null {
  const tokens = juntarMedidas(nombre ?? '').split(/\s+/).filter(Boolean);
  const etiqueta: string[] = [];
  const base: string[] = [];

  for (const token of tokens) {
    const esTamano = esTokenDeTamano(token);
    // La etiqueta se guarda COMO ESTÁ ESCRITA, solo sin la puntuación de los
    // bordes: `tokenLimpio` quita las tildes y la ñ para poder comparar, y
    // usar eso para mostrar dejaría el tamaño en «Pequena».
    if (esTamano) etiqueta.push(token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
    else base.push(token);
  }

  if (etiqueta.length === 0) return null;
  const textoBase = limpiarBase(base.join(' '));
  // Sin nombre que quede, lo único que había era el tamaño: «Grande 8.000» no
  // dice de qué, y agruparlo con otro «Pequeña 5.000» de la misma sección
  // crearía un producto llamado como la sección. El dueño ve las dos filas.
  if (textoBase.length < 2) return null;
  return { base: textoBase, etiqueta: etiqueta.join(' ') };
}

export interface OpcionSugerida {
  /** Cómo se llama el tamaño. Vacío = lo tiene que escribir el dueño. */
  nombre: string;
  /** Lo que cuesta ESE tamaño, tal como lo dice la carta. */
  precio: number;
  /** Lo que se le suma al precio base. Siempre ≥ 0. */
  precioDelta: number;
}

export interface VarianteSugerida {
  /** El plato, ya sin el tamaño («Picada»). */
  nombre: string;
  seccion: string;
  /** El MENOR de los precios: es el que se guarda en el producto. */
  precioBase: number;
  /** Nombre del grupo de opciones. */
  grupo: string;
  opciones: OpcionSugerida[];
  /** Las `linea` de la carta que se funden en este producto. */
  lineas: number[];
  /**
   * Los ingredientes del plato, si la carta los escribió. Al fundir las filas
   * se perdían: «Picada pequeña 39.000 / Res, cerdo, chorizo» llegaba al
   * catálogo como una picada sin decir qué trae.
   */
  descripcion?: string;
  /**
   * `true` cuando la sugerencia salió de UNA línea con varios precios y no se
   * sabe cómo se llama cada tamaño. No se puede importar hasta que el dueño
   * los nombre, y por eso nace sin aceptar.
   */
  faltanNombres: boolean;
  /**
   * Plato o acompañamiento (una gaseosa en tres tamaños también se agrupa).
   * Los adicionales NUNCA forman variantes: no son un producto, son opciones
   * de otro, y «Queso pequeño / grande» se resuelve dentro de su grupo.
   */
  rol: 'plato' | 'acompanamiento';
}

/** Ordena por precio y, a igual precio, por el orden en que venían. */
function porPrecio<T extends { precio: number; orden: number }>(a: T, b: T): number {
  return a.precio - b.precio || a.orden - b.orden;
}

/**
 * Filas de la misma carta que parecen el mismo plato en varios tamaños.
 *
 * Dos caminos, y los dos salen de la MISMA carta:
 *
 *   **A. Varias líneas con palabra de tamaño.** «Picada pequeña 39.000»,
 *   «Picada grande 80.000». Se agrupan por sección y nombre base. Nace
 *   aceptada: los nombres de los tamaños los escribió la carta, no nosotros.
 *
 *   **B. Una línea con varios precios.** «Picada 39.000 46.000 80.000». Se
 *   sabe cuánto cuesta cada tamaño y NO cómo se llama, así que las opciones
 *   salen sin nombre y la sugerencia nace sin aceptar. Antes esta línea se
 *   rechazaba entera y el aviso mandaba a crear dos productos, que es justo lo
 *   que había que deshacer después.
 */
export function sugerirVariantes(lineas: LineaCarta[]): VarianteSugerida[] {
  const salida: VarianteSugerida[] = [];

  // ── A. El mismo nombre base, en la misma sección, con tamaños distintos ──
  interface Candidata {
    linea: number;
    orden: number;
    precio: number;
    etiqueta: string;
    base: string;
    seccion: string;
    acompanamiento: boolean;
    descripcion?: string;
  }
  const porBase = new Map<string, Candidata[]>();

  lineas.forEach((l, orden) => {
    if (l.precio == null || !(l.precio > 0)) return;
    if (l.rol === 'adicional' || l.rol === 'guarnicion') return;
    const troceado = trocearTamano(l.nombre);
    if (!troceado) return;
    if (BASE_QUE_NO_ES_UN_PLATO.test(baseNormalizada(troceado.base))) return;
    // La sección entra en la clave: una «Grande» de Bebidas y otra de Picadas
    // no son el mismo plato aunque el nombre base coincidiera.
    const clave = `${baseNormalizada(l.seccion)}\u0000${baseNormalizada(troceado.base)}`;
    const grupo = porBase.get(clave) ?? [];
    grupo.push({
      linea: l.linea,
      orden,
      precio: l.precio,
      etiqueta: troceado.etiqueta,
      base: troceado.base,
      seccion: l.seccion,
      acompanamiento: l.rol === 'acompanamiento',
      ...(l.descripcion ? { descripcion: l.descripcion } : {}),
    });
    porBase.set(clave, grupo);
  });

  for (const candidatas of porBase.values()) {
    if (candidatas.length < 2 || candidatas.length > MAX_TAMANOS) continue;
    // Dos filas con el MISMO tamaño no son dos tamaños: o el lector repitió
    // una línea, o son dos platos que se llaman casi igual. Crear un grupo con
    // dos opciones «Grande» dejaría al cliente eligiendo entre dos idénticas.
    const etiquetas = new Set(candidatas.map((c) => baseNormalizada(c.etiqueta)));
    if (etiquetas.size !== candidatas.length) continue;
    // Si todos cuestan lo mismo no hay nada que modelar: el precio de la lista
    // ya es el que se paga, y el grupo solo añadiría un paso al pedido.
    if (new Set(candidatas.map((c) => c.precio)).size < 2) continue;

    const ordenadas = [...candidatas].sort(porPrecio);
    const precioBase = ordenadas[0]!.precio;
    // El nombre se toma de la fila que aparece PRIMERO en la carta, no de la
    // más barata: es como está impreso, y las dos son la misma palabra salvo
    // mayúsculas.
    const enOrden = [...candidatas].sort((a, b) => a.orden - b.orden);
    const primera = enOrden[0]!;
    // Los ingredientes de la primera fila que los traiga: los tamaños suelen
    // compartirlos, y la carta los escribe una vez.
    const descripcion = enOrden.find((c) => c.descripcion)?.descripcion;

    salida.push({
      nombre: tituloDeSeccion(primera.base),
      seccion: primera.seccion,
      precioBase,
      grupo: GRUPO_TAMANO,
      opciones: ordenadas.map((c) => ({
        nombre: tituloDeSeccion(c.etiqueta),
        precio: c.precio,
        precioDelta: c.precio - precioBase,
      })),
      lineas: ordenadas.map((c) => c.linea),
      ...(descripcion ? { descripcion } : {}),
      faltanNombres: false,
      // Acompañamiento solo si lo son TODAS: ante la duda, plato.
      rol: candidatas.every((c) => c.acompanamiento) ? 'acompanamiento' : 'plato',
    });
  }

  // ── B. Una sola línea que trae varios precios ────────────────────────────
  for (const l of lineas) {
    const precios = l.precios ?? [];
    if (l.precio != null) continue;
    if (l.rol === 'adicional' || l.rol === 'guarnicion') continue;
    if (precios.length < 2 || precios.length > MAX_TAMANOS) continue;
    if (!l.nombre || l.nombre.trim().length < 2) continue;

    // La carta dijo cómo se llama cada precio —el encabezado de la tabla o el
    // propio nombre («en agua / en leche»)—: los nombres van con SU precio,
    // por posición, y la sugerencia nace lista como la del camino A.
    const nombres = l.tamanos?.length === precios.length ? l.tamanos : null;
    if (nombres && new Set(nombres.map(baseNormalizada)).size === nombres.length) {
      const pares = precios
        .map((precio, orden) => ({ precio, orden, nombre: nombres[orden]! }))
        .sort(porPrecio);
      const precioBase = pares[0]!.precio;
      salida.push({
        nombre: tituloDeSeccion(l.nombre.trim()),
        seccion: l.seccion,
        precioBase,
        // «Tamaño» solo si lo son: «en agua / en leche» es otra cosa.
        grupo: nombres.every(nombraUnTamano) ? GRUPO_TAMANO : GRUPO_OPCION,
        opciones: pares.map((p) => ({
          nombre: tituloDeSeccion(p.nombre),
          precio: p.precio,
          precioDelta: p.precio - precioBase,
        })),
        lineas: [l.linea],
        ...(l.descripcion ? { descripcion: l.descripcion } : {}),
        faltanNombres: false,
        rol: l.rol === 'acompanamiento' ? 'acompanamiento' : 'plato',
      });
      continue;
    }

    const unicos = [...new Set(precios)].sort((a, b) => a - b);
    // Tres veces el mismo número no son tres tamaños.
    if (unicos.length < 2) continue;
    const precioBase = unicos[0]!;

    salida.push({
      nombre: tituloDeSeccion(l.nombre.trim()),
      seccion: l.seccion,
      precioBase,
      grupo: GRUPO_TAMANO,
      opciones: unicos.map((p) => ({
        nombre: '',
        precio: p,
        precioDelta: p - precioBase,
      })),
      lineas: [l.linea],
      ...(l.descripcion ? { descripcion: l.descripcion } : {}),
      faltanNombres: true,
      rol: l.rol === 'acompanamiento' ? 'acompanamiento' : 'plato',
    });
  }

  // En el orden en que aparecen en la carta, para que la vista previa siga el
  // papel que el dueño tiene delante.
  return salida.sort((a, b) => (a.lineas[0] ?? 0) - (b.lineas[0] ?? 0));
}

/**
 * ¿Esta variante se puede crear ya?
 *
 * La comprueban el portal —para decir qué falta y bloquear el botón— y la
 * ruta —porque lo que llega por HTTP no tiene por qué haber pasado por el
 * portal—. Una sola función: si cada lado decidiera por su cuenta, el botón
 * se habilitaría para algo que el servidor va a rechazar.
 */
export function motivoParaNoAgrupar(v: {
  nombre?: string;
  precioBase?: number;
  grupo?: string;
  opciones?: Array<{ nombre?: string; precioDelta?: number }>;
}): string | null {
  if (!v.nombre?.trim()) return 'Escribe cómo se llama el plato.';
  if (!v.grupo?.trim()) return 'Escribe cómo se llama el grupo (por ejemplo, «Tamaño»).';
  const opciones = v.opciones ?? [];
  if (opciones.length < 2) return 'Un grupo de tamaños necesita al menos dos.';
  if (opciones.length > MAX_TAMANOS) {
    return `Son demasiados tamaños (máximo ${MAX_TAMANOS}).`;
  }
  if (!(Number(v.precioBase) > 0)) return 'Falta el precio del tamaño más barato.';
  if (opciones.some((o) => !o.nombre?.trim())) {
    return 'Ponle nombre a cada tamaño (pequeña, mediana, grande…).';
  }
  const vistos = new Set(opciones.map((o) => baseNormalizada(o.nombre ?? '')));
  if (vistos.size !== opciones.length) return 'Hay dos tamaños que se llaman igual.';
  // Un recargo negativo significa que el precio base no es el más barato, y
  // entonces la app enseñaría el caro y el «Desde» mentiría al revés.
  if (opciones.some((o) => !(Number(o.precioDelta) >= 0))) {
    return 'El precio base tiene que ser el del tamaño más barato.';
  }
  return null;
}
