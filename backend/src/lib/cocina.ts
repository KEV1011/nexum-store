// ── La pantalla de la cocina ───────────────────────────────────────────────
//
// QUÉ ES. Un tablero para la tablet de la cocina: qué hay que cocinar ahora,
// desde hace cuánto, y un botón para decir «ya está». Hoy el dueño ve sus
// pedidos en el portal, pero esa pantalla está hecha para ÉL —cifras del día,
// dirección de entrega, estado del repartidor— y el cocinero no necesita nada
// de eso: necesita el plato, la cantidad, lo que va sin cebolla, y el reloj.
//
// LA DECISIÓN QUE LO ORDENA TODO: mesa y domicilio van JUNTOS. A la cocina le
// da exactamente igual si el plato sale a la mesa 7 o en la moto de un
// repartidor — lo cocina igual, en la misma plancha y en el mismo orden. Hoy
// el portal los lleva en dos listas separadas (y con razón: para el dueño son
// dos negocios con dinero distinto), pero separarlos AQUÍ obligaría al
// cocinero a mirar dos pantallas y a decidir él cuál va antes, que es justo
// donde se pierden los pedidos un viernes por la noche.
//
// LO QUE NO SE INVENTA: ni un estado nuevo en `OrderStatus` ni una columna
// nueva. `Order.readyAt` y `Order.acceptedAt` YA EXISTEN y significan
// exactamente esto —el comentario de `readyAt` en el esquema ya decía que
// corre en paralelo a los estados de entrega y por eso es un timestamp y no
// un estado—; `markOrderReadyByBusiness` ya los escribe con ESTOS mismos tres
// estados, y además avisa al repartidor por WS y al cliente por push. Una
// marca propia habría sido un segundo camino de escritura con efectos
// distintos según por dónde se tocara el botón.
//
// Lo que de verdad faltaba es lo de aquí: la LISTA (ninguna consulta junta
// mesa y domicilio) y las reglas del tablero.

import type { OrderStatus } from '@prisma/client';

/**
 * Los estados en los que la cocina tiene algo que hacer o que entregar.
 *
 * `PENDING` NO está: el negocio todavía no ha aceptado el pedido y puede
 * rechazarlo por existencias. Si la cocina empezara ahí, cocinaría platos que
 * nadie confirmó.
 *
 * `DRIVER_TO_PICKUP` y `AT_PICKUP` SÍ están, aunque el plato ya debería estar
 * hecho: el pedido no desaparece del tablero hasta que SALE. Si se fuera al
 * marcarlo listo, el cocinero no tendría forma de comprobar qué entregó y
 * acabaría haciendo el mismo plato dos veces.
 */
export const ESTADOS_EN_COCINA: OrderStatus[] = [
  'PREPARING',
  'DRIVER_TO_PICKUP',
  'AT_PICKUP',
];

/** Lo mínimo que la cocina necesita saber de un pedido. */
export interface PedidoCocina {
  id: string;
  orderRef: string;
  status: OrderStatus;
  /** `DINE_IN` = mesa, `DELIVERY` = se lo llevan. */
  mode: string;
  /** La mesa sellada («5», «Terraza 2»), o null en domicilio. */
  tableLabel: string | null;
  /** `Order.acceptedAt`: cuándo el negocio aceptó. Null = no consta. */
  acceptedAt: Date | null;
  /** `Order.readyAt`: cuándo se dio por hecho. Null = sigue en la plancha. */
  readyAt: Date | null;
  /** Los minutos que el negocio prometió. Null = no declaró ninguno. */
  etaMinutes: number | null;
  lineas: Array<{
    productName: string;
    quantity: number;
    /** «Grande · +Queso». Lo redacta el servidor desde los ids. */
    optionsSummary: string | null;
    /** Lo que se dijo de viva voz: «sin cebolla». */
    notes: string | null;
  }>;
}

/** En qué columna del tablero va cada pedido. */
export type ColumnaCocina = 'en_cocina' | 'listo';

export function columnaDeCocina(p: Pick<PedidoCocina, 'readyAt'>): ColumnaCocina {
  return p.readyAt ? 'listo' : 'en_cocina';
}

/**
 * Los minutos que lleva en la cocina, o `null` si no se puede saber.
 *
 * SE CUENTA DESDE QUE LA COCINA PUDO EMPEZAR, no desde que el cliente pidió.
 * Un pedido que estuvo diez minutos en `PENDING` esperando a que el dueño lo
 * aceptara no lleva diez minutos de cocina: contar desde `createdAt` le
 * echaría al cocinero la demora del mostrador, y ese reloj es justo el que
 * alguien va a usar para decir que la cocina va lenta.
 *
 * `null` y no cero cuando falta el dato: un cero se lee como «acaba de
 * entrar», que es una afirmación, y aquí no se sabe nada.
 */
export function minutosEnCocina(
  p: Pick<PedidoCocina, 'acceptedAt' | 'readyAt'>,
  ahora: Date = new Date(),
): number | null {
  if (!p.acceptedAt) return null;
  // Una vez marcado listo el reloj se congela: lo que interesa de un plato
  // hecho es cuánto TARDÓ, no cuánto lleva esperando a que lo recojan.
  const hasta = p.readyAt ?? ahora;
  const ms = hasta.getTime() - p.acceptedAt.getTime();
  if (ms < 0) return null;
  return Math.floor(ms / 60000);
}

/**
 * ¿Se pasó del tiempo que el negocio prometió?
 *
 * SIN TIEMPO DECLARADO NO SE MARCA NADA. Inventar un umbral («más de 20
 * minutos es tarde») acusaría a la cocina de incumplir algo que nadie pactó, y
 * en un asadero donde un plato tarda cuarenta minutos saldría todo en rojo
 * desde el primer día — a los dos días nadie mira el color. Es la misma regla
 * que el cumplimiento de los fletes, que solo cuenta los que TENÍAN promesa.
 */
export function estaDemorado(
  p: Pick<PedidoCocina, 'acceptedAt' | 'readyAt' | 'etaMinutes'>,
  ahora: Date = new Date(),
): boolean {
  if (p.etaMinutes == null || p.etaMinutes <= 0) return false;
  const min = minutosEnCocina(p, ahora);
  if (min == null) return false;
  return min > p.etaMinutes;
}

/**
 * El tablero, ordenado como hay que cocinarlo.
 *
 * El que lleva más tiempo esperando va PRIMERO: es el orden en que la comida
 * se sirve en cualquier cocina, y el que evita que un pedido se quede atrás
 * porque entraron tres detrás. Los que no tienen reloj van al final, porque
 * de esos no se puede afirmar que lleven esperando.
 */
export function ordenarParaCocina(
  pedidos: PedidoCocina[],
  ahora: Date = new Date(),
): PedidoCocina[] {
  return [...pedidos].sort((a, b) => {
    const ma = minutosEnCocina(a, ahora);
    const mb = minutosEnCocina(b, ahora);
    if (ma == null && mb == null) return 0;
    if (ma == null) return 1;
    if (mb == null) return -1;
    return mb - ma;
  });
}

/** Cuántos platos hay que sacar en total. Es la carga real, no los pedidos. */
export function platosPendientes(pedidos: PedidoCocina[]): number {
  return pedidos
    .filter((p) => !p.readyAt)
    .reduce((s, p) => s + p.lineas.reduce((t, l) => t + l.quantity, 0), 0);
}

/** Cómo se nombra el destino en el tablero. */
export function destinoDeCocina(
  p: Pick<PedidoCocina, 'mode' | 'tableLabel'>,
): string {
  if (p.mode === 'DINE_IN') {
    // Sin mesa sellada no se inventa un número: llevar un plato a la mesa
    // equivocada es peor que preguntar.
    return p.tableLabel ? `Mesa ${p.tableLabel}` : 'En el local';
  }
  return 'Domicilio';
}
