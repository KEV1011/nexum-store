// ── Las opciones que eligió el cliente, resueltas contra el catálogo ──────────
//
// Antes la app mandaba el precio ya sumado y un texto con lo elegido, y el
// servidor solo comprobaba que el precio estuviera entre el del catálogo y su
// triple. Tres cosas fallaban con eso:
//
//   1. Una opción que el negocio acababa de agotar entraba igual. El dueño
//      apagaba «pepperoni» y el cliente con la carta abierta lo pedía; la
//      cocina recibía un plato que no puede preparar.
//   2. Un pedido legítimo con muchas adiciones sobre un plato barato se
//      recortaba en silencio al llegar al triple, y el restaurante perdía la
//      diferencia sin enterarse.
//   3. El texto de la cocina venía del teléfono: se leía lo que el cliente
//      dijo haber elegido, no lo que se le cobró.
//
// Aquí el precio y el texto salen del catálogo. La app solo dice QUÉ eligió.

export interface OpcionCatalogo {
  id: string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
}

export interface GrupoCatalogo {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: OpcionCatalogo[];
}

export interface OpcionesResueltas {
  /** Suma de los recargos reales. Puede ser negativo si el negocio descuenta. */
  recargo: number;
  /** Texto para la cocina, compuesto por el servidor: "Grande · +Queso". */
  resumen: string | null;
  /** Los ids validados, en el orden en que aparecen en la carta. */
  ids: string[];
}

/** Error de negocio: el mensaje se le enseña al cliente tal cual. */
export class OpcionInvalidaError extends Error {}

/**
 * Valida la selección contra los grupos del producto y devuelve el recargo y
 * el resumen. Lanza `OpcionInvalidaError` con un mensaje en español si algo no
 * cuadra — la app valida lo mismo antes de enviar, pero un teléfono con la
 * carta vieja, o alguien tocando la petición a mano, no puede colarse.
 */
export function resolverOpciones(
  grupos: GrupoCatalogo[],
  elegidas: readonly string[],
  nombreProducto: string,
): OpcionesResueltas {
  const seleccion = new Set(elegidas);

  // Toda opción enviada tiene que pertenecer a este producto. Si no, o la
  // carta cambió, o la petición viene manipulada; en ambos casos se para.
  const conocidas = new Set<string>();
  for (const g of grupos) for (const o of g.options) conocidas.add(o.id);
  for (const id of seleccion) {
    if (!conocidas.has(id)) {
      throw new OpcionInvalidaError(
        `Las opciones de ${nombreProducto} cambiaron. Vuelve a armarlo, por favor.`,
      );
    }
  }

  let recargo = 0;
  const partes: string[] = [];
  const ids: string[] = [];

  // Se recorre en el orden de la carta, no en el que llegó: el resumen que lee
  // la cocina debe salir siempre igual para el mismo plato.
  for (const g of grupos) {
    const puestas = g.options.filter((o) => seleccion.has(o.id));

    for (const o of puestas) {
      if (!o.isAvailable) {
        throw new OpcionInvalidaError(
          `Se acabó ${o.name} en ${nombreProducto}. Elige otra opción.`,
        );
      }
    }

    // Un grupo obligatorio exige al menos una elección aunque el negocio haya
    // dejado minSelect en cero: marcarlo obligatorio ya significa eso.
    const minimo = g.required ? Math.max(1, g.minSelect) : g.minSelect;
    if (puestas.length < minimo) {
      throw new OpcionInvalidaError(
        minimo === 1
          ? `Elige ${g.name.toLowerCase()} para ${nombreProducto}.`
          : `Elige al menos ${minimo} en ${g.name} para ${nombreProducto}.`,
      );
    }
    if (g.maxSelect > 0 && puestas.length > g.maxSelect) {
      throw new OpcionInvalidaError(
        `En ${g.name} puedes elegir hasta ${g.maxSelect}.`,
      );
    }

    for (const o of puestas) {
      recargo += o.priceDelta;
      ids.push(o.id);
      // El «+» distingue lo que se AÑADE de lo que se ELIGE. Un grupo
      // obligatorio es una variante del plato —el tamaño de la pizza— y se
      // lee «Grande», no «+Grande», aunque cueste más. Un grupo opcional sí
      // es una adición. Esa distinción es la que hace que la comanda se lea
      // de un vistazo.
      const esAdicion = !g.required && o.priceDelta > 0;
      partes.push(esAdicion ? `+${o.name}` : o.name);
    }
  }

  return {
    recargo,
    resumen: partes.length ? partes.join(' · ') : null,
    ids,
  };
}

/** Longitud máxima de la nota del cliente para la cocina. */
export const MAX_NOTA = 140;

/**
 * Limpia la nota que va a la cocina. Se recorta en vez de rechazarse: perder
 * un pedido porque alguien escribió de más sería peor que acortar el texto.
 */
export function sanearNota(nota: unknown): string | null {
  if (typeof nota !== 'string') return null;
  const limpia = nota.replace(/\s+/g, ' ').trim();
  if (!limpia) return null;
  return limpia.length > MAX_NOTA ? limpia.slice(0, MAX_NOTA).trimEnd() : limpia;
}
