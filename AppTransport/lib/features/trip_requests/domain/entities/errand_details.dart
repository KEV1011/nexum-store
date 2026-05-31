import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';

/// Categoría del mandado solicitado por el cliente.
enum ErrandCategory {
  pharmacy,
  groceries,
  documents,
  payments,
  food,
  shopping,
  other;

  String get label => switch (this) {
        ErrandCategory.pharmacy => 'Farmacia',
        ErrandCategory.groceries => 'Mercado',
        ErrandCategory.documents => 'Documentos',
        ErrandCategory.payments => 'Pagos',
        ErrandCategory.food => 'Comida',
        ErrandCategory.shopping => 'Compras',
        ErrandCategory.other => 'Otro',
      };

  IconData get icon => switch (this) {
        ErrandCategory.pharmacy => Icons.local_pharmacy_rounded,
        ErrandCategory.groceries => Icons.shopping_basket_rounded,
        ErrandCategory.documents => Icons.description_rounded,
        ErrandCategory.payments => Icons.receipt_long_rounded,
        ErrandCategory.food => Icons.restaurant_rounded,
        ErrandCategory.shopping => Icons.shopping_bag_rounded,
        ErrandCategory.other => Icons.more_horiz_rounded,
      };

  Color get color => switch (this) {
        ErrandCategory.pharmacy => const Color(0xFF0EA5E9),
        ErrandCategory.groceries => const Color(0xFF16A34A),
        ErrandCategory.documents => const Color(0xFF7C3AED),
        ErrandCategory.payments => const Color(0xFFD97706),
        ErrandCategory.food => const Color(0xFFE11D48),
        ErrandCategory.shopping => const Color(0xFF2563EB),
        ErrandCategory.other => AppColors.textSecondary,
      };

  bool get usuallyBuys => switch (this) {
        ErrandCategory.pharmacy ||
        ErrandCategory.groceries ||
        ErrandCategory.food ||
        ErrandCategory.shopping =>
          true,
        _ => false,
      };
}

/// Detalle del mandado adjunto a una solicitud de trabajo cuando el
/// conductor opera en modo Mandado. Describe en lenguaje natural lo que
/// el cliente necesita y el presupuesto autorizado para compras.
class ErrandDetails {
  const ErrandDetails({
    required this.category,
    required this.description,
    this.purchaseBudget,
    this.notes,
  });

  final ErrandCategory category;
  final String description;

  /// Presupuesto máximo autorizado por el cliente para compras (COP).
  final double? purchaseBudget;
  final String? notes;

  bool get hasBudget => purchaseBudget != null && purchaseBudget! > 0;
}
