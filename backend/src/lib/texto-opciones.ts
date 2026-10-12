// ── Cómo se lee un grupo de opciones, y qué es un grupo válido ──────────────
//
// POR QUÉ EL TEXTO LO REDACTA EL SERVIDOR. El dueño configura el grupo en el
// portal y el cliente lo ve en la app y en la carta del QR. Si cada superficie
// escribiera su propia frase, el dueño creería estar publicando «elige hasta
// 3» y en el teléfono saldría otra cosa — es la misma lección que ya se pagó
// con las condiciones del tiquete (`lineasDePolitica`) y con el medio de cobro
// (`lineasDeCobro`). Aquí sale UNA frase y la enseñan los tres.
//
// Y POR QUÉ SE SANEA. El editor viejo del portal no dejaba decir CUÁNTAS: una
// casilla «varias opciones» ponía `maxSelect = número de opciones`, así que
// «puedes elegir hasta 10» no se podía expresar y «elige al menos 2 salsas»
// tampoco. Al abrir esos dos números a mano aparecen combinaciones que dejan
// el plato IMPOSIBLE DE PEDIR —un mínimo de 3 sobre un grupo de 2 opciones
// rechaza el pedido en la caja y el cliente no entiende por qué—, y eso no se
// ve al guardarlo: se ve cuando alguien intenta comprar.

/** El grupo tal como lo configura el dueño, antes de guardarse. */
export interface GrupoCrudo {
  name?: string;
  required?: boolean;
  minSelect?: number;
  maxSelect?: number;
  options?: Array<{ name?: string; priceDelta?: number; isAvailable?: boolean }>;
}

/** El grupo ya saneado, listo para la base. */
export interface GrupoSaneado {
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: Array<{ name: string; priceDelta: number; isAvailable: boolean }>;
}

/** Hasta cuántas opciones puede tener un grupo. */
export const MAX_OPCIONES_POR_GRUPO = 40;

function entero(v: unknown, porDefecto: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : porDefecto;
}

/**
 * Deja el grupo en un estado que SIEMPRE se puede pedir, o devuelve el motivo.
 *
 * Las correcciones silenciosas son a propósito donde el arreglo es evidente
 * (un máximo por debajo del mínimo se sube al mínimo), y el rechazo con motivo
 * donde no lo es (un grupo sin opciones no se puede adivinar).
 */
export function saneaGrupo(g: GrupoCrudo): { grupo: GrupoSaneado } | { error: string } {
  const name = (g.name ?? '').trim();
  if (!name) return { error: 'Ponle nombre al grupo (por ejemplo, «Tamaño» o «Adiciones»).' };

  const options = (g.options ?? [])
    .map((o) => ({
      name: (o.name ?? '').trim(),
      priceDelta: entero(o.priceDelta, 0),
      isAvailable: o.isAvailable ?? true,
    }))
    .filter((o) => o.name !== '');

  if (options.length === 0) {
    return { error: `«${name}» no tiene ninguna opción. Añade al menos una.` };
  }
  if (options.length > MAX_OPCIONES_POR_GRUPO) {
    return { error: `«${name}» tiene demasiadas opciones (máximo ${MAX_OPCIONES_POR_GRUPO}).` };
  }
  // Dos opciones con el mismo nombre dejan al cliente eligiendo entre dos
  // renglones idénticos con precios distintos.
  const vistas = new Set(options.map((o) => o.name.toLowerCase()));
  if (vistas.size !== options.length) {
    return { error: `En «${name}» hay dos opciones que se llaman igual.` };
  }

  const required = g.required ?? false;
  // El máximo nunca puede pasar del número de opciones: «elige hasta 10» en un
  // grupo de 3 promete algo que la pantalla no puede ofrecer.
  let maxSelect = Math.min(
    Math.max(1, entero(g.maxSelect, 1)),
    options.length,
  );
  // Marcar el grupo obligatorio YA significa «al menos una», aunque el mínimo
  // se haya quedado en cero — es la misma regla que aplica `resolverOpciones`
  // al cobrar, y tiene que decidirse igual en los dos sitios.
  let minSelect = Math.max(required ? 1 : 0, entero(g.minSelect, 0));
  // Un mínimo mayor que el número de opciones haría IMPOSIBLE pedir el plato.
  minSelect = Math.min(minSelect, options.length);
  // Y un máximo por debajo del mínimo, lo mismo. Se sube el máximo en vez de
  // bajar el mínimo: el dueño que escribió «al menos 2» quiso decir eso.
  if (maxSelect < minSelect) maxSelect = minSelect;

  return { grupo: { name, required, minSelect, maxSelect, options } };
}

/**
 * La frase que describe el grupo, la MISMA en el portal, la app y el QR.
 *
 * Se lee en el encabezado del grupo, junto a su nombre: «Tamaño · Obligatorio,
 * elige 1». Dice lo que hay que hacer, no la configuración: «minSelect 1,
 * maxSelect 1» es verdad y no le sirve a nadie.
 */
export function etiquetaDeGrupo(g: {
  required: boolean;
  minSelect: number;
  maxSelect: number;
}): string {
  const obligatorio = g.required || g.minSelect > 0;
  const { minSelect: min, maxSelect: max } = g;

  if (!obligatorio) {
    // Un opcional de una sola opción es un «si quieres, añádelo»: decir
    // «hasta 1» suena a límite y lo único que hay es un sí o un no.
    return max <= 1 ? 'Opcional' : `Opcional · hasta ${max}`;
  }
  if (min === max) return `Obligatorio · elige ${min}`;
  if (min <= 1) return `Obligatorio · elige hasta ${max}`;
  return `Obligatorio · elige entre ${min} y ${max}`;
}
