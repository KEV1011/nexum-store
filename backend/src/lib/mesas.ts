// ── Mesas del local y el código público de la carta ──────────────────────────
//
// POR QUÉ EXISTE. El pedido a domicilio ya funciona, pero dentro del
// restaurante la cuenta es distinta: el comensal está sentado, no hay
// repartidor, no hay dirección y no hay nada que cobrar por llevarlo. Lo único
// que la cocina necesita saber es **a qué mesa** va el plato.
//
// EL CÓDIGO DE LA CARTA NO ES EL TOKEN DEL DUEÑO. `Business.token` abre el
// portal: catálogo, pedidos, precios, portada, ajustes. Imprimirlo en un
// individual de mesa sería entregarle la administración del local a cualquiera
// que se siente a almorzar. `menuCode` es otra cosa y solo abre la carta.
//
// UNA MESA QUE EL DUEÑO NO DECLARÓ NO PUEDE PEDIR. Es la guarda que sostiene
// todo lo demás: sin ella basta cambiar `?mesa=5` por `?mesa=99` en un local de
// ocho mesas para meterle a la cocina un plato que nadie sabe a dónde llevar.

/** Tope de cordura de mesas por local. Más que esto es un estadio, no un local. */
export const MESAS_MAX = 80;

/**
 * Largo máximo de la etiqueta de una mesa.
 *
 * No es un capricho: la etiqueta se imprime en el individual de la mesa y se
 * lee en la tarjeta de la cocina, donde tiene que caber de un vistazo. «Mesa de
 * la ventana junto a la entrada» no se lee en una comanda.
 */
export const ETIQUETA_MAX = 14;

/**
 * Forma comparable de una etiqueta: sin tildes, en minúsculas y sin espacios
 * repetidos.
 *
 * Se usa SOLO para comparar, nunca para guardar: si el dueño pintó «Terraza 1»
 * en la mesa, la comanda tiene que decir «Terraza 1».
 */
export function normalizaEtiqueta(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Valida y limpia el catálogo de mesas que declara el dueño.
 *
 * Rechaza en vez de arreglar por su cuenta cuando arreglar cambiaría lo que el
 * dueño quiso decir, y el mensaje dice CUÁL es el problema: este formulario se
 * llena una vez y luego se imprimen los QR, así que un error que pase aquí se
 * descubre con los individuales ya plastificados.
 */
export function saneaMesas(entrada: unknown): string[] {
  if (entrada == null) return [];
  if (!Array.isArray(entrada)) throw new Error('Las mesas deben venir como una lista.');

  const salida: string[] = [];
  const vistas = new Map<string, string>();

  for (const cruda of entrada) {
    if (typeof cruda !== 'string' && typeof cruda !== 'number') {
      throw new Error('Cada mesa es un nombre o un número.');
    }
    const etiqueta = String(cruda).replace(/\s+/g, ' ').trim();
    if (!etiqueta) continue; // una fila vacía del formulario no es un error
    if (etiqueta.length > ETIQUETA_MAX) {
      throw new Error(
        `«${etiqueta}» es muy largo para una mesa (máximo ${ETIQUETA_MAX} caracteres). `
        + 'Tiene que caber en el individual y en la comanda.',
      );
    }
    const clave = normalizaEtiqueta(etiqueta);
    const anterior = vistas.get(clave);
    if (anterior !== undefined) {
      // Dos entradas para la misma mesa darían DOS códigos QR para el mismo
      // sitio, y los pedidos de esa mesa saldrían repartidos entre los dos.
      throw new Error(
        anterior === etiqueta
          ? `La mesa «${etiqueta}» está repetida.`
          : `«${etiqueta}» y «${anterior}» son la misma mesa. Deja una sola.`,
      );
    }
    vistas.set(clave, etiqueta);
    salida.push(etiqueta);
  }

  if (salida.length > MESAS_MAX) {
    throw new Error(`Son demasiadas mesas (máximo ${MESAS_MAX}).`);
  }
  return salida;
}

/**
 * La mesa a la que va un pedido, en la forma EXACTA en que la declaró el dueño.
 *
 * Devuelve null cuando la mesa no está en el catálogo. Se compara normalizado
 * para que el QR con `?mesa=terraza 1` case con la mesa «Terraza 1», pero lo
 * que se sella en el pedido es siempre la etiqueta del dueño: la comanda tiene
 * que decir lo que dice el individual.
 */
export function mesaDelCatalogo(catalogo: string[], pedida: unknown): string | null {
  if (typeof pedida !== 'string' && typeof pedida !== 'number') return null;
  const clave = normalizaEtiqueta(String(pedida));
  if (!clave) return null;
  return catalogo.find((m) => normalizaEtiqueta(m) === clave) ?? null;
}

/**
 * Alfabeto del código de la carta, SIN caracteres que se confundan al leerlos
 * de un papel: fuera 0/O, 1/I/l. El código va impreso y alguien lo va a teclear
 * cuando la cámara no lea el QR.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Largo del código. 10 caracteres de este alfabeto ≈ 49 bits: no se adivina. */
const LARGO_CODIGO = 10;

/**
 * Un código público nuevo para la carta de un local.
 *
 * `azar` se inyecta solo para poder probar la forma del resultado.
 */
export function codigoDeCarta(azar: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < LARGO_CODIGO; i++) {
    s += ALFABETO[Math.floor(azar() * ALFABETO.length) % ALFABETO.length];
  }
  return s;
}

/** Un código escrito a mano o leído de un papel: se acepta en minúsculas. */
export function esCodigoDeCarta(s: unknown): boolean {
  return typeof s === 'string' && new RegExp(`^[${ALFABETO}]{${LARGO_CODIGO}}$`).test(s.toUpperCase());
}

/**
 * El enlace que va en el QR de una mesa.
 *
 * La mesa viaja como parámetro y no dentro de la ruta para que el mismo código
 * de carta sirva para todas las mesas del local: un código por mesa obligaría a
 * reimprimir todo al añadir una.
 */
export function enlaceDeMesa(base: string, codigo: string, mesa: string): string {
  const raiz = base.replace(/\/+$/, '');
  return `${raiz}/carta/${encodeURIComponent(codigo)}?mesa=${encodeURIComponent(mesa)}`;
}
