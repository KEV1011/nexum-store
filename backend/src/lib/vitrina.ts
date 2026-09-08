/**
 * Las reglas de la vitrina: descuentos, promoción de la tienda y «lo más pedido».
 *
 * Viven sueltas y probadas porque son las tres formas en que una tienda miente
 * sin que se note:
 *
 * 1. Un «antes» inflado. Tachar $30.000 para vender a $16.000 algo que nunca
 *    costó $30.000 es publicidad engañosa, y en Colombia la SIC sanciona por
 *    eso. No podemos comprobar si el precio anterior fue real, pero sí impedir
 *    los que son imposibles y no dejar que el número lo invente el sistema.
 * 2. Una promoción que la pantalla promete y la caja no aplica. El banner que
 *    dice «$6.000 OFF» y luego cobra completo es peor que no tener promoción.
 *    Por eso el descuento se calcula AQUÍ y el cobro usa esta misma función.
 * 3. Un «#1 más pedido» sobre tres pedidos. Es la misma trampa que la
 *    retención sobre dos personas: un ranking necesita de dónde salir.
 */

// ─── 1. Precio anterior y descuento ──────────────────────────────────────────

/**
 * Cuánto se ahorra, en porcentaje entero, o null si no hay descuento real.
 *
 * Entero a propósito: «-46 %» se lee de un vistazo y «-46,3 %» no dice más.
 */
export function porcentajeDescuento(
  precio: number,
  precioAntes: number | null | undefined,
): number | null {
  if (typeof precioAntes !== 'number' || !Number.isFinite(precioAntes)) return null;
  if (!(precioAntes > precio) || precio < 0) return null;
  const pct = Math.round(((precioAntes - precio) / precioAntes) * 100);
  // Un 0 % redondeado (por ejemplo 10.000 → 9.999) no es un descuento que
  // merezca una insignia roja: se calla.
  return pct > 0 ? pct : null;
}

/** Tope de rebaja que se puede declarar. */
export const DESCUENTO_MAXIMO_PCT = 90;

/**
 * Valida el «precio antes» que escribe el dueño, antes de guardarlo.
 *
 * Devuelve el valor a guardar (`null` = sin descuento) o LANZA con el motivo.
 * Se rechaza al guardar, que es el único momento en que hay alguien delante
 * para corregirlo — igual que la comisión.
 */
export function saneaPrecioAntes(
  precio: number,
  valor: unknown,
): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  // Se quita TODO lo que no sea dígito: en Colombia el punto de «$30.000» es
  // separador de MILES, no decimal, y tratarlo como decimal convertía treinta
  // mil pesos en treinta. El peso no se cobra con centavos.
  const n = typeof valor === 'string' ? Number(valor.replace(/[^\d]/g, '')) : valor;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    throw new Error('El precio anterior debe ser un número mayor que cero.');
  }
  const antes = Math.round(n);
  if (antes <= precio) {
    // El caso típico: escribirlo al revés. Decirlo con el número delante evita
    // que el dueño lo intente tres veces sin saber qué está mal.
    throw new Error(
      `El precio anterior ($${antes.toLocaleString('es-CO')}) tiene que ser MAYOR que el precio actual ($${precio.toLocaleString('es-CO')}).`,
    );
  }
  const pct = porcentajeDescuento(precio, antes) ?? 0;
  if (pct > DESCUENTO_MAXIMO_PCT) {
    throw new Error(
      `Un descuento del ${pct} % no es creíble y puede ser sancionado como precio engañoso. El máximo es ${DESCUENTO_MAXIMO_PCT} %.`,
    );
  }
  return antes;
}

// ─── 2. Promoción de la tienda ───────────────────────────────────────────────

export interface PromoTienda {
  /** Si el carrito YA alcanza el mínimo. */
  aplica: boolean;
  /** Pesos que se descuentan ahora mismo. Cero si aún no aplica. */
  descuento: number;
  /** Cuánto falta para alcanzarla. Cero si ya aplica. */
  falta: number;
  /** De 0 a 1, para la barra de progreso. */
  progreso: number;
}

/**
 * Qué pasa con la promoción «$X de descuento comprando $Y».
 *
 * La MISMA función la usa el banner de la tienda y el cobro del pedido: si
 * fueran dos cuentas distintas, la pantalla prometería una cosa y la caja
 * cobraría otra, que es la queja más cara que puede tener un negocio.
 */
export function promoDeTienda(
  subtotal: number,
  minimo: number | null | undefined,
  descuento: number | null | undefined,
): PromoTienda | null {
  const min = typeof minimo === 'number' && Number.isFinite(minimo) ? Math.round(minimo) : null;
  const desc = typeof descuento === 'number' && Number.isFinite(descuento) ? Math.round(descuento) : null;
  // Sin las dos mitades no hay promoción que anunciar.
  if (min === null || desc === null || min <= 0 || desc <= 0) return null;
  // Un descuento igual o mayor que el mínimo regalaría el pedido.
  if (desc >= min) return null;

  const base = Math.max(0, Math.round(subtotal));
  const aplica = base >= min;
  return {
    aplica,
    // Nunca puede dejar el pedido en negativo, pase lo que pase con la config.
    descuento: aplica ? Math.min(desc, base) : 0,
    falta: aplica ? 0 : min - base,
    progreso: Math.min(1, base / min),
  };
}

/** Valida lo que el dueño configura como promoción. Lanza con el motivo. */
export function saneaPromoTienda(
  minimo: unknown,
  descuento: unknown,
): { minimo: number | null; descuento: number | null } {
  const vacio = (v: unknown) => v === null || v === undefined || v === '';
  if (vacio(minimo) && vacio(descuento)) return { minimo: null, descuento: null };

  const num = (v: unknown) =>
    typeof v === 'string' ? Number(v.replace(/[^\d]/g, '')) : v;
  const min = num(minimo);
  const desc = num(descuento);

  if (typeof min !== 'number' || !Number.isFinite(min) || min <= 0 ||
      typeof desc !== 'number' || !Number.isFinite(desc) || desc <= 0) {
    // Media promoción no se guarda: un mínimo sin descuento no descuenta nada
    // y un descuento sin mínimo lo regala en el primer pedido de $1.
    throw new Error('La promoción necesita las dos cosas: el descuento y la compra mínima.');
  }
  if (desc >= min) {
    throw new Error(
      `El descuento ($${Math.round(desc).toLocaleString('es-CO')}) tiene que ser menor que la compra mínima ($${Math.round(min).toLocaleString('es-CO')}).`,
    );
  }
  return { minimo: Math.round(min), descuento: Math.round(desc) };
}

// ─── 3. Lo más pedido ────────────────────────────────────────────────────────

/**
 * Cuántas unidades hacen falta para que un ranking signifique algo.
 *
 * Con dos pedidos, el «#1 más pedido» solo dice qué compró la última persona.
 * Es la misma regla que la retención: sin base, no se afirma.
 */
export const MINIMO_PARA_RANKING = 15;

export interface MasPedido {
  productId: string;
  unidades: number;
  /** 1 = el más pedido. */
  puesto: number;
}

/**
 * Ordena los productos por unidades vendidas y les pone puesto.
 *
 * Devuelve VACÍO cuando la tienda no ha vendido lo suficiente: preferimos una
 * sección menos a una insignia que presume de un plato que pidieron dos veces.
 * Solo se rankean los primeros, porque «#37 más pedido» no es un argumento.
 */
export function rankingMasPedido(
  unidadesPorProducto: Map<string, number>,
  { minimoTienda = MINIMO_PARA_RANKING, cuantos = 5 } = {},
): MasPedido[] {
  let total = 0;
  for (const n of unidadesPorProducto.values()) total += n;
  if (total < minimoTienda) return [];

  return [...unidadesPorProducto.entries()]
    .filter(([, n]) => n > 0)
    // Desempate por id para que el orden sea estable entre consultas: si dos
    // platos empatan, que no se turnen el «#1» en cada recarga.
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, cuantos)
    .map(([productId, unidades], i) => ({ productId, unidades, puesto: i + 1 }));
}
