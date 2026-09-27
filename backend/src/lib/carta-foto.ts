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
 * Una línea SIN precio: ¿es el título de una sección o un plato al que el OCR
 * no le leyó el precio?
 *
 * No se puede saber con certeza, así que se elige por longitud: los
 * encabezados de una carta son cortos («BEBIDAS», «Platos fuertes») y el plato
 * al que se le perdió el precio suele traer su descripción detrás. Lo que NO
 * se hace es descartar la línea en silencio: si no es encabezado, sale como
 * fila con aviso y el dueño decide.
 */
function pareceSeccion(nombre: string): boolean {
  if (!nombre || nombre.length > LARGO_MAX_SECCION) return false;
  // Una frase con puntuación de oración es un plato descrito, no un título.
  if (/[.,;:]/.test(nombre)) return false;
  return nombre.split(/\s+/).length <= 4;
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
  const salida: CartaLeida = { lineas: [], secciones: [] };
  let seccion = '';

  const filas = (texto ?? '').split(/\r?\n/);
  for (let i = 0; i < filas.length; i++) {
    const cruda = filas[i]!.replace(/\s{2,}/g, ' ').trim();
    if (!cruda) continue;

    const precios = preciosDeLinea(cruda);
    const nombre = nombreDeLinea(cruda);
    const linea = i + 1;

    if (precios.length === 0) {
      if (pareceSeccion(nombre)) {
        seccion = tituloDeSeccion(nombre);
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
