/// Resumen de ganancias para un período dado.
class BusinessEarningsEntity {
  const BusinessEarningsEntity({
    required this.grossRevenue,
    required this.commissionDeducted,
    required this.netEarnings,
    required this.orderCount,
    required this.periodLabel,
    required this.orders,
    required this.nextLiquidationDate,
  });

  /// Ingresos brutos antes de comisión (COP).
  final double grossRevenue;

  /// Comisión Nexum deducida (COP).
  final double commissionDeducted;

  /// Ingreso neto a recibir (COP).
  final double netEarnings;

  final int orderCount;

  /// "Hoy" | "Esta semana" | "Este mes"
  final String periodLabel;

  /// Desglose por pedido.
  final List<OrderEarningLine> orders;

  /// Próxima fecha de liquidación (pago semanal).
  final DateTime nextLiquidationDate;
}

/// Línea de ganancias de un pedido individual.
class OrderEarningLine {
  const OrderEarningLine({
    required this.orderRef,
    required this.grossFare,
    required this.commissionRate,
    required this.completedAt,
    this.customerName,
  });

  final String orderRef;
  final double grossFare;
  final double commissionRate;
  final DateTime completedAt;
  final String? customerName;

  double get commissionAmount => grossFare * commissionRate;
  double get netFare => grossFare * (1 - commissionRate);
}
