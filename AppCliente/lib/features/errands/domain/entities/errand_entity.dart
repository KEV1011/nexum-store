import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';

// ── Categorías de encargo (Envíos) ──────────────────────────────────────────────────────

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

  String get hint => switch (this) {
        ErrandCategory.pharmacy =>
          'Ej: Acetaminofén 500mg x10, alcohol y curitas en la Farmatodo',
        ErrandCategory.groceries =>
          'Ej: 1 docena de huevos, leche, pan y arroz del Éxito',
        ErrandCategory.documents =>
          'Ej: Recoger un sobre donde mi mamá y traerlo a mi casa',
        ErrandCategory.payments =>
          'Ej: Pagar la factura de energía en Efecty',
        ErrandCategory.food =>
          'Ej: Recoger un almuerzo donde Doña Rosa',
        ErrandCategory.shopping =>
          'Ej: Comprar un cargador en la tienda del centro',
        ErrandCategory.other =>
          'Describe el encargo con el mayor detalle posible',
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
        ErrandCategory.other => const Color(0xFF64748B),
      };

  /// Indica si el encargo típicamente implica comprar productos
  /// (y por tanto requiere presupuesto).
  bool get usuallyBuys => switch (this) {
        ErrandCategory.pharmacy ||
        ErrandCategory.groceries ||
        ErrandCategory.food ||
        ErrandCategory.shopping =>
          true,
        ErrandCategory.documents ||
        ErrandCategory.payments ||
        ErrandCategory.other =>
          false,
      };
}

// ── Estado del encargo ─────────────────────────────────────────────────────────

enum ErrandStatus {
  searching,
  accepted,
  shopping,
  onTheWay,
  delivered,
  cancelled;

  String get label => switch (this) {
        ErrandStatus.searching => 'Buscando quién lo haga...',
        ErrandStatus.accepted => 'Mensajero asignado',
        ErrandStatus.shopping => 'Haciendo tu encargo',
        ErrandStatus.onTheWay => 'En camino a entregarte',
        ErrandStatus.delivered => 'Entregado',
        ErrandStatus.cancelled => 'Cancelado',
      };

  String get description => switch (this) {
        ErrandStatus.searching =>
          'Buscando un mensajero cercano para tu envío...',
        ErrandStatus.accepted =>
          'Va camino al sitio para hacer tu encargo',
        ErrandStatus.shopping =>
          'Comprando / gestionando lo que pediste',
        ErrandStatus.onTheWay => 'Llevando todo hasta tu dirección',
        ErrandStatus.delivered => '¡Envío completado!',
        ErrandStatus.cancelled => 'El envío fue cancelado',
      };

  Color get color => switch (this) {
        ErrandStatus.searching => AppColors.warning,
        ErrandStatus.accepted => AppColors.info,
        ErrandStatus.shopping => AppColors.secondary,
        ErrandStatus.onTheWay => AppColors.primary,
        ErrandStatus.delivered => AppColors.success,
        ErrandStatus.cancelled => AppColors.error,
      };

  IconData get icon => switch (this) {
        ErrandStatus.searching => Icons.search_rounded,
        ErrandStatus.accepted => Icons.directions_run_rounded,
        ErrandStatus.shopping => Icons.shopping_cart_rounded,
        ErrandStatus.onTheWay => Icons.two_wheeler_rounded,
        ErrandStatus.delivered => Icons.check_circle_rounded,
        ErrandStatus.cancelled => Icons.cancel_rounded,
      };

  int get step => switch (this) {
        ErrandStatus.searching => 0,
        ErrandStatus.accepted => 1,
        ErrandStatus.shopping => 2,
        ErrandStatus.onTheWay => 3,
        ErrandStatus.delivered => 4,
        ErrandStatus.cancelled => 0,
      };

  bool get isActive =>
      this != ErrandStatus.delivered && this != ErrandStatus.cancelled;

  bool get canCancel =>
      this == ErrandStatus.searching || this == ErrandStatus.accepted;
}

// ── Entidad principal ─────────────────────────────────────────────────────────

class ErrandEntity {
  const ErrandEntity({
    required this.id,
    required this.category,
    required this.description,
    required this.pickupAddress,
    required this.dropoffAddress,
    required this.serviceFee,
    required this.status,
    required this.createdAt,
    this.purchaseBudget,
    this.notes,
    this.messengerName,
    this.messengerPhone,
    this.messengerRating,
    this.actualPurchaseCost,
    this.rating,
  });

  final String id;
  final ErrandCategory category;
  final String description;
  final String pickupAddress;
  final String dropoffAddress;

  /// Tarifa del servicio (lo que cobra el mensajero por hacer el encargo).
  final double serviceFee;

  /// Presupuesto máximo que el cliente autoriza para compras.
  final double? purchaseBudget;
  final ErrandStatus status;
  final DateTime createdAt;
  final String? notes;
  final String? messengerName;
  final String? messengerPhone;
  final double? messengerRating;

  /// Lo que efectivamente costaron las compras (lo reporta el mensajero).
  final double? actualPurchaseCost;

  /// Calificación que el cliente le dio al mensajero (1-5), o null si no ha
  /// calificado todavía.
  final int? rating;

  bool get hasMessenger => messengerName != null;
  bool get isActive => status.isActive;
  bool get isRated => rating != null;
  bool get hasBudget => purchaseBudget != null && purchaseBudget! > 0;

  /// Total estimado a pagar: tarifa de servicio + presupuesto de compras.
  double get estimatedTotal => serviceFee + (purchaseBudget ?? 0);

  /// Total real (si ya se conoce el costo de compra).
  double get actualTotal => serviceFee + (actualPurchaseCost ?? purchaseBudget ?? 0);

  ErrandEntity copyWith({
    String? id,
    ErrandCategory? category,
    String? description,
    String? pickupAddress,
    String? dropoffAddress,
    double? serviceFee,
    double? purchaseBudget,
    ErrandStatus? status,
    DateTime? createdAt,
    String? notes,
    String? messengerName,
    String? messengerPhone,
    double? messengerRating,
    double? actualPurchaseCost,
    int? rating,
  }) =>
      ErrandEntity(
        id: id ?? this.id,
        category: category ?? this.category,
        description: description ?? this.description,
        pickupAddress: pickupAddress ?? this.pickupAddress,
        dropoffAddress: dropoffAddress ?? this.dropoffAddress,
        serviceFee: serviceFee ?? this.serviceFee,
        purchaseBudget: purchaseBudget ?? this.purchaseBudget,
        status: status ?? this.status,
        createdAt: createdAt ?? this.createdAt,
        notes: notes ?? this.notes,
        messengerName: messengerName ?? this.messengerName,
        messengerPhone: messengerPhone ?? this.messengerPhone,
        messengerRating: messengerRating ?? this.messengerRating,
        actualPurchaseCost: actualPurchaseCost ?? this.actualPurchaseCost,
        rating: rating ?? this.rating,
      );
}
