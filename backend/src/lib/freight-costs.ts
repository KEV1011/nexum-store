// ── Gastos del flete ──────────────────────────────────────────────────────────
//
// La bitácora del conductor nació con tres tipos (tanqueo, parada, nota) y el
// tanqueo era el único que movía plata. Para una empresa de carga eso deja
// fuera lo que más pesa después del combustible: peajes, viáticos y
// mantenimiento. Sin ellos el panel financiero dice cuánto FACTURÓ la flota,
// nunca cuánto GANÓ.
//
// `FreightEvent.type` es texto libre en la base, así que ampliar la lista no
// necesita migración — pero sí una única fuente de verdad sobre qué tipos son
// gasto y cuáles son solo bitácora. Vive aquí, sin dependencias, para poder
// probarla y para que el portal y la app no la reimplementen cada uno.

/** Tipos que mueven dinero: suman al costo del flete. */
export const EXPENSE_TYPES = ['FUEL', 'TOLL', 'PERDIEM', 'MAINTENANCE'] as const;
/** Tipos que solo dejan constancia: no suman al costo. */
export const LOG_TYPES = ['STOP', 'NOTE'] as const;

export const FREIGHT_EVENT_TYPES = [...EXPENSE_TYPES, ...LOG_TYPES] as const;

export type FreightExpenseType = (typeof EXPENSE_TYPES)[number];
export type FreightEventType = (typeof FREIGHT_EVENT_TYPES)[number];

/** Etiquetas en español para el portal y la app. */
export const EVENT_LABEL_ES: Record<FreightEventType, string> = {
  FUEL: 'Tanqueo',
  TOLL: 'Peaje',
  PERDIEM: 'Viático',
  MAINTENANCE: 'Mantenimiento',
  STOP: 'Parada',
  NOTE: 'Nota',
};

export function isFreightEventType(t: string): t is FreightEventType {
  return (FREIGHT_EVENT_TYPES as readonly string[]).includes(t);
}

/**
 * Un gasto sin monto no es un gasto: sería una fila que no suma y que hace
 * cuadrar mal el margen sin que nadie lo note. Las paradas y notas, en cambio,
 * no llevan monto.
 */
export function requiresAmount(t: string): boolean {
  return (EXPENSE_TYPES as readonly string[]).includes(t);
}

export interface CostBreakdown {
  fuel: number;
  toll: number;
  perdiem: number;
  maintenance: number;
  /** Suma de todo lo anterior. */
  total: number;
}

export const EMPTY_COSTS: CostBreakdown = {
  fuel: 0, toll: 0, perdiem: 0, maintenance: 0, total: 0,
};

/**
 * Reparte los montos de una bitácora por concepto. Ignora tipos desconocidos y
 * montos nulos o negativos: un evento viejo o mal grabado no debe inventar
 * costo ni restarlo.
 */
export function costBreakdown(
  events: { type: string; amountCop?: number | null }[],
): CostBreakdown {
  const out: CostBreakdown = { ...EMPTY_COSTS };
  for (const e of events) {
    const monto = e.amountCop ?? 0;
    if (!(monto > 0)) continue;
    switch (e.type) {
      case 'FUEL': out.fuel += monto; break;
      case 'TOLL': out.toll += monto; break;
      case 'PERDIEM': out.perdiem += monto; break;
      case 'MAINTENANCE': out.maintenance += monto; break;
      default: continue; // STOP, NOTE o tipo desconocido: no es gasto
    }
    out.total += monto;
  }
  return out;
}
