/**
 * La marca del local dentro de su carta.
 *
 * POR QUÉ ESTO EXISTE. En un menú QR el comensal está SENTADO en el
 * restaurante: la marca que manda ahí es la del local, no la nuestra. Una
 * carta que se ve igual en los veinte locales de la plaza se lee como una
 * plantilla, y el dueño lo nota antes que nadie.
 *
 * EL RIESGO QUE INTRODUCE, y el motivo de que estas reglas vivan sueltas y
 * probadas: dejar que cada dueño elija un color es dejar que elija uno con el
 * que el texto encima no se lee. Nadie va a revisarlo, y el defecto no se ve
 * desde el portal —el dueño ve el cuadrito de color, no la pantalla del
 * comensal—. Así que el color se acepta y **los usos se DERIVAN**: el texto
 * que va encima lo decide el contraste, no el gusto.
 *
 * LA GARANTÍA, y está probada barriendo el espectro: entre blanco y negro,
 * el que `textoSobre` elige da **siempre al menos 4,5:1** sobre cualquier
 * color, que es el mínimo de WCAG AA para texto normal. No es una
 * aproximación: el peor caso posible —el color donde blanco y negro empatan—
 * da 4,58:1.
 *
 * Y LA REGLA DE SIEMPRE: sin color declarado no se inventa ninguno. Se usa el
 * de ZIPA, que es lo que la carta ha hecho hasta hoy.
 */

/** El esmeralda de ZIPA, para el local que no declara color propio. */
export const COLOR_ZIPA = '#059669';

/**
 * Normaliza un color escrito por el dueño, o `null` si no es un color.
 *
 * Acepta `#abc` y `#AABBCC`, con o sin almohadilla, porque el selector de
 * color del navegador devuelve una forma y quien lo pega a mano suele
 * escribir otra. Devuelve siempre `#rrggbb` en minúscula para que dos formas
 * del mismo color no se guarden como dos colores distintos.
 */
export function saneaColorMarca(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(v)) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  return null;
}

/** Los tres canales de un `#rrggbb` ya saneado, de 0 a 255. */
function canales(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Luminancia relativa de WCAG 2.1 (0 = negro, 1 = blanco).
 *
 * No es el promedio de los canales: el ojo ve el verde mucho más claro que el
 * azul, y usar el promedio haría que un azul intenso se tomara por «claro» y
 * acabara con texto negro encima, ilegible.
 */
export function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste de WCAG entre dos colores (de 1:1 a 21:1). */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [alto, bajo] = la > lb ? [la, lb] : [lb, la];
  return (alto + 0.05) / (bajo + 0.05);
}

/**
 * Blanco o negro, el que se lea sobre ese fondo.
 *
 * Son blanco y negro PUROS a propósito. Con un «casi negro» más suave
 * —`slate-900`, por ejemplo— la garantía de 4,5:1 se cae a 4,13 en el peor
 * caso, y el peor caso es justo un color de intensidad media, que es el que
 * más dueños van a elegir.
 */
export function textoSobre(fondo: string): string {
  return contraste(fondo, '#ffffff') >= contraste(fondo, '#000000')
    ? '#ffffff'
    : '#000000';
}

/**
 * El color mezclado con blanco, para velos y fondos muy claros.
 *
 * `mezcla` es cuánto color queda: 0.08 deja un tinte que se nota sin competir
 * con el texto. Se mezcla en sRGB y no en el espacio lineal porque lo que se
 * busca es que coincida con lo que hace un `color-mix` del navegador y con la
 * intuición del dueño, no exactitud fotométrica.
 */
export function tonoSuave(hex: string, mezcla = 0.08): string {
  const m = Math.min(1, Math.max(0, mezcla));
  const canal = (c: number) => Math.round(255 - (255 - c) * m);
  const [r, g, b] = canales(hex);
  return `#${[canal(r), canal(g), canal(b)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** La paleta que la carta necesita, lista para pintar. */
export interface PaletaLocal {
  /** El color de marca ya saneado, o el de ZIPA si no declaró ninguno. */
  marca: string;
  /** Blanco o negro: lo que se lee encima de `marca`. */
  sobreMarca: string;
  /** Tinte clarísimo del mismo color, para velos y fondos. */
  suave: string;
  /** `false` si el local no declaró color y se está usando el de ZIPA. */
  propia: boolean;
}

/**
 * La paleta de un local a partir de lo que declaró (o no).
 *
 * Un color inválido se trata igual que no haber declarado ninguno: es
 * preferible una carta con el verde de ZIPA a una con el texto ilegible
 * porque alguien pegó algo que no era un color.
 */
export function paletaDeLocal(colorDeclarado: string | null | undefined): PaletaLocal {
  const sano = saneaColorMarca(colorDeclarado);
  const marca = sano ?? COLOR_ZIPA;
  return {
    marca,
    sobreMarca: textoSobre(marca),
    suave: tonoSuave(marca),
    propia: sano !== null,
  };
}

/**
 * La frase del local bajo su nombre («Comida casera desde 1998»).
 *
 * Corta a propósito: va bajo el nombre en la cabecera, y lo que no quepa en
 * dos renglones de un teléfono se corta con puntos suspensivos, que es peor
 * que no haberla escrito. Se limpia igual que el nombre de un plato — los
 * emojis no se dibujan igual en todos los teléfonos.
 */
export const LARGO_FRASE = 80;

/** Cuántas fotos del local admite la galería. */
export const MAX_FOTOS_LOCAL = 6;
