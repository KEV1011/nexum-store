/// Estado de un pedido de envíos desde la perspectiva del negocio/local.
enum BusinessOrderStatus {
  /// Pedido confirmado, conductor en camino al local.
  pending,

  /// Conductor llegó al local, recogiendo el pedido.
  atPickup,

  /// Pedido recogido con foto, conductor en camino al cliente.
  inTransit,

  /// Pedido entregado al cliente.
  delivered,
}

/// Representa un pedido de envío visible para el dueño del negocio.
///
/// Concentra toda la evidencia de cadena de custodia en un solo lugar:
/// foto de recogida en el local + prueba de entrega al cliente.
class BusinessOrderEntity {
  const BusinessOrderEntity({
    required this.id,
    required this.orderRef,
    required this.businessName,
    required this.customerName,
    required this.customerAddress,
    required this.status,
    required this.createdAt,
    required this.grossFare,
    this.pickedUpAt,
    this.deliveredAt,
    this.pickupPhotoPath,
    this.deliveryPhotoPath,
    this.hasSignature = false,
    this.driverName,
    this.driverPhone,
  });

  final String id;

  /// Referencia del pedido (ej: "#4521").
  final String orderRef;

  /// Nombre del restaurante o local.
  final String businessName;

  /// Nombre del cliente destinatario.
  final String customerName;

  /// Dirección de entrega.
  final String customerAddress;

  final BusinessOrderStatus status;

  /// Cuándo se creó/confirmó el pedido.
  final DateTime createdAt;

  /// Cuándo el conductor fotografió y recogió el pedido en el local.
  final DateTime? pickedUpAt;

  /// Cuándo el conductor entregó al cliente.
  final DateTime? deliveredAt;

  /// Ruta de la foto tomada al recoger el pedido en el local.
  final String? pickupPhotoPath;

  /// Ruta de la foto tomada al entregar al cliente.
  final String? deliveryPhotoPath;

  /// Si el cliente firmó digitalmente al recibir.
  final bool hasSignature;

  /// Tarifa cobrada al negocio (COP).
  final double grossFare;

  /// Nombre del conductor asignado.
  final String? driverName;

  /// Teléfono del conductor (para contacto directo).
  final String? driverPhone;

  // ── Derived ──────────────────────────────────────────────────────────────

  bool get hasPickupProof => pickupPhotoPath != null;
  bool get hasDeliveryProof => deliveryPhotoPath != null || hasSignature;

  /// Cadena de custodia completa: foto en local + prueba de entrega.
  bool get hasFullCustody => hasPickupProof && hasDeliveryProof;

  bool get isDelivered => status == BusinessOrderStatus.delivered;
  bool get isPending => status == BusinessOrderStatus.pending;
  bool get isInTransit => status == BusinessOrderStatus.inTransit;

  // ── copyWith ──────────────────────────────────────────────────────────────

  BusinessOrderEntity copyWith({
    String? id,
    String? orderRef,
    String? businessName,
    String? customerName,
    String? customerAddress,
    BusinessOrderStatus? status,
    DateTime? createdAt,
    DateTime? pickedUpAt,
    DateTime? deliveredAt,
    String? pickupPhotoPath,
    String? deliveryPhotoPath,
    bool? hasSignature,
    double? grossFare,
    String? driverName,
    String? driverPhone,
  }) {
    return BusinessOrderEntity(
      id: id ?? this.id,
      orderRef: orderRef ?? this.orderRef,
      businessName: businessName ?? this.businessName,
      customerName: customerName ?? this.customerName,
      customerAddress: customerAddress ?? this.customerAddress,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      pickedUpAt: pickedUpAt ?? this.pickedUpAt,
      deliveredAt: deliveredAt ?? this.deliveredAt,
      pickupPhotoPath: pickupPhotoPath ?? this.pickupPhotoPath,
      deliveryPhotoPath: deliveryPhotoPath ?? this.deliveryPhotoPath,
      hasSignature: hasSignature ?? this.hasSignature,
      grossFare: grossFare ?? this.grossFare,
      driverName: driverName ?? this.driverName,
      driverPhone: driverPhone ?? this.driverPhone,
    );
  }
}
