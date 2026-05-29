/// Estado de un pedido desde la perspectiva del cliente.
///
/// Refleja el mismo ciclo que ve el negocio y el conductor, garantizando
/// una única fuente de verdad en toda la plataforma Nexum.
enum CustomerOrderStatus {
  /// Pedido confirmado, buscando conductor.
  confirmed,

  /// Conductor en camino al local a recoger.
  driverToPickup,

  /// Conductor en el local recogiendo (y fotografiando) el pedido.
  atPickup,

  /// Pedido recogido con foto, en camino al cliente.
  inTransit,

  /// Entregado al cliente con prueba.
  delivered,
}

extension CustomerOrderStatusX on CustomerOrderStatus {
  String get label {
    switch (this) {
      case CustomerOrderStatus.confirmed:
        return 'Pedido confirmado';
      case CustomerOrderStatus.driverToPickup:
        return 'Conductor en camino al local';
      case CustomerOrderStatus.atPickup:
        return 'Recogiendo tu pedido';
      case CustomerOrderStatus.inTransit:
        return 'En camino hacia ti';
      case CustomerOrderStatus.delivered:
        return 'Entregado';
    }
  }

  /// Índice 0-4 para pintar la barra de progreso del seguimiento.
  int get step {
    switch (this) {
      case CustomerOrderStatus.confirmed:
        return 0;
      case CustomerOrderStatus.driverToPickup:
        return 1;
      case CustomerOrderStatus.atPickup:
        return 2;
      case CustomerOrderStatus.inTransit:
        return 3;
      case CustomerOrderStatus.delivered:
        return 4;
    }
  }
}

/// Una línea del pedido (producto + cantidad).
class OrderLineEntity {
  const OrderLineEntity({
    required this.productName,
    required this.quantity,
    required this.unitPrice,
  });

  final String productName;
  final int quantity;
  final double unitPrice;

  double get subtotal => unitPrice * quantity;
}

/// Pedido del cliente con su cadena de custodia visible en tiempo real.
///
/// Esta es la diferencia frente a Rappi: el cliente ve la foto de que su
/// pedido salió completo del local y la prueba de entrega.
class CustomerOrderEntity {
  const CustomerOrderEntity({
    required this.id,
    required this.orderRef,
    required this.businessName,
    required this.businessAddress,
    required this.deliveryAddress,
    required this.status,
    required this.lines,
    required this.subtotal,
    required this.deliveryFee,
    required this.createdAt,
    this.driverName,
    this.driverPhone,
    this.etaMinutes,
    this.pickedUpAt,
    this.deliveredAt,
    this.pickupPhotoPath,
    this.deliveryPhotoPath,
    this.hasSignature = false,
  });

  final String id;
  final String orderRef;
  final String businessName;
  final String businessAddress;
  final String deliveryAddress;
  final CustomerOrderStatus status;
  final List<OrderLineEntity> lines;
  final double subtotal;
  final double deliveryFee;
  final DateTime createdAt;

  final String? driverName;
  final String? driverPhone;
  final int? etaMinutes;

  final DateTime? pickedUpAt;
  final DateTime? deliveredAt;

  /// Foto del pedido tomada al salir del local (prueba anti-Rappi).
  final String? pickupPhotoPath;

  /// Foto de la entrega al cliente.
  final String? deliveryPhotoPath;

  /// Si el cliente firmó al recibir.
  final bool hasSignature;

  // ── Derived ────────────────────────────────────────────────────────────────

  double get total => subtotal + deliveryFee;

  bool get hasPickupProof => pickupPhotoPath != null;
  bool get hasDeliveryProof => deliveryPhotoPath != null || hasSignature;
  bool get isDelivered => status == CustomerOrderStatus.delivered;
  bool get isActive => status != CustomerOrderStatus.delivered;

  /// Cadena de custodia completa: foto en el local + prueba de entrega.
  bool get hasFullCustody => hasPickupProof && hasDeliveryProof;

  CustomerOrderEntity copyWith({
    CustomerOrderStatus? status,
    String? driverName,
    String? driverPhone,
    int? etaMinutes,
    DateTime? pickedUpAt,
    DateTime? deliveredAt,
    String? pickupPhotoPath,
    String? deliveryPhotoPath,
    bool? hasSignature,
  }) {
    return CustomerOrderEntity(
      id: id,
      orderRef: orderRef,
      businessName: businessName,
      businessAddress: businessAddress,
      deliveryAddress: deliveryAddress,
      status: status ?? this.status,
      lines: lines,
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      createdAt: createdAt,
      driverName: driverName ?? this.driverName,
      driverPhone: driverPhone ?? this.driverPhone,
      etaMinutes: etaMinutes ?? this.etaMinutes,
      pickedUpAt: pickedUpAt ?? this.pickedUpAt,
      deliveredAt: deliveredAt ?? this.deliveredAt,
      pickupPhotoPath: pickupPhotoPath ?? this.pickupPhotoPath,
      deliveryPhotoPath: deliveryPhotoPath ?? this.deliveryPhotoPath,
      hasSignature: hasSignature ?? this.hasSignature,
    );
  }
}
