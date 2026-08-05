// ── Saldo de la cuenta de cobro ───────────────────────────────────────────────
//
// El cliente rara vez paga de una sola vez: lo normal es un anticipo al
// despachar —con el que el transportador cubre combustible y peajes— y el saldo
// contra entrega. Puede haber varios abonos por el medio.
//
// El saldo se DERIVA siempre: total de la cuenta menos lo abonado. No se guarda
// en ninguna columna, porque un saldo guardado y unos pagos guardados acaban
// discrepando —y entonces nadie sabe cuál de los dos miente—.
//
// Los importes son pesos colombianos: se redondean a peso entero al comparar,
// porque un céntimo flotante dejaría cuentas "casi pagadas" para siempre.

/** Pesos redondeados a entero: evita saldos fantasma de 0,00001. */
function cop(n: number): number {
  return Math.round(n);
}

export type CobroPaymentKind = 'ANTICIPO' | 'ABONO' | 'SALDO';

export interface PaymentRow {
  amount: number;
  kind?: CobroPaymentKind | string;
  voidedAt?: Date | null;
}

export type CobroPaymentStatus = 'SIN_PAGOS' | 'PARCIAL' | 'PAGADA' | 'SOBREPAGADA';

export interface CobroBalance {
  /** Suma del flete de los viajes de la cuenta. */
  total: number;
  /** Suma de los pagos vigentes (los anulados no cuentan). */
  paid: number;
  /** total − paid. Negativo = se pagó de más. */
  balance: number;
  advance: number;
  payments: number;
  status: CobroPaymentStatus;
  /** Porcentaje pagado 0–100, acotado; 0 si la cuenta no tiene valor aún. */
  pct: number;
}

export function cobroBalance(total: number, rows: PaymentRow[]): CobroBalance {
  const vigentes = rows.filter((p) => !p.voidedAt);
  const paid = cop(vigentes.reduce((s, p) => s + (p.amount || 0), 0));
  const totalCop = cop(total);
  const balance = totalCop - paid;
  const advance = cop(
    vigentes.filter((p) => p.kind === 'ANTICIPO').reduce((s, p) => s + (p.amount || 0), 0),
  );

  let status: CobroPaymentStatus;
  if (paid === 0) status = 'SIN_PAGOS';
  else if (balance > 0) status = 'PARCIAL';
  else if (balance === 0) status = 'PAGADA';
  else status = 'SOBREPAGADA';

  return {
    total: totalCop,
    paid,
    balance,
    advance,
    payments: vigentes.length,
    status,
    // Sin valor no hay porcentaje que calcular: 0 en vez de dividir por cero o
    // declarar pagada una cuenta que todavía no vale nada.
    pct: totalCop > 0 ? Math.min(100, Math.round((paid / totalCop) * 100)) : 0,
  };
}

export class PaymentAmountError extends Error {}

/**
 * Valida el monto de un pago nuevo contra el saldo pendiente.
 *
 * Un pago mayor al saldo casi siempre es un dedo de más (un cero, un punto mal
 * puesto) y deja la cuenta cuadrando mal en el cierre, así que se rechaza con
 * el saldo exacto en el mensaje. Cuando el sobrepago es real —el cliente
 * adelanta para la próxima— se registra con `permitirExceso`.
 */
export function assertPaymentAmount(
  amount: number,
  saldoPendiente: number,
  permitirExceso = false,
): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PaymentAmountError('El monto del pago debe ser mayor a cero.');
  }
  if (!permitirExceso && cop(amount) > cop(saldoPendiente)) {
    const fmt = (n: number) =>
      new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })
        .format(n);
    throw new PaymentAmountError(
      saldoPendiente > 0
        ? `El pago (${fmt(amount)}) supera el saldo pendiente (${fmt(saldoPendiente)}).`
        : 'La cuenta ya está pagada por completo.',
    );
  }
}
