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
import { pareceDescripcion, separarDescripcion } from './nombre-y-descripcion';
import { rolDeLinea, seccionDeGuarnicion, type RolCarta } from './carta-rol';
import { esTokenDeTamano, juntarMedidas } from './palabras-tamano';
import { avisoDeErratas, corregirErratas } from './erratas-carta';

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
   * Cómo se llama cada uno de esos precios, en el MISMO orden, cuando la carta
   * lo dice: el encabezado de la tabla («Personal  Mediana  Grande
   * Familiar») o el propio nombre («Jugo en agua / en leche»). Ausente = no lo
   * dice, y el dueño los nombra en la vista previa.
   */
  tamanos?: string[];
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
  /**
   * Lo que la carta dice que TRAEN los platos, sin ser un plato: «Todos
   * nuestros sándwiches van acompañados de vegetales frescos y papa a la
   * francesa». Antes salía como una fila sin precio que el dueño tenía que
   * borrar, y la papa —que es lo que el cliente quiere saber— se perdía.
   * Ahora se propone como descripción de los platos de su sección.
   */
  notas: NotaCarta[];
  /**
   * Los renglones que NO son de la carta: teléfono, dirección, horario, redes.
   * Antes salían como platos sin precio —o peor, como SECCIONES, y todo lo que
   * venía debajo quedaba bajo un título «Domicilios 300 123 4567»—. Se
   * devuelven para que el dueño vea que se leyeron y por qué se dejaron fuera.
   */
  ignoradas: RenglonIgnorado[];
}

export interface RenglonIgnorado {
  linea: number;
  texto: string;
  /** «teléfono», «dirección»…, dicho al dueño. */
  motivo: string;
}

export interface NotaCarta {
  linea: number;
  /** La sección bajo la que estaba; vacía si iba antes del primer título. */
  seccion: string;
  /** Ya redactada para ir en la descripción de un plato. */
  texto: string;
}

/**
 * Un número tal como aparece en la línea, ya clasificado.
 *
 * Se trocea la línea UNA vez y de aquí salen los precios y el nombre: si los
 * dos se decidieran por separado, el nombre podría perder un número que el
 * precio no usó, o al revés.
 */
interface NumeroDeLinea {
  inicio: number;
  fin: number;
  /** El valor ya en pesos («8 mil» → 8000). Null = no es un entero. */
  valor: number | null;
  esPrecio: boolean;
  /** Es un número de teléfono: no es un precio y delata una línea de ruido. */
  telefono: boolean;
}

/**
 * Las formas en que se escribe un número en una carta, de la más específica a
 * la más general. El ORDEN es lo que hace funcionar esto:
 *
 *   1. Teléfono: celular («300 123 4567») o fijo nuevo («601 …»). Antes se
 *      leía como un solo número enorme y el rango lo tiraba, pero con los
 *      espacios bien leídos «300 123» pasaría por precio.
 *   2. «8 mil», «12k».
 *   3. Miles con punto o coma: «12.000», «12,000», «1.250.000».
 *   4. Miles con espacio: «12 000». SOLO grupos de tres exactos, y sin un
 *      dígito, punto o coma pegado detrás.
 *   5. Lo demás: un entero o un decimal suelto («28000», «1.5»).
 *
 * EL DEFECTO QUE CORRIGE, y era de plata. La versión anterior aceptaba
 * espacios DENTRO de cualquier número, así que pegaba lo que la carta pone
 * uno al lado del otro: «Alitas BBQ x6 16.000» salía a $616.000, «Empanadas
 * x3 6.000» a $36.000 —sin aviso, porque eran UN precio—, y «Hawaiana 12.000
 * 22.000 32.000 42.000» se fundía en un número de veinte cifras que el rango
 * descartaba: la pizza se quedaba sin ninguno de sus cuatro precios.
 */
const RE_NUMERO = new RegExp(
  [
    String.raw`(?<tel>(?:\+?57[\s.-]?)?(?:3\d{2}|60\d)[\s.-]?\d{3}[\s.-]?\d{4}(?!\d))`,
    String.raw`(?<mil>\d{1,3}\s*(?:mil|k)(?![\p{L}]))`,
    String.raw`(?<sep>\d{1,3}(?:[.,]\d{3})+(?![\d]))`,
    String.raw`(?<esp>\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?![\d.,]))`,
    String.raw`(?<suelto>\d+(?:[.,]\d+)?)`,
  ].join('|'),
  'giu',
);

/**
 * Lo que va DETRÁS de un número y lo convierte en una medida o una cantidad:
 * «600ml», «500 g», «12 porciones», «20 %». Un «500 g» de chorizo no son
 * quinientos pesos: con el mínimo de precio en 500, se vendía a eso.
 */
const RE_UNIDAD_DETRAS = new RegExp(
  String.raw`^\s*(?:%|(?:ml|cc|cm|mm|gr|grs|gramos?|g|kg|kgs|kilos?|lb|lbs|libras?|oz|onz|onzas?|`
    + String.raw`l|lt|lts|litros?|und|unds|unid|unidades|uds?|porci[oó]n(?:es)?|presas?|`
    + String.raw`personas?|pers|piezas?|pzs?)(?![\p{L}]))`,
  'iu',
);

/** «11:30», «8 am», «9pm»: es una hora. */
const RE_HORA_DETRAS = /^(?::\d|\s*(?:a\.?\s?m\b|p\.?\s?m\b|h\b|hrs?\b))/i;

function numerosDeLinea(linea: string): NumeroDeLinea[] {
  const salida: NumeroDeLinea[] = [];
  for (const m of linea.matchAll(RE_NUMERO)) {
    const inicio = m.index ?? 0;
    const fin = inicio + m[0].length;
    const g = m.groups ?? {};
    let valor: number | null = null;
    if (g['tel']) {
      salida.push({ inicio, fin, valor: null, esPrecio: false, telefono: true });
      continue;
    }
    if (g['mil']) valor = Number(m[0].replace(/[^\d]/g, '')) * 1000;
    else if (g['sep'] || g['esp']) valor = Number(m[0].replace(/[^\d]/g, ''));
    else if (/^\d+$/.test(m[0])) valor = Number(m[0]);
    // Un decimal suelto («1.5 L», «12,5») no es un precio en pesos.

    const detras = linea.slice(fin);
    const delante = linea.slice(0, inicio);
    const esMedida = RE_UNIDAD_DETRAS.test(detras);
    const esHora = RE_HORA_DETRAS.test(detras) || /\d:\s*$/.test(delante);
    const enRango = valor != null && Number.isFinite(valor)
      && valor >= PRECIO_MIN && valor <= PRECIO_MAX;
    salida.push({
      inicio, fin, valor,
      esPrecio: enRango && !esMedida && !esHora,
      telefono: false,
    });
  }
  return salida;
}

/**
 * Los números de una línea que PUEDEN ser un precio.
 *
 * El punto en Colombia es separador de MILES: «3.500» son tres mil quinientos,
 * no tres con cinco. El filtro por rango es lo que impide que «Empanadas (3)»
 * aporte un «3» y la línea parezca tener dos precios.
 */
export function preciosDeLinea(linea: string): number[] {
  return numerosDeLinea(linea).filter((n) => n.esPrecio).map((n) => n.valor!);
}

/** La línea trae un número de teléfono. */
export function traeTelefono(linea: string): boolean {
  return numerosDeLinea(linea).some((n) => n.telefono);
}

/**
 * Quita el precio, los puntos guía y la decoración para quedarse con el nombre.
 *
 * Se borran SOLO los números que son precio, no todos: el «(3)» de «Empanadas
 * (3)» le dice al cliente cuántas le dan, los «250 g» de una porción son el
 * tamaño, el «x6» de las alitas cuántas trae y un «2x1» es la oferta.
 * Borrarlos cambiaba el producto — y nadie lo habría notado hasta que alguien
 * pidiera una empanada.
 */
function nombreDeLinea(linea: string): string {
  let sinPrecio = '';
  let desde = 0;
  for (const n of numerosDeLinea(linea)) {
    if (!n.esPrecio) continue;
    // El signo de pesos que lo precede se va con él.
    const antes = linea.slice(desde, n.inicio).replace(/\$\s*$/, '');
    sinPrecio += `${antes} `;
    desde = n.fin;
  }
  sinPrecio += linea.slice(desde);
  return sinPrecio
    // Puntos guía («Pechuga a la plancha ....... 19.000») y rayas de relleno.
    .replace(/[.·•\-–—_]{2,}/g, ' ')
    // Paréntesis que quedaron vacíos al llevarse el precio de dentro.
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    // La barra y los dos puntos sobran cuando separaban precios entre sí, y el
    // «+» o el «por» que los anunciaban («Hazlo combo +6.000», «papas y
    // gaseosa por 5.000») se quedan colgando.
    .replace(/(?:\s+(?:por|a solo|solo|desde|valor))+\s*[:.]?\s*$/i, '')
    // El «+» del PRINCIPIO no se toca: «+ Tocineta» es como la carta dice
    // que eso es un adicional, y `carta-rol` lo lee de ahí.
    .replace(/^[\s.·•\-–—_:|/]+|[\s.·•\-–—_:|/+]+$/g, '')
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
function pareceSeccion(nombre: string, grande?: boolean, debil = true): boolean {
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
  // El vocabulario y la longitud son las pistas débiles: dentro de una lista
  // de guarniciones «Ensalada» es una opción, no la sección de ensaladas.
  // Lo único que ahí sigue siendo título es un nombre de sección ENTERO y en
  // plural («Postres», «Platos fuertes»), que es como se titula; una opción
  // se escribe en singular («Ensalada», «Arroz»). Ver `parsearSinRol`.
  if (!debil) return todoSuenaASeccion(sinDosPuntos) && /s$/.test(normalizado(sinDosPuntos));
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
  if (!/^\$?\s*\d[\d.,\s]*\d$|^\$?\s*\d$|^\$?\s*\d{1,3}\s*(?:mil|k)$/i.test(t)) return false;
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
      // NOMBRE, INGREDIENTES Y PRECIO, cada uno en su renglón:
      //
      //     Bandeja paisa
      //     Frijoles, arroz, carne molida, chicharrón, huevo y arepa
      //     28.000
      //
      // Pegar el precio al renglón de arriba creaba un plato LLAMADO como sus
      // ingredientes, y el nombre de verdad se volvía título de sección. El
      // precio va al NOMBRE; los ingredientes se quedan donde están y el
      // parser los toma como descripción del plato que ahora tiene precio.
      const nombre = candidato > 0 ? salida[candidato - 1] : undefined;
      if (mismaColumna && nombre && esNombreDeIngredientes(nombre, prev, fila)) {
        salida[candidato - 1] = { ...nombre, texto: `${nombre.texto.trim()} ${texto}` };
        candidato = null;
        continue;
      }
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
 * ¿`nombre` es el plato cuyos ingredientes son `ingredientes`, con el precio
 * suelto debajo de los dos?
 *
 * Se exige mucho a propósito, porque si se equivoca le cambia el precio de
 * sitio a un plato:
 *   - los ingredientes tienen FORMA de descripción (lista con comas, o una
 *     frase de varias palabras) y el nombre no;
 *   - el nombre es corto, sin comas ni precio, y no es un título (ni todas
 *     sus palabras de sección, ni más grande, ni gritado con vocabulario de
 *     sección);
 *   - los tres en la misma columna.
 */
function esNombreDeIngredientes(nombre: RenglonCrudo, ingredientes: RenglonCrudo, precio: RenglonCrudo): boolean {
  const n = (nombre.texto ?? '').replace(/\s{2,}/g, ' ').trim();
  const ing = (ingredientes.texto ?? '').trim();
  if (!n || !ing) return false;
  if (nombre.grande === true || ingredientes.grande === true) return false;
  const columnas = [nombre.columna, ingredientes.columna, precio.columna].filter((c) => c !== undefined);
  if (new Set(columnas).size > 1) return false;
  if (preciosDeLinea(n).length > 0 || n.includes(',') || n.split(/\s+/).length > 6) return false;
  if (todoSuenaASeccion(n) || (vaEnMayusculas(n) && suenaASeccion(n))) return false;
  if (n.endsWith(':')) return false;
  if (pareceDescripcion(n) && !vaEnMayusculas(n)) return false;
  if (hablaDeLaSeccion(ing)) return false;
  return ing.includes(',') || (pareceDescripcion(ing) && ing.length > n.length);
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
/**
 * Qué tan bien quedó leída una carta: cuántos platos salieron con UN precio.
 *
 * Sirve para elegir entre las dos lecturas que se pueden hacer de la misma
 * foto —por posición de las palabras, o por el texto corrido de Vision—. La de
 * posición es mejor casi siempre (separa columnas y ve el tamaño de la letra),
 * pero si la foto la engaña funde renglones enteros y deja platos sin precio;
 * el texto corrido, que Vision ordena él solo, a veces aguanta mejor. Elegir
 * por esto hace que una foto rara empeore la lectura en el peor de los casos
 * hasta la de antes, nunca por debajo.
 *
 * Una fila con VARIOS precios cuenta medio: puede ser un plato en tamaños
 * (bien leído) o dos platos pegados (mal leído), y no se sabe cuál.
 */
export function calidadDeLectura(c: CartaLeida): number {
  let puntos = 0;
  for (const l of c.lineas) {
    if (l.precio != null) puntos += 1;
    else if ((l.precios?.length ?? 0) > 1) puntos += 0.5;
  }
  return puntos;
}

/** La mejor de dos lecturas; en empate, la primera (la de posición). */
export function mejorLectura(primera: CartaLeida, segunda: CartaLeida): CartaLeida {
  return calidadDeLectura(segunda) > calidadDeLectura(primera) ? segunda : primera;
}

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
  return sinErratas(conRol(parsearSinRol(filas)));
}

/**
 * Corrige las erratas de los nombres y de los títulos (`erratas-carta`), y lo
 * DICE en el aviso de la fila: el dueño tiene que poder ver qué se cambió.
 *
 * Va después del rol a propósito: el rol se decide con lo que la carta trae
 * impreso, y una corrección nunca debe cambiar qué ES una fila.
 */
function sinErratas(carta: CartaLeida): CartaLeida {
  const secciones = new Map<string, string>();
  for (const sec of carta.secciones) secciones.set(sec, corregirErratas(sec).texto);
  return {
    ...carta,
    secciones: [...new Set(secciones.values())],
    notas: carta.notas.map((n) => ({ ...n, seccion: secciones.get(n.seccion) ?? n.seccion })),
    lineas: carta.lineas.map((l) => {
      const { texto, erratas } = corregirErratas(l.nombre);
      const seccion = secciones.get(l.seccion) ?? l.seccion;
      if (erratas.length === 0) return { ...l, seccion };
      const aviso = [l.aviso, avisoDeErratas(erratas)].filter(Boolean).join(' ');
      return { ...l, nombre: texto, seccion, aviso };
    }),
  };
}


// ── Lo que NO es de la carta ──────────────────────────────────────────────────

const RE_WEB = /(?:^|\s)@[\w.]{2,}|www\.|https?:\/\/|\.com\b|\.co\b/i;
const RE_CONTACTO = /\b(?:instagram|facebook|tiktok|whatsapp|wpp|telefono|tel|cel|celular|llamanos|escribenos|siguenos)\b/;
const RE_DOMICILIO = /\bdomicilios?\b/;
const DIAS = 'lunes|martes|miercoles|jueves|viernes|sabado|domingo';
const RE_HORARIO = new RegExp(
  `\\b(?:horario|abierto|abrimos|atendemos|atencion)\\b|\\b(?:${DIAS})s?\\s+(?:a|y|al)\\s+(?:${DIAS})s?\\b`,
);
const RE_HORA = /\b\d{1,2}(?::\d{2})?\s*[ap]\.?\s?m\b/i;
const RE_DIRECCION = /^(?:calle|cl|cll|carrera|cra|kra|kr|cr|avenida|av|diagonal|dg|transversal|tv|barrio|direccion|local)\s+\d/;
const RE_PLACA = /#\s*\d+\s*[a-z]?\s*-\s*\d+/i;
const RE_LEGAL = /\b(?:iva|propina|servicio voluntario|imagenes de referencia|sujeto a cambios?|precios en pesos)\b/;

/**
 * Por qué este renglón NO es un plato ni un título, o null si puede serlo.
 *
 * Lo que delata al teléfono y a las redes vale siempre: un número de celular
 * no se vende. Lo demás (horario, dirección, domicilio, IVA) solo cuando la
 * línea NO trae precio, porque «Almuerzo ejecutivo de lunes a viernes 15.000»
 * es un plato y perderlo es el error caro.
 */
export function motivoDeRuido(cruda: string, precios: number[]): string | null {
  const n = normalizado(cruda);
  if (traeTelefono(cruda)) return 'Es un teléfono.';
  if (RE_WEB.test(cruda) || RE_CONTACTO.test(n)) return 'Son redes o datos de contacto.';
  if (precios.length > 0) return null;
  if (RE_DIRECCION.test(n) || RE_PLACA.test(cruda)) return 'Es una dirección.';
  if (RE_HORARIO.test(n) || RE_HORA.test(cruda)) return 'Es el horario.';
  if (RE_DOMICILIO.test(n)) return 'Habla del domicilio, no de un plato.';
  if (RE_LEGAL.test(n)) return 'Es una nota de la carta (IVA, propina…).';
  return null;
}

// ── Cómo se llama cada precio ────────────────────────────────────────────────

/**
 * El ENCABEZADO de una tabla de precios: «Personal  Mediana  Grande  Familiar»,
 * o el título con los tamaños detrás («PIZZAS  Pers.  Med.  Gde.  Fam.»).
 *
 * Es la forma más común de imprimir una pizzería, y sin leerla cada pizza
 * llegaba con cuatro precios sin nombre —y el encabezado, como un plato sin
 * precio—. Se exigen DOS tamaños o más al final del renglón: «Salchipapa
 * mediana» sin precio es un plato al que el OCR le perdió el número.
 */
export function encabezadoDeTamanos(nombre: string): { titulo: string; tamanos: string[] } | null {
  const tokens = juntarMedidas(nombre).split(/[\s|/]+/).filter(Boolean);
  let corte = tokens.length;
  while (corte > 0 && esTokenDeTamano(tokens[corte - 1]!)) corte--;
  const tamanos = tokens.slice(corte);
  if (tamanos.length < 2) return null;
  const titulo = tokens.slice(0, corte).join(' ').replace(/[:\s]+$/, '');
  if (titulo && !(vaEnMayusculas(titulo) || suenaASeccion(titulo) || titulo.endsWith(':'))) {
    return null;
  }
  return {
    titulo,
    tamanos: tamanos.map((t) => tituloDeSeccion(t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}/]+$/gu, ''))),
  };
}

/**
 * «Jugo en agua / en leche 5.000 / 7.000»: el nombre ya dice cómo se llama
 * cada precio. Devuelve el plato y las opciones, o null si las partes no
 * cuadran con los precios.
 *
 * La segunda parte dice cuántas palabras lleva una opción («en leche» son
 * dos), y esas mismas se toman del final de la primera («Jugo en agua» →
 * «Jugo» + «en agua»). Si así no queda plato, se toma una sola palabra
 * («Limonada natural / de coco» → «Limonada» + «natural»).
 */
export function opcionesDelNombre(nombre: string, cuantas: number): { base: string; opciones: string[] } | null {
  const partes = nombre.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
  if (partes.length !== cuantas || cuantas < 2) return null;
  const primera = partes[0]!.split(/\s+/);
  const largo = partes[1]!.split(/\s+/).length;
  for (const k of [largo, 1]) {
    if (primera.length <= k) continue;
    const base = primera.slice(0, primera.length - k).join(' ');
    const opciones = [primera.slice(primera.length - k).join(' '), ...partes.slice(1)];
    if (base.length >= 2 && opciones.every((o) => o.length >= 1)) return { base, opciones };
  }
  return null;
}

/** «Personal $12.000, Mediana $22.000» o «$12.000 y $22.000». */
function avisoDePrecios(precios: number[], tamanos?: string[]): string {
  if (tamanos) {
    const pares = precios.map((p, i) => `${tamanos[i]} ${comoPesos(p)}`).join(', ');
    return `Viene en ${precios.length} tamaños (${pares}). Agrúpalos o deja uno.`;
  }
  return `Tiene ${precios.length} precios (${precios.map(comoPesos).join(' y ')}). `
    + 'Deja uno, o agrúpalos como tamaños del mismo plato.';
}

interface CartaSinRol {
  lineas: FilaSinRol[];
  secciones: string[];
  notas: NotaCarta[];
  ignoradas: RenglonIgnorado[];
}

type FilaSinRol = Omit<LineaCarta, 'rol' | 'motivoRol'> & {
  /** El rol lo decidió el PROPIO renglón («Acompañamientos: papa o arroz»). */
  rolForzado?: { rol: RolCarta; motivo: string };
};

function parsearSinRol(
  filas: Array<{ texto: string; grande?: boolean }>,
): CartaSinRol {
  const salida: CartaSinRol = { lineas: [], secciones: [], notas: [], ignoradas: [] };
  let seccion = '';
  // El encabezado de la tabla de precios vigente («Personal Mediana Grande»):
  // vale hasta el siguiente título.
  let tamanosVigentes: string[] | null = null;
  // Lo último que se escribió, para pegarle el renglón que lo continúa. Un
  // renglón en blanco o un título lo cortan: separan bloques.
  let ultimo: { tipo: 'plato' | 'nota'; i: number } | null = null;

  for (let i = 0; i < filas.length; i++) {
    const cruda = filas[i]!.texto.replace(/\s{2,}/g, ' ').trim();
    if (!cruda) { ultimo = null; continue; }
    const grande = filas[i]!.grande;

    const precios = preciosDeLinea(cruda);
    const nombre = nombreDeLinea(cruda);
    const linea = i + 1;

    // 0. LO QUE NO ES DE LA CARTA: teléfono, redes, dirección, horario. Antes
    // salían como platos sin precio, o como SECCIONES —y todo lo de debajo
    // quedaba bajo un título «Domicilios 300 123 4567»—.
    const ruido = motivoDeRuido(cruda, precios);
    if (ruido) {
      salida.ignoradas.push({ linea, texto: cruda, motivo: ruido });
      ultimo = null;
      continue;
    }

    if (precios.length === 0) {
      // 0b. EL ENCABEZADO DE UNA TABLA DE PRECIOS. No es un plato: dice cómo
      // se llaman los precios de las filas que vienen debajo.
      const encabezado = grande !== false ? encabezadoDeTamanos(nombre) : null;
      if (encabezado) {
        if (encabezado.titulo) {
          seccion = tituloDeSeccion(encabezado.titulo);
          if (!salida.secciones.includes(seccion)) salida.secciones.push(seccion);
        }
        tamanosVigentes = encabezado.tamanos;
        ultimo = null;
        continue;
      }

      // 1. EL RENGLÓN QUE CONTINÚA AL DE ARRIBA. La carta parte los
      // ingredientes —y las notas— en dos renglones, y el segundo empieza en
      // minúscula o con una coma: «frescos, porción de papa a la francesa».
      // Suelto, eso era una fila sin precio con un nombre que no es de nada.
      if (ultimo && grande !== true && (
        continuaAlDeArriba(cruda) || ingredientesDelDeArriba(cruda, ultimo, salida.lineas)
      )) {
        const resto = cruda.replace(/^[,;\s]+/, '');
        if (ultimo.tipo === 'nota') {
          const n = salida.notas[ultimo.i]!;
          n.texto = unirTexto(n.texto, resto);
          continue;
        }
        const plato = salida.lineas[ultimo.i]!;
        if (tienePrecio(plato)) {
          plato.descripcion = unirTexto(plato.descripcion ?? '', resto.replace(/^\(|\)$/g, ''));
          continue;
        }
      }

      // 2. UNA LISTA PARA ESCOGER escrita en un renglón: «Acompañamientos:
      // papa a la francesa, patacón o arroz». Cada opción sale como fila de
      // guarnición, en la sección donde estaba la lista.
      const lista = listaParaElegir(cruda);
      if (lista) {
        for (const opcion of lista.opciones) {
          salida.lineas.push({
            linea, nombre: opcion, precio: null, seccion,
            rolForzado: {
              rol: 'guarnicion',
              motivo: `La carta dice «${lista.grupo}»: el cliente escoge una con su plato.`,
            },
          });
        }
        ultimo = null;
        continue;
      }

      // 3. LOS INGREDIENTES DEL PLATO DE ARRIBA, en el renglón de debajo. Es
      // la forma más común de una carta impresa y la lista con comas que ya
      // recogía el paso 1 es solo uno de sus casos: «Carne de res 150 g con
      // queso y vegetales», «Acompañada de papa a la francesa y ensalada» o
      // «Incluye papa y gaseosa» también son de ESE plato. Antes de esto los
      // dos últimos caían en la nota de la sección —se le pegaban a TODOS los
      // platos— y el primero salía como una fila sin precio.
      if (ultimo && grande !== true && descripcionDelDeArriba(cruda, ultimo, salida.lineas, grande)) {
        const plato = salida.lineas[ultimo.i]!;
        plato.descripcion = unirTexto('', cruda.replace(/^\(|\)$/g, ''));
        continue;
      }

      // 4. LO QUE INCLUYEN LOS PLATOS: va a su descripción, no es un plato.
      const nota = notaDeInclusion(cruda);
      if (nota) {
        salida.notas.push({ linea, seccion, texto: nota });
        ultimo = { tipo: 'nota', i: salida.notas.length - 1 };
        continue;
      }

      // La decisión de si es un encabezado se toma con el nombre COMPLETO:
      // «Al gusto: 3 huevos pochados» separado dejaría «Al gusto», que es
      // corto y sin puntuación, o sea que pasaría por título de sección y se
      // llevaría por delante todos los platos que vienen debajo.
      //
      // DENTRO de una sección de guarniciones la longitud deja de ser pista:
      // «Papa criolla» y «Yuca frita» son cortas, sin precio y sin puntuación,
      // o sea exactamente un título — y cada opción se habría convertido en
      // una sección vacía. Ahí solo cuentan las pistas fuertes.
      const debil = !seccionDeGuarnicion(seccion);
      if (pareceSeccion(nombre, grande, debil)) {
        tamanosVigentes = null;
        seccion = tituloDeSeccion(nombre.replace(/\s*:\s*$/, ''));
        if (!salida.secciones.includes(seccion)) salida.secciones.push(seccion);
        ultimo = null;
        continue;
      }
      salida.lineas.push({
        linea, ...separarDescripcion(nombre), precio: null, seccion,
        aviso: 'No le encontramos precio. Escríbelo o borra la fila.',
      });
      ultimo = null;
      continue;
    }

    if (!nombre || nombre.length < 2) {
      salida.lineas.push({
        linea, nombre: cruda, precio: null, seccion,
        aviso: 'No pudimos separar el nombre del precio en esta línea.',
      });
      ultimo = null;
      continue;
    }

    if (precios.length > 1) {
      // Elegir uno por nuestra cuenta es justo el error caro: con «5.000 /
      // 7.000» quedarse con el primero vende barato el familiar y con el
      // último cobra de más el personal. Se deja vacío y se dice lo que hay —
      // con el nombre de cada precio cuando la carta lo da—.
      const delNombre = opcionesDelNombre(nombre, precios.length);
      const tamanos = tamanosVigentes?.length === precios.length
        ? tamanosVigentes
        : delNombre?.opciones;
      const plato = separarDescripcion(delNombre && tamanos === delNombre.opciones ? delNombre.base : nombre);
      salida.lineas.push({
        linea, ...plato, precio: null, seccion, precios,
        ...(tamanos ? { tamanos: [...tamanos] } : {}),
        aviso: avisoDePrecios(precios, tamanos),
      });
      // Los ingredientes del renglón de abajo también son de ESTE plato.
      ultimo = { tipo: 'plato', i: salida.lineas.length - 1 };
      continue;
    }

    salida.lineas.push({ linea, ...separarDescripcion(nombre), precio: precios[0]!, seccion });
    ultimo = { tipo: 'plato', i: salida.lineas.length - 1 };
  }

  return salida;
}

/**
 * El plato de arriba tiene precio: uno, o varios tamaños. Una pizza con sus
 * cuatro precios es tan plato como una con uno, y sus ingredientes del
 * renglón de abajo son suyos.
 */
function tienePrecio(plato: { precio: number | null; precios?: number[] }): boolean {
  return plato.precio != null || (plato.precios?.length ?? 0) > 1;
}

/** Largo máximo de una descripción armada con renglones de la carta. */
const DESCRIPCION_MAX = 300;

function unirTexto(base: string, mas: string): string {
  const junto = (base ? `${base.trim()} ${mas.trim()}` : mas.trim())
    .replace(/\s+([,;.])/g, '$1')
    .replace(/\s{2,}/g, ' ');
  return junto.length > DESCRIPCION_MAX ? junto.slice(0, DESCRIPCION_MAX).trim() : junto;
}

/**
 * ¿El renglón sigue al de arriba en vez de empezar algo nuevo?
 *
 * Empieza en MINÚSCULA, o con una coma o un paréntesis. En una carta un plato,
 * un título o una nota empiezan en mayúscula; lo que arranca en minúscula es
 * la segunda mitad de algo que no cupo en un renglón.
 */
export function continuaAlDeArriba(texto: string): boolean {
  const t = texto.trim();
  if (/^[,;(]/.test(t)) return true;
  // La PRIMERA letra del renglón, no la primera que aparezca: «3 huevos
  // pochados» empieza por un número y es un plato, no una continuación.
  const primera = t.charAt(0);
  return /\p{L}/u.test(primera) && primera === primera.toLowerCase() && primera !== primera.toUpperCase();
}

/**
 * Los ingredientes escritos en el renglón de DEBAJO del plato, con mayúscula:
 *
 *     Sandwich criollo        19.000
 *     Pan argentino, jamón, queso
 *
 * Se exige una lista (lleva coma) y que el plato de arriba tenga precio y aún
 * no tenga descripción: así un segundo renglón suelto no se pega en cadena.
 * Lo que se arriesga —un plato al que el OCR le perdió el precio quedando como
 * descripción del de arriba— se ve en la vista previa, en el campo de
 * ingredientes del plato, que es donde el dueño mira.
 */
function ingredientesDelDeArriba(
  texto: string,
  ultimo: { tipo: 'plato' | 'nota'; i: number },
  lineas: ReadonlyArray<{ precio: number | null; descripcion?: string }>,
): boolean {
  if (ultimo.tipo !== 'plato') return false;
  const plato = lineas[ultimo.i];
  if (!plato || !tienePrecio(plato) || plato.descripcion) return false;
  return texto.includes(',') && !texto.includes(':') && !/[.;]\s*\S/.test(texto);
}

/**
 * Lo que habla de TODA la sección y no de un plato: «Todos nuestros
 * sándwiches…», «Todas las carnes…», «Cada plato…». Eso es una nota aunque
 * caiga justo debajo de un plato.
 */
function hablaDeLaSeccion(texto: string): boolean {
  return /^(todos|todas|todo|toda|nuestros|nuestras|cada|aplica|nota)\b/.test(normalizado(texto));
}

/**
 * ¿Este renglón SIN precio es la descripción del plato de arriba?
 *
 * Solo se pregunta cuando el de arriba es un plato CON precio y aún sin
 * descripción —así un renglón no se pega en cadena— y el renglón no va
 * escrito más grande (eso lo filtra quien llama).
 *
 * Lo que lo impide es que parezca OTRA COSA, de la pista más fuerte a la débil:
 *
 *   1. Que hable de toda la sección («Todos nuestros…»): es una nota.
 *   2. Que sea un título: GRITADO y corto, acabado en dos puntos, o que
 *      empiece por el nombre en plural de una sección («Bebidas calientes»).
 *      Con la geometría leída esto ya lo dijo el tamaño de la letra, así que
 *      solo cuenta en el texto plano.
 *   3. Que sea el SIGUIENTE plato al que el OCR le perdió el precio. Se
 *      reconoce porque empieza igual que el de arriba («Hamburguesa sencilla»
 *      y debajo «Hamburguesa doble»), o porque es demasiado corto para ser una
 *      lista de ingredientes (menos de tres palabras y sin comas).
 *
 * Lo que se arriesga —un plato sin precio convertido en descripción— se ve en
 * la vista previa, en el campo de ingredientes del plato de arriba.
 */
function descripcionDelDeArriba(
  texto: string,
  ultimo: { tipo: 'plato' | 'nota'; i: number },
  lineas: ReadonlyArray<{ nombre: string; precio: number | null; descripcion?: string }>,
  grande?: boolean,
): boolean {
  if (ultimo.tipo !== 'plato') return false;
  const plato = lineas[ultimo.i];
  if (!plato || !tienePrecio(plato) || plato.descripcion) return false;
  const t = texto.trim();
  if (hablaDeLaSeccion(t)) return false;

  if (grande !== false) {
    const sinDosPuntos = t.replace(/\s*:\s*$/, '');
    if (t.endsWith(':')) return false;
    if (vaEnMayusculas(sinDosPuntos) && sinDosPuntos.split(/\s+/).length <= 6) return false;
    const primera = normalizado(sinDosPuntos).split(' ')[0] ?? '';
    if (!t.includes(',') && PALABRAS_DE_SECCION.includes(primera) && /s$/.test(primera)) return false;
  }

  const palabras = normalizado(t).split(' ').filter(Boolean);
  const delPlato = normalizado(plato.nombre).split(' ').filter(Boolean);
  if (!t.includes(',') && palabras[0] === delPlato[0] && pareceOtroPlato(t, plato.nombre, palabras, delPlato)) {
    return false;
  }
  if (!t.includes(',') && palabras.length < 3) return false;
  return true;
}

/**
 * Los verbos con que una carta describe cómo se hace o se sirve un plato.
 * Sin tildes ni eñe: se prueban sobre el texto `normalizado`.
 */
const VERBO_PREPARACION = /\b(preparad[oa]s?|elaborad[oa]s?|hech[oa]s?|banad[oa]s?|servid[oa]s?|acompanad[oa]s?|gratinad[oa]s?|saltead[oa]s?|marinad[oa]s?|cocinad[oa]s?|asad[oa]s? (a|al|en|con)|hornead[oa]s?|apanad[oa]s?|rellen[oa]s? (de|con)|trae|incluye)\b/;

/**
 * Un renglón que EMPIEZA como el plato de arriba, ¿es el siguiente plato
 * (al que el OCR le perdió el precio) o la descripción del de arriba?
 *
 * «ARROZ CON CAMARONES 59.000» y debajo «Arroz de la casa preparado con
 * vegetales y camarones» es una descripción: es la forma en que la carta
 * explica el plato, y casi siempre repite su primera palabra. Rechazarla por
 * empezar igual la convertía en una fila sin precio y dejaba al plato sin
 * ingredientes — el reporte del 20 de octubre.
 *
 * Es otro plato solo si tiene la MISMA FORMA que el de arriba. Lo que la
 * delata como descripción, cualquiera de las tres:
 *   - va escrita distinto: la carta escribe TODOS sus nombres igual, así que
 *     un nombre gritado con un renglón en minúsculas debajo es su texto;
 *   - es bastante más larga que el nombre (tres palabras o más);
 *   - dice cómo se hace o se sirve («preparado», «bañado», «acompañado»…).
 */
function pareceOtroPlato(texto: string, nombrePlato: string, palabras: string[], delPlato: string[]): boolean {
  if (vaEnMayusculas(texto) !== vaEnMayusculas(nombrePlato)) return false;
  if (palabras.length >= delPlato.length + 3) return false;
  if (VERBO_PREPARACION.test(normalizado(texto))) return false;
  return true;
}

/** Las palabras que nombran lo que viene con el plato. */
const NOMBRE_GUARNICION = /^(acompa[nñ]amientos?|acompa[nñ]antes?|guarnici[oó]n(es)?|contornos?|principios?)$/i;

/** El verbo con el que una carta pide escoger. */
const VERBO_ELEGIR = /^(escoge|escoja|escojan|elige|elija|elijan|selecciona|seleccione)$/i;

/** Parte «papa a la francesa, patacón o arroz» en sus opciones. */
function opcionesDeLista(texto: string): string[] | null {
  const partes = texto
    .replace(/[.;]+\s*$/, '')
    .split(/\s*,\s*|\s*;\s*|\s*\/\s*|\s+o\s+|\s+u\s+/i)
    .map((p) => p.replace(/^(y|o|u)\s+/i, '').trim())
    .filter(Boolean);
  // Una opción larga es prosa, no una opción: «Papa a la francesa con salsa
  // de la casa y queso gratinado» no la escoge nadie de una lista.
  if (partes.length < 2 || partes.some((p) => p.length > 40 || preciosDeLinea(p).length > 0)) return null;
  return partes.map((p) => p.charAt(0).toUpperCase() + p.slice(1));
}

/**
 * Un renglón que es una LISTA PARA ESCOGER. Las tres formas en que se escribe
 * en una carta de aquí:
 *
 *   «Acompañamientos: papa a la francesa, patacón o arroz»
 *   «Escoge tu acompañamiento: papa, yuca o arroz» (y «Elige tu proteína: …»)
 *   «Acompañado de papa a la francesa o patacón»
 *
 * La última es la sutil: «acompañado de papa O patacón» es escoger, pero
 * «acompañado de papa Y ensalada» es lo que trae — eso es una nota, no una
 * lista. Por eso esa forma exige una «o».
 *
 * Con una sola opción no hay nada que escoger: es lo que trae, y lo recoge
 * `notaDeInclusion`.
 */
export function listaParaElegir(texto: string): { grupo: string; opciones: string[] } | null {
  const t = texto.trim();
  const conDosPuntos = t.match(/^([^:]{3,40}?)\s*:\s*(.+)$/);
  if (conDosPuntos) {
    const cabeza = conDosPuntos[1]!.trim().split(/\s+/);
    const verbo = VERBO_ELEGIR.test(cabeza[0] ?? '');
    const sustantivos = cabeza
      .slice(verbo ? 1 : 0)
      .filter((p) => !/^(tu|su|tus|sus|el|la|los|las|un|una|entre|a|para|de)$/i.test(p))
      .filter((p) => !/^(elegir|escoger|elecci[oó]n)$/i.test(p));
    const nombraGuarnicion = sustantivos.some((p) => NOMBRE_GUARNICION.test(p));
    if ((verbo && sustantivos.length > 0 && sustantivos.length <= 3) || (nombraGuarnicion && sustantivos.length <= 3)) {
      const opciones = opcionesDeLista(conDosPuntos[2]!);
      if (!opciones) return null;
      const grupo = nombraGuarnicion
        ? 'Acompañamiento'
        : sustantivos.join(' ').charAt(0).toUpperCase() + sustantivos.join(' ').slice(1).toLowerCase();
      return { grupo, opciones };
    }
    return null;
  }

  // «Escoge entre papa, yuca o arroz», sin dos puntos.
  const verboSuelto = t.match(/^(?:escoge|escoja|elige|elija)\s+(?:entre\s+)?(.+)$/i);
  if (verboSuelto) {
    const opciones = opcionesDeLista(verboSuelto[1]!);
    return opciones ? { grupo: 'Acompañamiento', opciones } : null;
  }

  // «… acompañado de papa a la francesa o patacón».
  const acompanado = t.match(/\b(?:acompa[nñ]ad[oa]s?|servid[oa]s?)\s+(?:con|de)\s+(.+)$/i);
  if (acompanado && /\s(o|u)\s/i.test(acompanado[1]!)) {
    const opciones = opcionesDeLista(acompanado[1]!);
    return opciones ? { grupo: 'Acompañamiento', opciones } : null;
  }
  return null;
}

/**
 * Un renglón que dice lo que TRAEN los platos, ya redactado para su
 * descripción. `null` si no lo es.
 *
 * «Todos nuestros sándwiches van acompañados de vegetales frescos, porción de
 * papa a la francesa» → «Acompañado de vegetales frescos, porción de papa a la
 * francesa». Se le quita el «todos nuestros sándwiches van», que en la ficha
 * de UN sándwich sobra.
 */
export function notaDeInclusion(texto: string): string | null {
  const t = texto.trim().replace(/\s{2,}/g, ' ');
  if (t.length < 8 || t.split(' ').length < 2) return null;
  const n = normalizado(t);
  const empieza = /^(todos|todas|nuestros|nuestras|incluye|incluyen|viene|vienen|acompanad|servid|con )/.test(n);
  const primeras = n.split(' ').slice(0, 8).join(' ');
  const menciona = /\b(acompanad[oa]s?|incluyen?|vienen? con|van con|servid[oa]s? con)\b/.test(primeras);
  if (!empieza && !menciona) return null;

  // Desde el verbo que dice qué trae: lo de antes («Todos nuestros
  // sándwiches van») es de toda la sección y en la ficha de UN plato sobra.
  const desde = t.search(/\b(acompa[nñ]ad[oa]s?|incluyen?|vienen?\s+con|servid[oa]s?\s+con)\b/i);
  let nota = desde > 0 ? t.slice(desde) : t;
  nota = nota
    .replace(/^acompa([nñ])ad([oa])s\b/i, 'acompa$1ad$2')
    .replace(/^servid([oa])s\b/i, 'servid$1')
    .replace(/^incluyen\b/i, 'incluye')
    .replace(/^vienen\b/i, 'viene')
    .replace(/[.;]+\s*$/, '')
    .trim();
  if (!nota) return null;
  return nota.charAt(0).toUpperCase() + nota.slice(1);
}

/** Cada fila con el rol que se le propone. Va aparte para no tocar los cinco `push`. */
function conRol(carta: CartaSinRol): CartaLeida {
  return {
    secciones: carta.secciones,
    notas: carta.notas,
    ignoradas: carta.ignoradas,
    lineas: carta.lineas.map(({ rolForzado, ...l }) => {
      const { rol, motivo } = rolForzado
        ?? rolDeLinea({ nombre: l.nombre, seccion: l.seccion, precio: l.precio });
      // Una guarnición SIN precio no es una fila incompleta: viene incluida.
      // El aviso de «no le encontramos precio» la habría pintado en ámbar y
      // dejado fuera de la creación.
      const aviso = rol === 'guarnicion' && l.precio == null && !l.precios ? undefined : l.aviso;
      const { aviso: _quitado, ...resto } = l;
      void _quitado;
      return {
        ...resto,
        ...(aviso ? { aviso } : {}),
        rol,
        ...(motivo ? { motivoRol: motivo } : {}),
      };
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
