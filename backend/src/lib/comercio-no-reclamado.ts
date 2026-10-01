// ── Comercios que todavía no son nuestros clientes ───────────────────────────
//
// EL PROBLEMA COMERCIAL, en las palabras del usuario: el comercio de Pamplona
// es arisco a estos temas **hasta que ve resultados**. Pedirle que entre a un
// portal, cargue su catálogo y acepte pedidos ANTES de haberle llevado un solo
// cliente es pedirle que trabaje por una promesa.
//
// LA SALIDA: su carta se publica a partir de una FOTO (`lib/carta-foto.ts`) y
// el pedido no se le manda a él —no hay nadie al otro lado— sino a un
// repartidor de ZIPA, que va, compra y entrega. Para el local no cambia nada:
// entra un cliente más y paga en caja. Cuando vea los pedidos llegando, la
// conversación de «entra al portal» ya tiene con qué respaldarse.
//
// ESTO SOLO ES HONESTO SI SE CUMPLEN TRES COSAS, y por eso viven aquí:
//
//  1. **El precio es REFERENCIAL y se dice.** Salió de una foto de su menú, no
//     de él: pudo subirlo ayer. Enseñarlo como precio firme es la queja más
//     cara que existe —«pagué 18.000 y en el local son 22.000»— y esa queja no
//     la paga el restaurante, que ni sabe que está en la app: la pagamos
//     nosotros. Lo que se cobra es lo que el repartidor PAGÓ, con su recibo.
//  2. **El cliente aprueba un presupuesto, no un precio.** Si el presupuesto
//     fuera la suma exacta de los precios de la foto, cualquier subida dejaría
//     al repartidor sin poder comprar, parado en el mostrador. Lleva holgura,
//     y la holgura NO se cobra: se devuelve lo que sobre.
//  3. **El local puede reclamar su ficha o pedir que se retire.** Un negocio
//     listado sin hablar con él tiene que poder decir que no, y tiene que
//     poder quedarse con el portal cuando diga que sí. Sin esa puerta esto no
//     es una estrategia comercial, es un problema.

/** Lo mínimo que hace falta saber del comercio para decidir cómo se pide. */
export interface ComercioParaPedir {
  name: string;
  /** `false` = la ficha la publicamos nosotros desde una foto de su carta. */
  claimed: boolean;
}

/** Una línea de la lista de compras, ya resuelta contra el catálogo. */
export interface LineaDeCompra {
  nombre: string;
  cantidad: number;
  /** Precio de referencia por unidad, tal como salió de la carta. */
  precioRef: number;
  notas?: string | undefined;
}

/**
 * Holgura del presupuesto: la mayor entre un porcentaje y un piso en pesos.
 *
 * El porcentaje solo no sirve para una compra pequeña —el 12 % de $4.000 son
 * $480, y un pan subió $500—, y el piso solo no sirve para una grande. Se
 * toma el mayor de los dos, que es lo que cubre los dos casos.
 */
export const HOLGURA_PORCENTAJE = 0.12;
export const HOLGURA_MINIMA_COP = 2000;

/** Tope de cordura del presupuesto. Por encima de esto no es un mandado. */
export const PRESUPUESTO_MAXIMO_COP = 1_500_000;

/** Suma de la lista a precios de referencia. */
export function sumaReferencial(lineas: LineaDeCompra[]): number {
  return lineas.reduce((t, l) => t + l.precioRef * l.cantidad, 0);
}

/**
 * Cuánto se le autoriza gastar al repartidor.
 *
 * Se redondea HACIA ARRIBA a $500: un presupuesto de $23.480 no se puede
 * manejar con billetes, y redondear hacia abajo es dejarlo corto justo en el
 * mostrador, que es el error que deja el pedido sin comprar.
 */
export function presupuestoSugerido(lineas: LineaDeCompra[]): number {
  const base = sumaReferencial(lineas);
  if (base <= 0) return 0;
  const holgura = Math.max(base * HOLGURA_PORCENTAJE, HOLGURA_MINIMA_COP);
  return Math.ceil((base + holgura) / 500) * 500;
}

/**
 * Por qué este comercio no puede recibir un pedido normal.
 *
 * Devuelve el MOTIVO y no un booleano: quien lo lee es el cliente con el carro
 * lleno, y «no se pudo» sin decir qué hacer lo deja atascado. `null` = se
 * puede pedir como siempre.
 */
export function motivoParaNoPedirDirecto(c: ComercioParaPedir): string | null {
  if (c.claimed) return null;
  return (
    `${c.name} todavía no recibe pedidos por la app. `
    + 'Podemos ir a comprarlo por ti: tú apruebas un presupuesto y te '
    + 'cobramos lo que diga el recibo.'
  );
}

/**
 * La lista de compras tal como la lee el repartidor en su app.
 *
 * Va en texto y no en una estructura porque es lo que él va a leer EN EL
 * MOSTRADOR, y porque el mandado ya existe así: añadirle una tabla de líneas
 * sería un segundo modelo de pedido al lado del que ya funciona.
 *
 * El precio de referencia se incluye a propósito —le dice cuánto esperar y
 * cuándo algo está raro— pero marcado como aproximado, para que no discuta
 * con el cajero un número que no salió de él.
 */
export function listaDeCompra(
  comercio: string,
  lineas: LineaDeCompra[],
): string {
  const items = lineas.map((l) => {
    const nota = l.notas?.trim() ? ` (${l.notas.trim()})` : '';
    return `• ${l.cantidad} × ${l.nombre}${nota} — aprox. $${miles(l.precioRef * l.cantidad)}`;
  });
  return [
    `Compra en ${comercio}:`,
    ...items,
    '',
    'Los precios son aproximados (salieron de su carta). Paga lo que diga la '
    + 'caja, guarda el recibo y registra el total real.',
  ].join('\n');
}

function miles(n: number): string {
  return Math.round(n).toLocaleString('es-CO').replace(/,/g, '.');
}

/**
 * Comprueba la lista antes de crear el mandado.
 *
 * Devuelve el motivo del rechazo, o `null` si está bien. Las tres cosas que
 * se rechazan son las que dejarían al repartidor sin poder comprar: una lista
 * vacía, una cantidad imposible, y un presupuesto fuera de rango.
 */
export function motivoParaNoComprar(lineas: LineaDeCompra[]): string | null {
  if (lineas.length === 0) return 'Agrega al menos un producto.';
  if (lineas.some((l) => !Number.isFinite(l.cantidad) || l.cantidad < 1)) {
    return 'Hay un producto con una cantidad que no entendemos.';
  }
  if (lineas.some((l) => l.cantidad > 50)) {
    return 'Para pedidos de más de 50 unidades hablemos por soporte: un '
      + 'repartidor en moto no puede con eso.';
  }
  const total = presupuestoSugerido(lineas);
  if (total <= 0) return 'No pudimos calcular el valor de tu compra.';
  if (total > PRESUPUESTO_MAXIMO_COP) {
    return `El presupuesto de esta compra ($${miles(total)}) supera el máximo `
      + `de $${miles(PRESUPUESTO_MAXIMO_COP)} para un mandado.`;
  }
  return null;
}
