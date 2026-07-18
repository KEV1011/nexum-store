/// Estado de un pedido desde la perspectiva del cliente.
///
/// Refleja el mismo ciclo que ve el negocio y el conductor, garantizando
/// una única fuente de verdad en toda la plataforma ZIPA.
enum CustomerOrderStatus {
  /// Pedido enviado, esperando que el restaurante lo acepte.
  pending,

  /// Pedido confirmado, buscando conductor.
  confirmed,

  /// El restaurante está preparando el pedido (con tiempo estimado).
  preparing,

  /// Conductor en camino al local a recoger.
  driverToPickup,

  /// Conductor en el local recogiendo (y fotografiando) el pedido.
  atPickup,

  /// Pedido recogido con foto, en camino al cliente.
  inTransit,

  /// Entregado al cliente con prueba.
  delivered,

  /// Cancelado por el cliente antes de que el conductor llegue al local.
  cancelled,
}

extension CustomerOrderStatusX on CustomerOrderStatus {
  String get label => switch (this) {
        CustomerOrderStatus.pending => 'Esperando confirmación del negocio',
        CustomerOrderStatus.confirmed => 'Pedido confirmado',
        CustomerOrderStatus.preparing => 'Preparando tu pedido',
        CustomerOrderStatus.driverToPickup => 'Conductor en camino al local',
        CustomerOrderStatus.atPickup => 'Recogiendo tu pedido',
        CustomerOrderStatus.inTransit => 'En camino hacia ti',
        CustomerOrderStatus.delivered => 'Entregado',
        CustomerOrderStatus.cancelled => 'Pedido cancelado',
      };

  /// Índice 0-4 para pintar la barra de progreso del seguimiento.
  int get step => switch (this) {
        CustomerOrderStatus.pending => 0,
        CustomerOrderStatus.confirmed => 0,
        CustomerOrderStatus.preparing => 1,
        CustomerOrderStatus.driverToPickup => 2,
        CustomerOrderStatus.atPickup => 2,
        CustomerOrderStatus.inTransit => 3,
        CustomerOrderStatus.delivered => 4,
        CustomerOrderStatus.cancelled => 0,
      };
}

/// Una línea del pedido (producto + cantidad).
class OrderLineEntity {
  const OrderLineEntity({
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    this.optionsSummary,
  });

  factory OrderLineEntity.fromJson(Map<String, dynamic> j) => OrderLineEntity(
        productName: j['productName'] as String,
        quantity: j['quantity'] as int,
        unitPrice: (j['unitPrice'] as num).toDouble(),
        optionsSummary: j['optionsSummary'] as String?,
      );

  final String productName;
  final int quantity;
  final double unitPrice;

  /// Opciones elegidas (ej: "Grande · +Queso"). Null si el producto es simple.
  final String? optionsSummary;

  double get subtotal => unitPrice * quantity;

  Map<String, dynamic> toJson() => {
        'productName': productName,
        'quantity': quantity,
        'unitPrice': unitPrice,
        if (optionsSummary != null) 'optionsSummary': optionsSummary,
      };
}

/// Pedido del cliente con su cadena de custodia visible en tiempo real.
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
    this.prepMinutes,
    this.acceptedAt,
    this.readyAt,
    this.pickedUpAt,
    this.deliveredAt,
    this.pickupPhotoPath,
    this.deliveryPhotoPath,
    this.hasSignature = false,
    this.rating,
    this.ratingComment,
    this.ratedAt,
  });

  factory CustomerOrderEntity.fromJson(Map<String, dynamic> j) =>
      CustomerOrderEntity(
        id: j['id'] as String,
        orderRef: j['orderRef'] as String,
        businessName: j['businessName'] as String,
        businessAddress: j['businessAddress'] as String,
        deliveryAddress: j['deliveryAddress'] as String,
        status: CustomerOrderStatus.values
            .firstWhere((s) => s.name == j['status']),
        lines: (j['lines'] as List)
            .map((l) => OrderLineEntity.fromJson(l as Map<String, dynamic>))
            .toList(),
        subtotal: (j['subtotal'] as num).toDouble(),
        deliveryFee: (j['deliveryFee'] as num).toDouble(),
        createdAt: DateTime.parse(j['createdAt'] as String),
        driverName: j['driverName'] as String?,
        driverPhone: j['driverPhone'] as String?,
        etaMinutes: j['etaMinutes'] as int?,
        prepMinutes: j['prepMinutes'] as int?,
        acceptedAt: j['acceptedAt'] != null
            ? DateTime.tryParse(j['acceptedAt'] as String)
            : null,
        readyAt: j['readyAt'] != null
            ? DateTime.tryParse(j['readyAt'] as String)
            : null,
        pickedUpAt: j['pickedUpAt'] != null
            ? DateTime.parse(j['pickedUpAt'] as String)
            : null,
        deliveredAt: j['deliveredAt'] != null
            ? DateTime.parse(j['deliveredAt'] as String)
            : null,
        pickupPhotoPath: j['pickupPhotoPath'] as String?,
        deliveryPhotoPath: j['deliveryPhotoPath'] as String?,
        hasSignature: j['hasSignature'] as bool? ?? false,
        rating: j['rating'] as int?,
        ratingComment: j['ratingComment'] as String?,
        ratedAt: j['ratedAt'] != null
            ? DateTime.parse(j['ratedAt'] as String)
            : null,
      );

  /// Construye la entidad desde el DTO del backend (`GET /client/orders`), que
  /// usa `items` (no `lines`), `pickupPhotoUrl`/`deliveryPhotoUrl` y no trae
  /// `businessAddress` ni la calificación (esta última es local del cliente).
  factory CustomerOrderEntity.fromApi(Map<String, dynamic> j) =>
      CustomerOrderEntity(
        id: j['id'] as String,
        orderRef: j['orderRef'] as String? ?? '',
        businessName: j['businessName'] as String? ?? '',
        businessAddress: '',
        deliveryAddress: j['deliveryAddress'] as String? ?? '',
        status: CustomerOrderStatus.values.firstWhere(
          (s) => s.name == j['status'],
          orElse: () => CustomerOrderStatus.confirmed,
        ),
        lines: (j['items'] as List<dynamic>? ?? const [])
            .map((l) => OrderLineEntity.fromJson(l as Map<String, dynamic>))
            .toList(),
        subtotal: (j['subtotal'] as num?)?.toDouble() ?? 0,
        deliveryFee: (j['deliveryFee'] as num?)?.toDouble() ?? 0,
        createdAt:
            DateTime.tryParse(j['createdAt'] as String? ?? '') ?? DateTime.now(),
        driverName: j['driverName'] as String?,
        driverPhone: j['driverPhone'] as String?,
        etaMinutes: (j['etaMinutes'] as num?)?.toInt(),
        prepMinutes: (j['prepMinutes'] as num?)?.toInt(),
        acceptedAt: j['acceptedAt'] != null
            ? DateTime.tryParse(j['acceptedAt'] as String)
            : null,
        readyAt: j['readyAt'] != null
            ? DateTime.tryParse(j['readyAt'] as String)
            : null,
        pickedUpAt: j['pickedUpAt'] != null
            ? DateTime.tryParse(j['pickedUpAt'] as String)
            : null,
        deliveredAt: j['deliveredAt'] != null
            ? DateTime.tryParse(j['deliveredAt'] as String)
            : null,
        pickupPhotoPath: j['pickupPhotoUrl'] as String?,
        deliveryPhotoPath: j['deliveryPhotoUrl'] as String?,
        hasSignature: j['hasSignature'] as bool? ?? false,
      );

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

  /// Tiempo de preparación (min) que fijó el restaurante al aceptar.
  final int? prepMinutes;

  /// Momento en que el restaurante aceptó (arranca el contador de cocina).
  final DateTime? acceptedAt;

  /// Momento en que el restaurante marcó el pedido listo para recoger.
  final DateTime? readyAt;

  final DateTime? pickedUpAt;
  final DateTime? deliveredAt;

  /// Foto del pedido tomada al salir del local (prueba anti-Rappi).
  final String? pickupPhotoPath;

  /// Foto de la entrega al cliente.
  final String? deliveryPhotoPath;

  /// Si el cliente firmó al recibir.
  final bool hasSignature;

  /// Calificación del cliente (1-5 estrellas). Null si aún no ha calificado.
  final int? rating;
  final String? ratingComment;
  final DateTime? ratedAt;

  // ── Derived ────────────────────────────────────────────────────────────────

  double get total => subtotal + deliveryFee;

  bool get isRated => rating != null;
  bool get hasPickupProof => pickupPhotoPath != null;
  bool get hasDeliveryProof => deliveryPhotoPath != null || hasSignature;
  bool get isDelivered => status == CustomerOrderStatus.delivered;
  bool get isCancelled => status == CustomerOrderStatus.cancelled;
  bool get isActive => !isDelivered && !isCancelled;

  /// El restaurante ya marcó el pedido listo para recoger.
  bool get isReady => readyAt != null;

  /// Hora estimada en que el pedido estará listo (aceptado + preparación).
  DateTime? get estimatedReadyAt =>
      (acceptedAt != null && prepMinutes != null)
          ? acceptedAt!.add(Duration(minutes: prepMinutes!))
          : null;

  /// Minutos restantes de preparación (>= 0). Null si no hay estimación o ya
  /// está listo. Sirve para el contador en vivo del seguimiento.
  int? get prepMinutesRemaining {
    if (isReady) return null;
    final eta = estimatedReadyAt;
    if (eta == null) return null;
    final diff = eta.difference(DateTime.now()).inMinutes;
    return diff < 0 ? 0 : diff;
  }

  /// Cadena de custodia completa: foto en el local + prueba de entrega.
  bool get hasFullCustody => hasPickupProof && hasDeliveryProof;

  CustomerOrderEntity copyWith({
    CustomerOrderStatus? status,
    String? driverName,
    String? driverPhone,
    int? etaMinutes,
    int? prepMinutes,
    DateTime? acceptedAt,
    DateTime? readyAt,
    DateTime? pickedUpAt,
    DateTime? deliveredAt,
    String? pickupPhotoPath,
    String? deliveryPhotoPath,
    bool? hasSignature,
    int? rating,
    String? ratingComment,
    DateTime? ratedAt,
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
      prepMinutes: prepMinutes ?? this.prepMinutes,
      acceptedAt: acceptedAt ?? this.acceptedAt,
      readyAt: readyAt ?? this.readyAt,
      pickedUpAt: pickedUpAt ?? this.pickedUpAt,
      deliveredAt: deliveredAt ?? this.deliveredAt,
      pickupPhotoPath: pickupPhotoPath ?? this.pickupPhotoPath,
      deliveryPhotoPath: deliveryPhotoPath ?? this.deliveryPhotoPath,
      hasSignature: hasSignature ?? this.hasSignature,
      rating: rating ?? this.rating,
      ratingComment: ratingComment ?? this.ratingComment,
      ratedAt: ratedAt ?? this.ratedAt,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'orderRef': orderRef,
        'businessName': businessName,
        'businessAddress': businessAddress,
        'deliveryAddress': deliveryAddress,
        'status': status.name,
        'lines': lines.map((l) => l.toJson()).toList(),
        'subtotal': subtotal,
        'deliveryFee': deliveryFee,
        'createdAt': createdAt.toIso8601String(),
        'driverName': driverName,
        'driverPhone': driverPhone,
        'etaMinutes': etaMinutes,
        'prepMinutes': prepMinutes,
        'acceptedAt': acceptedAt?.toIso8601String(),
        'readyAt': readyAt?.toIso8601String(),
        'pickedUpAt': pickedUpAt?.toIso8601String(),
        'deliveredAt': deliveredAt?.toIso8601String(),
        'pickupPhotoPath': pickupPhotoPath,
        'deliveryPhotoPath': deliveryPhotoPath,
        'hasSignature': hasSignature,
        'rating': rating,
        'ratingComment': ratingComment,
        'ratedAt': ratedAt?.toIso8601String(),
      };
}
