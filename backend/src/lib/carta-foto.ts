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
  /** Null = no se pudo determinar. NUNCA se inventa. */
  precio: number | null;
  /** La sección en la que cayó («Entradas»), o vacío si iba antes de la primera. */
  seccion: string;
  /** Por qué hay que mirar esta fila. Ausente = salió limpia. */
  aviso?: string;
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
 */
function tituloDeSeccion(texto: string): string {
  const limpio = texto.replace(/\s{2,}/g, ' ').trim();
  if (limpio !== limpio.toUpperCase()) return limpio;
  const bajo = limpio.toLowerCase();
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
}

/** Cómo se ve un precio en el aviso, para que el dueño reconozca su carta. */
function comoPesos(n: number): string {
  return `$${n.toLocaleString('es-CO')}`;
}

/**
 * Convierte el texto que devolvió el OCR en filas de catálogo.
 *
 * Nada de lo que sale de aquí se guarda: alimenta la vista previa, donde el
 * dueño corrige antes de importar.
 */
export function parsearCarta(texto: string): CartaLeida {
  return parsearRenglones((texto ?? '').split(/\r?\n/).map((t) => ({ texto: t })));
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
  lineas: Array<{ texto: string; alto: number }>,
  altoCuerpo: number,
  esTitulo: (alto: number, cuerpo: number) => boolean,
): CartaLeida {
  return parsearRenglones(lineas.map((l) => ({
    texto: l.texto,
    // Sin alto medido se deja `undefined` para que decidan las pistas del
    // texto: un `false` diría «es del tamaño del cuerpo», que no se sabe.
    grande: altoCuerpo > 0 && l.alto > 0 ? esTitulo(l.alto, altoCuerpo) : undefined,
  })));
}

function parsearRenglones(filas: Array<{ texto: string; grande?: boolean }>): CartaLeida {
  const salida: CartaLeida = { lineas: [], secciones: [] };
  let seccion = '';

  for (let i = 0; i < filas.length; i++) {
    const cruda = filas[i]!.texto.replace(/\s{2,}/g, ' ').trim();
    if (!cruda) continue;
    const grande = filas[i]!.grande;

    const precios = preciosDeLinea(cruda);
    const nombre = nombreDeLinea(cruda);
    const linea = i + 1;

    if (precios.length === 0) {
      if (pareceSeccion(nombre, grande)) {
        seccion = tituloDeSeccion(nombre.replace(/\s*:\s*$/, ''));
        if (!salida.secciones.includes(seccion)) salida.secciones.push(seccion);
        continue;
      }
      salida.lineas.push({
        linea, nombre, precio: null, seccion,
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
        linea, nombre, precio: null, seccion,
        aviso: `Tiene ${precios.length} precios (${precios.map(comoPesos).join(' y ')}). `
          + 'Deja uno, o créalo como dos productos.',
      });
      continue;
    }

    salida.lineas.push({ linea, nombre, precio: precios[0]!, seccion });
  }

  return salida;
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
