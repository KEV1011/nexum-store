// ── La cuenta de una mesa ──────────────────────────────────────────────────
//
// EL PROBLEMA. Cada vez que la mesa 1 pedía algo se creaba un pedido nuevo, y
// en el portal salían como filas sueltas: «Mesa 1 · $68.000», «Mesa 1 ·
// $12.000», «Mesa 1 · $8.000». En un local con afluencia eso no es incómodo,
// es caro: nadie sabe cuánto debe la mesa 1 en total y es facilísimo cobrar
// una ronda y olvidar las otras dos.
//
// LO QUE NO SE HACE: fundir las rondas en un solo pedido. La cocina trabaja
// POR RONDA —necesita saber qué acaba de entrar y qué ya sirvió—, así que un
// pedido gigante que va creciendo le rompería el tablero: no habría forma de
// distinguir el plato nuevo del que lleva media hora hecho. Cada ronda sigue
// siendo su pedido; lo que se añade encima es la CUENTA que las agrupa.
//
// Y NO ES UNA FACTURA. Lo que se imprime es la cuenta que se lleva a la mesa
// para que el cliente revise y pague. La factura electrónica con CUFE la
// emite un proveedor autorizado por la DIAN y quien responde ante ella es el
// dueño del restaurante; llamar «factura» a este papel le haría creer que ya
// cumple, y no cumple. El pie del impreso lo dice.

/** Un pedido, para lo poco que la cuenta necesita saber de él. */
export interface PedidoDeCuenta {
  id: string;
  status: string;
  total: number;
}

/**
 * Lo que debe la mesa AHORA.
 *
 * Se DERIVA de los pedidos, no se guarda: un total guardado y unos pedidos
 * guardados acaban discrepando y nadie sabe cuál miente. Es la misma regla
 * del saldo de una cuenta de cobro.
 *
 * Lo CANCELADO no suma: el cliente no se lo comió y nadie va a pagarlo.
 */
export function totalDeCuenta(pedidos: PedidoDeCuenta[]): number {
  return pedidos
    .filter((p) => p.status !== 'CANCELLED')
    .reduce((s, p) => s + p.total, 0);
}

/** Cuántas rondas cuentan de verdad (las canceladas no). */
export function rondasDeCuenta(pedidos: PedidoDeCuenta[]): number {
  return pedidos.filter((p) => p.status !== 'CANCELLED').length;
}

/**
 * ¿Se le puede añadir otra ronda a esta cuenta?
 *
 * Devuelve el MOTIVO y no un booleano: quien pide está sentado en la mesa con
 * el teléfono en la mano, y «no se pudo» sin más le deja llamando al mesero.
 */
export function motivoParaNoAnadir(cuenta: { closedAt: Date | null }): string | null {
  if (cuenta.closedAt) {
    // Que la siguiente ronda abra una cuenta nueva es lo correcto: o son
    // otros comensales que acaban de sentarse, o es una segunda consumición
    // después de haber pagado. Meterla en la cuenta ya cobrada haría
    // reaparecer un total que el cliente ya saldó.
    return 'Esta cuenta ya se cerró. El siguiente pedido abre una cuenta nueva.';
  }
  return null;
}

/**
 * ¿Se puede cerrar la cuenta?
 *
 * Lo que NO se exige, a propósito: que todo esté servido. El cliente puede
 * pedir la cuenta mientras le traen el postre, y bloquear el cobro hasta que
 * el último plato salga de la cocina dejaría al mesero esperando con el
 * datáfono en la mano.
 */
export function motivoParaNoCerrar(cuenta: {
  closedAt: Date | null;
  pedidos: PedidoDeCuenta[];
}): string | null {
  if (cuenta.closedAt) return 'Esta cuenta ya está cerrada.';
  if (rondasDeCuenta(cuenta.pedidos) === 0) {
    // Una cuenta sin nada que cobrar no es un documento de nada, y cerrarla
    // gastaría un número del consecutivo.
    return 'Esta mesa no ha consumido nada todavía.';
  }
  return null;
}

/**
 * El siguiente número de cuenta del día para este local.
 *
 * Se reinicia cada día a propósito: «Cuenta 14» de hoy es lo que un mesero
 * puede cantar en voz alta y lo que el dueño cuadra por la noche. Un
 * consecutivo que llega a 8.400 no le sirve a nadie en el salón, y como esto
 * NO es un documento fiscal no hay ninguna obligación de numeración continua.
 */
export function siguienteNumero(usadosHoy: number[]): number {
  return usadosHoy.length === 0 ? 1 : Math.max(...usadosHoy) + 1;
}

/** Cómo se nombra la cuenta en pantalla y en el papel. */
export function etiquetaDeCuenta(c: { numero: number; tableLabel: string }): string {
  return `Cuenta ${c.numero} · Mesa ${c.tableLabel}`;
}

/** Una línea del impreso: el mismo plato pedido dos veces va junto. */
export interface LineaImpresa {
  nombre: string;
  /** Lo que lo distingue de otro igual: tamaño, adiciones, «sin cebolla». */
  detalle: string;
  cantidad: number;
  /** Lo que cuesta UNA unidad con sus opciones ya sumadas. */
  unitario: number;
  subtotal: number;
}

/**
 * Agrupa las líneas de todas las rondas para el impreso.
 *
 * Dos cervezas pedidas en dos rondas distintas salen como «2 Cerveza», que es
 * como se lee una cuenta de restaurante. Lo que NO se junta es el mismo plato
 * con opciones distintas: una hamburguesa sin cebolla y otra con no son la
 * misma línea, y fundirlas escondería justo lo que el cliente va a revisar.
 *
 * El precio unitario entra en la clave por el mismo motivo: si el dueño subió
 * el precio entre dos rondas, juntarlas daría un subtotal que no cuadra con
 * ninguno de los dos precios y el cliente tendría razón al reclamar.
 */
export function lineasImpresas(
  rondas: Array<{
    status: string;
    lines: Array<{
      productName: string;
      quantity: number;
      unitPrice: number;
      optionsSummary: string | null;
      notes: string | null;
    }>;
  }>,
): LineaImpresa[] {
  const mapa = new Map<string, LineaImpresa>();

  for (const ronda of rondas) {
    if (ronda.status === 'CANCELLED') continue;
    for (const l of ronda.lines) {
      const detalle = [l.optionsSummary, l.notes].filter(Boolean).join(' · ');
      const clave = `${l.productName}|${detalle}|${l.unitPrice}`;
      const previa = mapa.get(clave);
      if (previa) {
        previa.cantidad += l.quantity;
        previa.subtotal += l.unitPrice * l.quantity;
      } else {
        mapa.set(clave, {
          nombre: l.productName,
          detalle,
          cantidad: l.quantity,
          unitario: l.unitPrice,
          subtotal: l.unitPrice * l.quantity,
        });
      }
    }
  }

  return [...mapa.values()];
}

// ── Cancelar una ronda ─────────────────────────────────────────────────────
//
// Pasa todos los días: el plato se cae, el cliente se arrepiente, el mesero
// marcó la mesa equivocada. Hasta ahora NO HABÍA FORMA de deshacerlo —ni ruta
// ni función—, así que el único camino era cobrarle al cliente algo que nadie
// consumió, o apuntarlo en un papel y descuadrar la caja.

/**
 * ¿Se puede cancelar esta ronda?
 *
 * Lo que SÍ se permite, y a propósito: cancelar algo ya servido. Un plato que
 * se devuelve a la cocina porque venía frío ya pasó por «servido», y negar la
 * cancelación ahí obligaría a cobrarlo. Quien decide es el negocio.
 *
 * Lo que NO: cancelar en una cuenta YA COBRADA. Ahí el dinero entró en la
 * caja y el total está sellado; «cancelar» no devolvería nada y solo dejaría
 * la cuenta diciendo una cifra distinta de la que se cobró. Una devolución
 * después de pagar es otra cosa y se hace con el dinero en la mano.
 */
export function motivoParaNoCancelarRonda(r: {
  status: string;
  cuentaCerrada: boolean;
}): string | null {
  if (r.status === 'CANCELLED') return 'Esa ronda ya estaba cancelada.';
  if (r.cuentaCerrada) {
    return 'Esta cuenta ya se cobró. Para devolver algo, hazlo con el dinero en la mano.';
  }
  return null;
}
