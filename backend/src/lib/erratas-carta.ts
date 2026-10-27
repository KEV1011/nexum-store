// ── Erratas de la carta: «Hamburgesa» → «Hamburguesa» ────────────────────────
//
// POR QUÉ EXISTE. Entre el dueño que escribió la carta y el OCR que la leyó, un
// plato llega a la vista previa como «Hamburgesa doble» o «Arepa rellana». Si
// se publica así, el cliente que escribe «hamburguesa» en el buscador no la
// encuentra, y el local se ve descuidado. El revisor con IA ya podía corregirlo
// (`carta-ia`, acción `nombre`), pero solo con la IA encendida y pagando cada
// revisión; esto cubre lo común sin ella.
//
// LAS REGLAS QUE IMPIDEN QUE «CORRIJA» LO QUE ESTÁ BIEN:
//
//   1. Solo se corrige HACIA un vocabulario CERRADO de palabras de carta. Un
//      nombre de fantasía («La Bestia», «Pechugón») no está ni cerca de
//      ninguna y no se toca.
//   2. Solo hacia palabras de 7 letras o más (ver `LARGO_MIN_DESTINO`), y a
//      UNA edición de distancia (dos, si la palabra mide 10 o más). Más lejos
//      ya no es una errata, es otra palabra.
//   3. Tiene que haber UN solo candidato a esa distancia. Con dos, no hay
//      forma de saber cuál quiso escribir.
//   4. Una palabra que YA es conocida —incluidos su plural y su otro género—
//      no se toca: «Ranchero» no se vuelve «Ranchera».
//   5. Las tildes no cuentan como errata: «Chicharron» no se reescribe. Se
//      compara sin ellas.
//
// Y la corrección se DICE: la fila queda con su aviso para que el dueño la
// vea, igual que todo lo que propone el lector.

/** Las palabras de una carta colombiana a las que se corrige. */
const VOCABULARIO = [
  // Platos
  'hamburguesa', 'salchipapa', 'choripapa', 'salchipollo', 'perro', 'caliente',
  'pizza', 'empanada', 'arepa', 'sandwich', 'sanduche', 'ensalada', 'picada',
  'bandeja', 'sancocho', 'ajiaco', 'mondongo', 'frijolada', 'cazuela', 'ceviche',
  'mojarra', 'trucha', 'salmon', 'camarones', 'langostinos', 'mariscos',
  'churrasco', 'solomito', 'sobrebarriga', 'costilla', 'chuleta', 'lomo',
  'pechuga', 'alitas', 'nuggets', 'broaster', 'mazorcada', 'patacon', 'patacones',
  'lasagna', 'lasaña', 'espagueti', 'quesadilla', 'burrito', 'nachos', 'tacos',
  'desayuno', 'calentado', 'almuerzo', 'ejecutivo', 'corrientazo', 'tamal',
  'brownie', 'malteada', 'limonada', 'gaseosa', 'cerveza', 'michelada',
  'capuchino', 'aromatica', 'chocolate', 'buñuelo', 'pandebono', 'almojabana',
  'croissant', 'waffle', 'cheesecake', 'postre', 'helado', 'granizado', 'jugos',
  // Lo que traen
  'queso', 'tocineta', 'jamon', 'champiñones', 'chicharron', 'chorizo', 'morcilla',
  'aguacate', 'guacamole', 'lechuga', 'tomate', 'cebolla', 'pepinillos',
  'mayonesa', 'mostaza', 'salsa', 'piña', 'maduro', 'frijoles', 'arroz',
  'huevo', 'huevos', 'papas', 'francesa', 'criolla', 'mozzarella', 'cheddar',
  'pepperoni', 'hawaiana', 'vegetariana', 'mexicana', 'ranchera', 'americana',
  'suiza', 'italiana', 'carbonara', 'boloñesa', 'napolitana', 'tropical',
  'caramelizada', 'gratinada', 'gratinado', 'desmechada', 'desmechado',
  'apanada', 'apanado', 'asada', 'asado', 'frita', 'frito', 'plancha',
  'parrilla', 'horno', 'natural', 'leche', 'fresa', 'fresca', 'maracuya',
  'guanabana', 'lulo', 'mango', 'limon', 'naranja', 'panela', 'coco',
  // Cómo se describe
  'especial', 'especiales', 'rellena', 'relleno', 'sencilla', 'sencillo',
  'doble', 'triple', 'personal', 'mediana', 'mediano', 'grande', 'familiar',
  'porcion', 'adicion', 'adicional', 'adicionales', 'combo', 'combos',
  'bebidas', 'entradas', 'fuertes', 'platos', 'acompañamientos', 'acompañamiento',
  'casa', 'mixta', 'mixto', 'tradicional', 'clasica', 'clasico',
];

/** Palabras conocidas que NO son destino de corrección: solo evitan tocarlas. */
const CONOCIDAS_EXTRA = [
  'nuestra', 'nuestro', 'nuestras', 'nuestros', 'todos', 'todas', 'incluye',
  'incluyen', 'acompañado', 'acompañada', 'servido', 'servida', 'sabor',
  'sabores', 'extra', 'opcion', 'opciones', 'precio', 'unidad', 'unidades',
  'salsas', 'pollo', 'carne', 'cerdo', 'pescado', 'fresco', 'frescos', 'picante',
  'pastor', 'paisa', 'costeña', 'costeño', 'criollo', 'burguer', 'burger',
  'frances', 'personas', 'frutas', 'frias', 'frios', 'calientes', 'helada',
  'castilla', 'familia', 'ensalado', 'bebida',
  // PALABRAS DE VERDAD QUE ESTÁN A UNA LETRA DE OTRA DEL VOCABULARIO. Sin
  // ellas se «corregían»: «Michelada de cereza» salía «de cerveza», «maracuyá
  // salteada» salía «malteada». No son destino de corrección; solo se dejan en
  // paz. Lo que sigue es vocabulario de cocina y bar colombiano.
  //  · Frutas y verduras
  'cereza', 'cerezas', 'fresas', 'mora', 'moras', 'uva', 'uvas', 'pera', 'manzana',
  'banano', 'banana', 'platano', 'papaya', 'patilla', 'sandia', 'melon', 'kiwi',
  'durazno', 'mandarina', 'toronja', 'pomelo', 'lima', 'feijoa',   'curuba', 'uchuva', 'granadilla', 'pitahaya', 'borojo', 'zapote', 'mamoncillo',
  'tamarindo', 'arandano', 'arandanos', 'frambuesa', 'frambuesas',   'biche', 'aguacates', 'pepino', 'zanahoria', 'remolacha', 'brocoli', 'espinaca',
  'apio', 'cilantro', 'perejil', 'albahaca', 'oregano', 'romero', 'tomillo', 'laurel',
  'hierbabuena', 'yerbabuena', 'menta', 'jengibre', 'ajo', 'cebollin', 'pimenton',
  'jalapeno', 'jalapenos', 'aji', 'champinon', 'hongos', 'maiz', 'mazorca', 'arveja',
  'arvejas', 'habichuela', 'lenteja', 'lentejas', 'garbanzo', 'garbanzos', 'yuca',
  'papa', 'arracacha', 'ahuyama', 'calabacin', 'berenjena', 'repollo', 'rugula',
  //  · Cómo se prepara
  'salteada', 'salteado', 'salteadas', 'salteados', 'macerada', 'macerado',
  'maceradas', 'macerados', 'marinada', 'marinado', 'horneada', 'horneado',
  'ahumada', 'ahumado', 'glaseada', 'glaseado', 'caramelo', 'escarchada',
  'escarchado', 'flambeada', 'guisada', 'guisado', 'sudada', 'sudado', 'cocida',
  'cocido', 'hervida', 'hervido', 'tostada', 'tostado', 'tostadas', 'crocante',
  'crocantes', 'crujiente', 'crujientes', 'picada', 'picado', 'molida', 'molido',
  'rallada', 'rallado', 'batida', 'batido', 'licuada', 'licuado', 'frappe',
  'granizada', 'helados', 'congelada', 'congelado', 'escarchar', 'reduccion',
  'gratinar', 'banada', 'banado', 'rellenas', 'rellenos', 'apanadas', 'apanados',
  'sofrito', 'hogao', 'guiso', 'adobo', 'adobada', 'adobado', 'aliñada', 'alinada',
  //  · Bebidas y bar
  'cervezas', 'michelada', 'micheladas', 'coctel', 'cocteles', 'shot', 'shots',
  'tequila', 'aguardiente', 'ron', 'ginebra', 'whisky', 'vodka', 'brandy', 'vino',
  'vinos', 'sangria', 'mojito', 'margarita', 'colada', 'soda',
  'sodas', 'tonica', 'agua', 'aguas', 'hielo', 'escarcha', 'tajin', 'chamoy',
  'sal', 'azucar', 'zumo', 'sirope', 'jarabe', 'miel', 'canela', 'clavos', 'anis',
  'cafe', 'tinto', 'perico', 'latte', 'moca', 'mocaccino', 'expreso', 'espresso',
  'americano', 'aromatica', 'aromaticas', 'te', 'infusion', 'kumis', 'yogur',
  'yogurt', 'avena', 'chicha', 'masato', 'refajo', 'pony', 'malta', 'cola',
  //  · Carnes, quesos y demás
  'res', 'ternera', 'cordero', 'conejo', 'pavo', 'atun', 'tilapia', 'bagre',
  'robalo', 'pargo', 'calamar', 'calamares', 'pulpo', 'mejillones', 'almejas',
  'langosta', 'cangrejo', 'jaiba', 'tocino', 'salchicha', 'salchichas', 'butifarra',
  'longaniza', 'chicharrones', 'costillas', 'anca', 'cadera',
  'lomito', 'filete', 'medallones', 'milanesa', 'gordon', 'bleu', 'parmesano',
  'costeno', 'campesino', 'cuajada', 'quesillo', 'requeson', 'crema', 'nata',
  'mantequilla', 'arequipe', 'bocadillo', 'guayaba', 'nueces',
  'almendras', 'mani', 'pasas', 'chips', 'galleta', 'galletas', 'oreo', 'nutella',
  'pan', 'panes', 'tortilla', 'tortillas', 'arepas', 'masa', 'hojaldre', 'pasta',
  'pastas', 'fideos', 'sopa', 'consome', 'caldo', 'pollos', 'carnes',
];

function sinTildes(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Plural y el otro género: «ranchera» conoce «rancheras», «ranchero». */
function formas(palabra: string): string[] {
  const p = sinTildes(palabra);
  const salida = [p, `${p}s`, `${p}es`];
  if (/[ao]$/.test(p)) {
    const otro = p.slice(0, -1) + (p.endsWith('a') ? 'o' : 'a');
    salida.push(otro, `${otro}s`);
  }
  if (p.endsWith('s')) salida.push(p.slice(0, -1));
  if (p.endsWith('es')) salida.push(p.slice(0, -2));
  return salida;
}

/** El plural de una palabra del vocabulario, para que «Hamburgesas» no pierda la «s». */
function plural(v: string): string {
  if (/s$/.test(v)) return v;
  return /[aeiouáéíóú]$/.test(v) ? `${v}s` : `${v}es`;
}

/**
 * Solo se corrige HACIA palabras largas. Las cortas tienen vecinas que también
 * son palabras: «frías» está a una letra de «fritas» y «frutas» a una de
 * «fritas»; corregir hacia «fritas» cambiaba lo que la carta decía. Con siete
 * letras o más («rellena», «pechuga», «hamburguesa») la vecina a una letra
 * casi nunca es otra palabra de verdad. Las cortas siguen sirviendo para
 * reconocer lo que ya está bien escrito.
 */
const LARGO_MIN_DESTINO = 7;

const DESTINOS = [...new Set(VOCABULARIO.flatMap((v) => [v, plural(v)]))]
  .map((v) => ({ escrita: v, comparable: sinTildes(v) }))
  .filter((v) => v.comparable.length >= LARGO_MIN_DESTINO);
const CONOCIDAS = new Set([...VOCABULARIO, ...CONOCIDAS_EXTRA].flatMap(formas));

/** Distancia de edición con transposición («especail» → «especial» es 1). */
export function distanciaDeEdicion(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
    }
  }
  return d[m]![n]!;
}

/** La palabra del vocabulario que quiso escribir, o null. */
export function correccionDePalabra(palabra: string): string | null {
  const comparable = sinTildes(palabra);
  if (comparable.length < LARGO_MIN_DESTINO - 1 || !/^[a-zñ]+$/.test(comparable)) return null;
  if (CONOCIDAS.has(comparable)) return null;
  const tope = comparable.length >= 10 ? 2 : 1;
  let mejor: { escrita: string; d: number } | null = null;
  let empate = false;
  for (const v of DESTINOS) {
    if (Math.abs(v.comparable.length - comparable.length) > tope) continue;
    const d = distanciaDeEdicion(comparable, v.comparable);
    if (d === 0 || d > tope) continue;
    if (!mejor || d < mejor.d) { mejor = { escrita: v.escrita, d }; empate = false; }
    else if (d === mejor.d && v.escrita !== mejor.escrita) empate = true;
  }
  return mejor && !empate ? mejor.escrita : null;
}

/** Escribe `nueva` con las mayúsculas que tenía `original`. */
function conMayusculasDe(original: string, nueva: string): string {
  if (original === original.toUpperCase()) return nueva.toUpperCase();
  if (original.charAt(0) === original.charAt(0).toUpperCase()) {
    return nueva.charAt(0).toUpperCase() + nueva.slice(1);
  }
  return nueva;
}

export interface Errata {
  de: string;
  a: string;
}

export interface OpcionesErratas {
  /**
   * Solo se corrigen estas palabras (sin tildes, en minúscula): las que el OCR
   * leyó con DUDA. Una palabra leída con seguridad está escrita así en la
   * carta, y «corregirla» es cambiarle el plato. Ausente = no se sabe la
   * confianza, y se corrige con el vocabulario como siempre.
   */
  soloEstas?: Set<string>;
}

/** El texto con las erratas corregidas, y cuáles fueron. */
export function corregirErratas(
  texto: string,
  opciones?: OpcionesErratas,
): { texto: string; erratas: Errata[] } {
  const erratas: Errata[] = [];
  const corregido = texto.replace(/\p{L}+/gu, (palabra) => {
    if (opciones?.soloEstas && !opciones.soloEstas.has(sinTildes(palabra))) return palabra;
    const a = correccionDePalabra(palabra);
    if (!a) return palabra;
    const escrita = conMayusculasDe(palabra, a);
    erratas.push({ de: palabra, a: escrita });
    return escrita;
  });
  return { texto: corregido, erratas };
}

/** El aviso para el dueño: «Corregimos «Hamburgesa» por «Hamburguesa».» */
export function avisoDeErratas(erratas: Errata[]): string {
  const pares = erratas.map((e) => `«${e.de}» por «${e.a}»`).join(', ');
  return `Corregimos ${pares}. Revisa que esté bien.`;
}
