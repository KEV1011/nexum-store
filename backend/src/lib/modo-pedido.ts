// ── Qué significa cada modo de pedido ──────────────────────────────────────
//
// POR QUÉ UNA TABLA Y NO CONDICIONES SUELTAS. La guarda del despacho decía
// `mode !== 'DINE_IN'`, o sea enumeraba lo que NO se reparte. Con dos modos
// funcionaba; al añadir «para llevar» se convierte en una trampa silenciosa:
// el pedido pasa la condición, se le ofrece la carrera a una moto, y el local
// paga un domicilio por algo que el cliente viene a recoger al mostrador. No
// falla nada visible — simplemente aparece un repartidor que nadie pidió.
//
// Aquí está al revés: cada modo DECLARA qué hace, y la tabla es un
// `Record<OrderMode, …>`. Añadir un modo nuevo sin decidir si se reparte, si
// cobra domicilio y si usa mesa NO COMPILA. Es el mismo patrón que ya sostiene
// los nombres de estado de pedido y las categorías de comercio.

import type { OrderMode } from '@prisma/client';

export interface RasgosDeModo {
  /** Cómo se nombra en la cocina, el portal y la cuenta. */
  etiqueta: string;
  /** ¿Se le busca repartidor? Solo el domicilio. */
  seDespacha: boolean;
  /** ¿Se le cobra el domicilio? Lo que no se reparte, no lo paga. */
  cobraDomicilio: boolean;
  /** ¿Va atado a una mesa, y por tanto a una cuenta que acumula rondas? */
  usaMesa: boolean;
}

export const MODOS: Record<OrderMode, RasgosDeModo> = {
  DELIVERY: {
    etiqueta: 'Domicilio',
    seDespacha: true,
    cobraDomicilio: true,
    usaMesa: false,
  },
  DINE_IN: {
    // El comensal está sentado y el plato lo lleva el mesero.
    etiqueta: 'En mesa',
    seDespacha: false,
    cobraDomicilio: false,
    usaMesa: true,
  },
  TAKEAWAY: {
    // Pide y se lo lleva. Va a la cocina igual que los demás, pero nadie se
    // lo lleva a ninguna parte y no acumula rondas: se paga y se va.
    etiqueta: 'Para llevar',
    seDespacha: false,
    cobraDomicilio: false,
    usaMesa: false,
  },
};

export function rasgosDeModo(mode: OrderMode | string | null | undefined): RasgosDeModo {
  // Sin modo declarado es DOMICILIO, que es el valor por defecto del esquema
  // y lo que son todos los pedidos anteriores a que existieran los modos.
  // Darlo por «no se reparte» dejaría un domicilio real sin repartidor, que
  // es mucho peor que el caso contrario.
  return MODOS[mode as OrderMode] ?? MODOS.DELIVERY;
}

/**
 * ¿Hay que buscarle repartidor a este pedido?
 *
 * La pregunta que antes se respondía con `mode !== 'DINE_IN'` y que ahora
 * tiene una sola respuesta por modo.
 */
export function seDespacha(mode: OrderMode | string | null | undefined): boolean {
  return rasgosDeModo(mode).seDespacha;
}

/** Cómo se nombra el destino en la cocina y en la cuenta. */
export function etiquetaDeModo(
  mode: OrderMode | string | null | undefined,
  tableLabel?: string | null,
): string {
  const r = rasgosDeModo(mode);
  if (!r.usaMesa) return r.etiqueta;
  // Sin mesa sellada no se inventa un número: llevar un plato a la mesa
  // equivocada es peor que preguntar.
  return tableLabel ? `Mesa ${tableLabel}` : 'En el local';
}

/** Los modos que el comensal puede elegir desde la carta del QR. */
export const MODOS_DESDE_LA_CARTA: OrderMode[] = ['DINE_IN', 'TAKEAWAY'];
