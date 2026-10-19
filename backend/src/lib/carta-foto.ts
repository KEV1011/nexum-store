// ── La carta del restaurante, leída de una foto ──────────────────────────────
//
// POR QUÉ EXISTE. Convencer a un restaurante es una conversación; hacerle
// digitar cuarenta platos es una tarde. Lo segundo es lo que de verdad frena
// el registro, y es lo único de los dos que se puede quitar con código: el
// dueño manda una foto de su carta impresa y el catálogo le queda escrito para
// que él lo revise.
//
// LO QUE ESTO **NO** HACE, y es deliberado: no publica nada. Devuelve filas
// para la MISMA vista previa obligatoria del CSV — el precio y la
// disponibilidad cambian, y un producto publicado a un precio que el dueño no
// aprobó lo descubre un cliente al pagar, no nosotros. La foto ahorra teclas,
// no sustituye al dueño.
//
// LA REGLA QUE SOSTIENE TODO: **el precio solo se rellena cuando la línea
// tiene EXACTAMENTE uno.** Sin precio o con dos, la fila sale con el precio
// vacío y su aviso. Un precio vacío lo rechaza el importador, así que el peor
// caso es un producto que falta —una llamada al restaurante— en vez de un
// producto al precio equivocado, que es plata y una queja.

/** Lo mínimo que puede costar algo en una carta. Por debajo es otra cosa. */
import { separarDescripcion } from './nombre-y-descripcion';
import { rolDeLinea, type RolCarta } from './carta-rol';

export const PRECIO_MIN = 500;

/**
 * Tope de cordura. Nada en una carta cuesta más de un millón, y por encima
 * suele ser el OCR pegando dos números («12.000» y «8.000» → «120008000»).
 */
export const PRECIO_MAX = 1_000_000;

/** Hasta cuántos caracteres una línea sin precio se toma por encabezado. */
const LARGO_MAX_SECCION = 28;

export interface LineaCarta {
  /** Línea del texto leído, 1 = la primera. Para poder señalarla en pantalla. */
  linea: number;
  nombre: string;
  /**
   * Los ingredientes, cuando la carta los traía pegados al nombre.
   *
   * Una carta impresa escribe «Hamburguesa Camarón (Croqueta de carne,
   * cebolla, queso)» en un solo renglón. Eso NO es el nombre del plato: en
   * la lista sale con elipsis y el precio se va fuera de la vista. Ausente =
   * la línea no traía nada que separar.
   */
  descripcion?: string;
  /** Null = no se pudo determinar. NUNCA se inventa. */
  precio: number | null;
  /** La sección en la que cayó («Entradas»), o vacío si iba antes de la primera. */
  seccion: string;
  /** Por qué hay que mirar esta fila. Ausente = salió limpia. */
  aviso?: string;
  /**
   * Los precios que traía la línea cuando eran VARIOS («Jugo 5.000 / 7.000»).
   *
   * Se conservan en vez de perderse dentro del texto del aviso: es el mismo
   * plato en dos tamaños bastante a menudo, y `carta-variantes` los necesita
   * para poder proponer que se agrupen. Que el precio siga en `null` es
   * deliberado — esta fila no se puede importar hasta que alguien decida.
   */
  precios?: number[];
  /**
   * Plato, adicional o acompañamiento: la PROPUESTA de `carta-rol`. El dueño
   * la cambia en la vista previa; aquí solo se dice qué parece y por qué.
   */
  rol: RolCarta;
  /** Por qué se propuso ese rol. Ausente = plato por defecto. */
  motivoRol?: string;
}

export interface CartaLeida {
  lineas: LineaCarta[];
  /** Los encabezados que se reconocieron, en orden de aparición. */
  secciones: string[];
}

/**
 * Los números de una línea que PUEDEN ser un precio.
 *
 * El punto en Colombia es separador de MILES: «3.500» son tres mil quinientos,
 * no tres con cinco. Por eso se quitan todos los separadores y se lee el
 * entero. El filtro por rango es lo que impide que «Empanadas (3)» aporte un
 * «3» y la línea parezca tener dos precios.
 */
export function preciosDeLinea(linea: string): number[] {
  const encontrados: number[] = [];
  // Grupos de dígitos que pueden llevar puntos, comas o espacios finos dentro.
  for (const m of linea.matchAll(/\d[\d.,  ]*\d|\d/g)) {
    const crudo = m[0];
    // Un token con más de un separador seguido no es un número, es basura de
    // OCR («12..000»); se limpia igual y el rango decide.
    const soloDigitos = crudo.replace(/[^\d]/g, '');
    if (!soloDigitos) continue;
    const n = Number(soloDigitos);
    if (Number.isFinite(n) && n >= PRECIO_MIN && n <= PRECIO_MAX) encontrados.push(n);
  }
  return encontrados;
}

/**
 * Quita el precio, los puntos guía y la decoración para quedarse con el nombre.
 *
 * Se borran SOLO los números que caen en el rango de un precio, no todos: el
 * «(3)» de «Empanadas (3)» le dice al cliente cuántas le dan, los «250 g» de
 * una porción son el tamaño, y un «2x1» es la oferta. Borrarlos cambiaba el
 * producto — y nadie lo habría notado hasta que alguien pidiera una empanada.
 */
function nombreDeLinea(linea: string): string {
  const sinPrecio = linea.replace(/\$?\s*\d[\d.,  ]*\d|\$?\s*\d/g, (t) => {
    const n = Number(t.replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n >= PRECIO_MIN && n <= PRECIO_MAX ? ' ' : t;
  });
  return sinPrecio
    // Puntos guía («Pechuga a la plancha ....... 19.000») y rayas de relleno.
    .replace(/[.·•\-–—_]{2,}/g, ' ')
    // Paréntesis que quedaron vacíos al llevarse el precio de dentro.
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    // La barra y los dos puntos sobran cuando separaban precios entre sí.
    .replace(/^[\s.·•\-–—_:|/]+|[\s.·•\-–—_:|/]+$/g, '')
    .trim();
}

/**
 * Las palabras con las que una carta colombiana titula sus secciones.
 *
 * NO es una lista de categorías que se le imponga al dueño: es una pista para
 * reconocer un título cuando las otras no alcanzan. «ADICIONES» tiene una sola
 * palabra y mide nueve letras, así que la longitud ya lo acepta; lo que esto
 * rescata es «Hamburguesas de la casa» o «BEBIDAS Y GASEOSAS FRÍAS», que son
 * títulos y la longitud los rechazaba.
 *
 * Están sin tildes y en minúscula porque se comparan contra el texto
 * normalizado: «DESAYUNOS» y «Desayúnos» tienen que casar igual.
 */
const PALABRAS_DE_SECCION = [
  'entrada', 'entradas', 'plato', 'platos', 'fuerte', 'fuertes', 'especial', 'especiales',
  'bebida', 'bebidas', 'gaseosa', 'gaseosas', 'jugo', 'jugos', 'cerveza', 'cervezas',
  'licor', 'licores', 'coctel', 'cocteles', 'vino', 'vinos', 'cafe', 'cafes',
  'postre', 'postres', 'adicion', 'adiciones', 'acompanamiento', 'acompanamientos',
  'hamburguesa', 'hamburguesas', 'perro', 'perros', 'pizza', 'pizzas', 'sandwich',
  'arepa', 'arepas', 'empanada', 'empanadas', 'asado', 'asados', 'parrilla',
  'carne', 'carnes', 'pollo', 'pescado', 'pescados', 'mariscos', 'sopa', 'sopas',
  'caldo', 'caldos', 'sancocho', 'ensalada', 'ensaladas', 'pasta', 'pastas',
  'desayuno', 'desayunos', 'almuerzo', 'almuerzos', 'cena', 'cenas', 'corrientazo',
  'combo', 'combos', 'promocion', 'promociones', 'picada', 'picadas', 'salchipapa',
  'menu', 'carta', 'infantil', 'ninos', 'vegetariano', 'vegetariana', 'sin gluten',
];

/** Para comparar con el vocabulario: sin tildes, en minúscula, sin sobras. */
function normalizado(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** El texto va GRITADO, que en una carta impresa casi siempre es un título. */
function vaEnMayusculas(texto: string): boolean {
  const letras = texto.replace(/[^a-záéíóúñü]/gi, '');
  // Con menos de tres letras no se puede distinguir un grito de una sigla.
  if (letras.length < 3) return false;
  return texto === texto.toUpperCase();
}

/** Alguna de sus palabras es de las que titulan secciones. */
function suenaASeccion(texto: string): boolean {
  const n = normalizado(texto);
  if (!n) return false;
  if (PALABRAS_DE_SECCION.includes(n)) return true;
  const palabras = n.split(' ');
  // Un título lleva pocas palabras. «Hamburguesa con queso y tocineta 18.000»
  // menciona «hamburguesa» y es un plato, no la sección.
  if (palabras.length > 4) return false;
  return palabras.some((p) => PALABRAS_DE_SECCION.includes(p));
}

/**
 * Una línea SIN precio: ¿es el título de una sección o un plato al que el OCR
 * no le leyó el precio?
 *
 * No se puede saber con certeza, así que se juntan las pistas que la carta sí
 * da, de la más fuerte a la más débil:
 *
 *   1. **El TAMAÑO de la letra**, cuando se leyó la geometría de la foto. En
 *      papel un título no se reconoce por ser corto, se reconoce por ser más
 *      grande; es la única pista que acierta con «PLATOS FUERTES Y ESPECIALES
 *      DE LA CASA» (largo) y con «Pechuga» (corto, y es un plato).
 *   2. Que vaya GRITADO, o que acabe en dos puntos.
 *   3. El vocabulario con el que se titula una sección en una carta de aquí.
 *   4. Y, de último, la longitud — que es lo único que había antes.
 *
 * Lo que NO se hace es descartar la línea en silencio: si no es encabezado,
 * sale como fila con aviso y el dueño decide.
 */
function pareceSeccion(nombre: string, grande?: boolean): boolean {
  if (!nombre) return false;
  // Una frase con punto o punto y coma es un plato descrito, nunca un título;
  // los dos puntos, al contrario, son la forma de escribir «BEBIDAS:».
  if (/[.;]/.test(nombre)) return false;
  const sinDosPuntos = nombre.replace(/\s*:\s*$/, '');
  if (/[,:]/.test(sinDosPuntos)) return false;

  if (grande === true) return sinDosPuntos.split(/\s+/).length <= 7;
  // Con geometría leída, un renglón del tamaño del cuerpo NO es un título
  // aunque sea corto: ahí el tamaño ya respondió la pregunta, y hacerle caso a
  // la longitud por encima devolvería el defecto que esto corrige.
  if (grande === false) return false;

  if (nombre.endsWith(':')) return sinDosPuntos.split(/\s+/).length <= 5;
  if (vaEnMayusculas(sinDosPuntos) && sinDosPuntos.split(/\s+/).length <= 6) return true;
  if (suenaASeccion(sinDosPuntos)) return true;
  if (sinDosPuntos.length > LARGO_MAX_SECCION) return false;
  return sinDosPuntos.split(/\s+/).length <= 4;
}

/**
 * Los títulos de una carta van gritados y en la app se leerían gritando.
 * «PLATOS FUERTES» → «Platos fuertes». Si el dueño ya escribió con
 * mayúsculas y minúsculas, se respeta tal cual.
 *
 * Se exporta para que `carta-variantes` destape igual los nombres de los
 * tamaños («PEQUEÑA» → «Pequeña») y el del plato base: con una copia, la
 * sección y el producto de la MISMA carta acabarían escritos distinto.
 */
export function tituloDeSeccion(texto: string): string {
  const limpio = texto.replace(/\s{2,}/g, ' ').trim();
  if (limpio !== limpio.toUpperCase()) return limpio;
  const bajo = limpio.toLowerCase();
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
}

/** Cómo se ve un precio en el aviso, para que el dueño reconozca su carta. */
function comoPesos(n: number): string {
  return `$${n.toLocaleString('es-CO')}`;
}

/** Un renglón tal como entra al parser, antes de clasificarlo. */
interface RenglonCrudo {
  texto: string;
  /** `true` = escrito más grande que el cuerpo (solo con geometría leída). */
  grande?: boolean;
  /** Columna de la página, cuando se leyó la geometría. */
  columna?: number;
}

/**
 * ¿La línea entera es UN PRECIO y nada más?
 *
 * Se exige que no quede ni una letra: «21.000» sí, «Jugo 5.000» no, «2x1» no,
 * «(3)» no. Y que el número caiga en el rango de un precio, para que un «3»
 * suelto —que suele ser cuántas unidades trae el plato— no se tome por uno.
 */
function soloPrecio(texto: string): boolean {
  const t = texto.trim();
  if (!/^\$?\s*\d[\d.,\s]*\d$|^\$?\s*\d$/.test(t)) return false;
  return preciosDeLinea(t).length === 1;
}

/** Todas sus palabras son de las que titulan una sección. */
function todoSuenaASeccion(texto: string): boolean {
  const n = normalizado(texto);
  if (!n) return false;
  return n.split(' ').every((p) => PALABRAS_DE_SECCION.includes(p));
}

/**
 * Une el precio que quedó SOLO en su renglón con el nombre del plato de arriba.
 *
 * EL DEFECTO QUE CORRIGE, y es el más caro de todo el lector. La carta impresa
 * más común pone el nombre en un renglón y el precio en el siguiente:
 *
 *     Carne asada
 *     21.000
 *
 * Sin esta pasada, «Carne asada» no tiene precio y es corta, así que se toma
 * por SECCIÓN; y «21.000» entra en la rama de «no se pudo separar el nombre del
 * precio» y se emite como un producto LLAMADO «21.000». Resultado: el plato
 * desaparece del catálogo y su precio ocupa su lugar. Es exactamente lo que el
 * dueño encontró en su carta: secciones con nombre de plato y productos
 * llamados «$23.000».
 *
 * CUÁNDO **NO** SE UNE. Unir de más convierte un encabezado en producto —con
 * precio y publicable—, así que ante la duda se deja como está: el dueño ve una
 * fila con aviso en la vista previa y la corrige, que es el error barato.
 *
 *   1. Si el renglón de arriba YA tiene precio: son dos platos distintos.
 *   2. Si va escrito MÁS GRANDE que el cuerpo: con geometría leída, el tamaño
 *      es la mejor pista que existe y manda sobre todo lo demás.
 *   3. Si TODAS sus palabras son de las que titulan secciones («BEBIDAS»,
 *      «PLATOS FUERTES»). Se exige que lo sean todas a propósito: «CARNE ASADA»
 *      lleva «carne» del vocabulario pero «asada» no, y es un plato. El empate
 *      que queda —un plato llamado solo «POLLO»— sale como fila con aviso.
 *   4. Si están en COLUMNAS distintas de la página: el precio de la columna
 *      derecha no es el del último plato de la izquierda.
 *   5. Si entre los dos hay un renglón en blanco: en el texto del OCR eso
 *      separa bloques.
 *   6. A un mismo nombre no se le pega más de un precio.
 */
export function unirPreciosHuerfanos(filas: RenglonCrudo[]): RenglonCrudo[] {
  const salida: RenglonCrudo[] = [];
  // Índice en `salida` del último renglón que puede absorber un precio.
  // `null` cuando lo de arriba fue un blanco, un título grande o ya absorbió.
  let candidato: number | null = null;

  for (const fila of filas) {
    const texto = (fila.texto ?? '').replace(/\s{2,}/g, ' ').trim();
    if (!texto) {
      salida.push(fila);
      candidato = null;
      continue;
    }

    if (candidato !== null && soloPrecio(texto)) {
      const prev = salida[candidato]!;
      const mismaColumna = prev.columna === undefined
        || fila.columna === undefined
        || prev.columna === fila.columna;
      if (mismaColumna) {
        salida[candidato] = { ...prev, texto: `${prev.texto.trim()} ${texto}` };
        candidato = null;
        continue;
      }
    }

    salida.push({ ...fila, texto });
    const puedeAbsorber = preciosDeLinea(texto).length === 0
      && fila.grande !== true
      && !todoSuenaASeccion(texto)
      && texto.length >= 2;
    candidato = puedeAbsorber ? salida.length - 1 : null;
  }

  return salida;
}

/**
 * Convierte el texto que devolvió el OCR en filas de catálogo.
 *
 * Nada de lo que sale de aquí se guarda: alimenta la vista previa, donde el
 * dueño corrige antes de importar.
 */
export function parsearCarta(texto: string): CartaLeida {
  return parsearRenglones(
    unirPreciosHuerfanos((texto ?? '').split(/\r?\n/).map((t) => ({ texto: t }))),
  );
}

/**
 * La carta leída de los renglones MEDIDOS de la foto.
 *
 * Es el camino bueno: los renglones vienen columna por columna —así una carta
 * a dos columnas deja de pegar el plato de la izquierda con el precio del de la
 * derecha— y cada uno trae el tamaño de su letra, que es la pista con la que de
 * verdad se reconoce un título.
 */
export function parsearCartaMedida(
  lineas: Array<{ texto: string; alto: number; columna?: number }>,
  altoCuerpo: number,
  esTitulo: (alto: number, cuerpo: number) => boolean,
): CartaLeida {
  return parsearRenglones(unirPreciosHuerfanos(lineas.map((l) => ({
    texto: l.texto,
    // Sin alto medido se deja `undefined` para que decidan las pistas del
    // texto: un `false` diría «es del tamaño del cuerpo», que no se sabe.
    grande: altoCuerpo > 0 && l.alto > 0 ? esTitulo(l.alto, altoCuerpo) : undefined,
    // La columna viaja para que un precio de la columna derecha no se le pegue
    // al último plato de la izquierda.
    ...(l.columna !== undefined && { columna: l.columna }),
  }))));
}

function parsearRenglones(filas: Array<{ texto: string; grande?: boolean }>): CartaLeida {
  return conRol(parsearSinRol(filas));
}

function parsearSinRol(
  filas: Array<{ texto: string; grande?: boolean }>,
): { lineas: Array<Omit<LineaCarta, 'rol' | 'motivoRol'>>; secciones: string[] } {
  const salida: { lineas: Array<Omit<LineaCarta, 'rol' | 'motivoRol'>>; secciones: string[] } = { lineas: [], secciones: [] };
  let seccion = '';

  for (let i = 0; i < filas.length; i++) {
    const cruda = filas[i]!.texto.replace(/\s{2,}/g, ' ').trim();
    if (!cruda) continue;
    const grande = filas[i]!.grande;

    const precios = preciosDeLinea(cruda);
    const nombre = nombreDeLinea(cruda);
    const linea = i + 1;

    if (precios.length === 0) {
      // La decisión de si es un encabezado se toma con el nombre COMPLETO:
      // «Al gusto: 3 huevos pochados» separado dejaría «Al gusto», que es
      // corto y sin puntuación, o sea que pasaría por título de sección y se
      // llevaría por delante todos los platos que vienen debajo.
      if (pareceSeccion(nombre, grande)) {
        seccion = tituloDeSeccion(nombre.replace(/\s*:\s*$/, ''));
        if (!salida.secciones.includes(seccion)) salida.secciones.push(seccion);
        continue;
      }
      salida.lineas.push({
        linea, ...separarDescripcion(nombre), precio: null, seccion,
        aviso: 'No le encontramos precio. Escríbelo o borra la fila.',
      });
      continue;
    }

    if (!nombre || nombre.length < 2) {
      salida.lineas.push({
        linea, nombre: cruda, precio: null, seccion,
        aviso: 'No pudimos separar el nombre del precio en esta línea.',
      });
      continue;
    }

    if (precios.length > 1) {
      // Elegir uno por nuestra cuenta es justo el error caro: con «5.000 /
      // 7.000» quedarse con el primero vende barato el familiar y con el
      // último cobra de más el personal. Se deja vacío y se dice lo que hay.
      salida.lineas.push({
        linea, ...separarDescripcion(nombre), precio: null, seccion, precios,
        aviso: `Tiene ${precios.length} precios (${precios.map(comoPesos).join(' y ')}). `
          + 'Deja uno, o agrúpalos como tamaños del mismo plato.',
      });
      continue;
    }

    salida.lineas.push({ linea, ...separarDescripcion(nombre), precio: precios[0]!, seccion });
  }

  return salida;
}

/** Cada fila con el rol que se le propone. Va aparte para no tocar los cinco `push`. */
function conRol(carta: { lineas: Array<Omit<LineaCarta, 'rol' | 'motivoRol'>>; secciones: string[] }): CartaLeida {
  return {
    secciones: carta.secciones,
    lineas: carta.lineas.map((l) => {
      const { rol, motivo } = rolDeLinea({ nombre: l.nombre, seccion: l.seccion });
      return { ...l, rol, ...(motivo ? { motivoRol: motivo } : {}) };
    }),
  };
}

/**
 * Arma el CSV que come el importador de siempre.
 *
 * Existe aquí y no en el portal para que el ESCAPE viva junto al que lo lee
 * (`splitCsvLine`): un plato que se llame «Arroz, pollo y "especial"» tiene
 * que volver entero del otro lado, y dos implementaciones del mismo escape
 * acaban discrepando en el caso raro — que es el que rompe un catálogo.
 */
export function filasACsv(
  filas: Array<{ nombre: string; precio: number | null; seccion?: string; descripcion?: string }>,
): string {
  const celda = (v: string): string => {
    const s = (v ?? '').trim();
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = ['nombre,precio,seccion,descripcion'];
  for (const f of filas) {
    // Una fila sin precio no se escribe: el importador la rechazaría igual, y
    // colarla solo llenaría la vista previa de errores que ya se avisaron.
    if (f.precio == null || !(f.precio > 0)) continue;
    lineas.push([
      celda(f.nombre),
      String(Math.round(f.precio)),
      celda(f.seccion ?? ''),
      celda(f.descripcion ?? ''),
    ].join(','));
  }
  return lineas.join('\n');
}
