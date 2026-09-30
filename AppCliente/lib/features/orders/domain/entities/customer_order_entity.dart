import 'package:nexum_client/shared/models/driver_card_info.dart';
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

  /// Va en el bus de una empresa intermunicipal, camino a la otra ciudad.
  /// Distinto de [inTransit], que es un repartidor urbano con la caja encima.
  inIntercityTransit,

  /// Llegó a tu ciudad y espera al repartidor que la lleva a la puerta.
  /// Solo pasa por aquí quien pidió entrega a domicilio en destino; quien
  /// recoge en taquilla salta directo a [delivered].
  atDestinationHub,

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
        CustomerOrderStatus.inIntercityTransit => 'Va en camino a tu ciudad',
        CustomerOrderStatus.atDestinationHub => 'Llegó a tu ciudad, buscamos quién te lo lleve',
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
        // Comparte paso con el reparto urbano: para el cliente las dos cosas
        // son «va en camino», y la diferencia ya la dice la etiqueta.
        CustomerOrderStatus.inIntercityTransit => 3,
        CustomerOrderStatus.atDestinationHub => 3,
        CustomerOrderStatus.inTransit => 3,
        CustomerOrderStatus.delivered => 4,
        CustomerOrderStatus.cancelled => 0,
      };
}

/// Un paso del recorrido del pedido, tal como lo arma el SERVIDOR.
///
/// Los pasos no se deducen aquí a propósito: dependen de la forma del pedido
/// —en mesa, domicilio urbano, encomienda en taquilla o encomienda a la
/// puerta— y si los dedujera la app, cada versión instalada contaría una
/// historia distinta del mismo pedido. Además, un estado nuevo en el
/// servidor aparecería sin publicar una versión nueva.
class PasoPedido {
  const PasoPedido({
    required this.clave,
    required this.titulo,
    required this.estado,
    this.detalle,
    this.at,
  });

  factory PasoPedido.fromJson(Map<String, dynamic> j) => PasoPedido(
        clave: j['clave']?.toString() ?? '',
        titulo: j['titulo']?.toString() ?? '',
        estado: j['estado']?.toString() ?? 'pendiente',
        detalle: j['detalle'] as String?,
        at: DateTime.tryParse(j['at'] as String? ?? '')?.toLocal(),
      );

  final String clave;
  final String titulo;
  final String? detalle;

  /// Cuándo ocurrió. **Null cuando no hay registro**, y entonces no se
  /// escribe ninguna hora: poner la de otro paso sería peor que el hueco,
  /// porque el cliente cuenta desde ahí.
  final DateTime? at;

  /// `cumplido` | `actual` | `pendiente` | `cancelado`.
  final String estado;

  bool get cumplido => estado == 'cumplido';
  bool get actual => estado == 'actual';
  bool get cancelado => estado == 'cancelado';
}

/// Una línea del pedido (producto + cantidad).
class OrderLineEntity {
  const OrderLineEntity({
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    this.optionsSummary,
    this.notes,
  });

  factory OrderLineEntity.fromJson(Map<String, dynamic> j) => OrderLineEntity(
        productName: j['productName'] as String,
        quantity: j['quantity'] as int,
        unitPrice: (j['unitPrice'] as num).toDouble(),
        optionsSummary: j['optionsSummary'] as String?,
        notes: j['notes'] as String?,
      );

  final String productName;
  final int quantity;
  final double unitPrice;

  /// Opciones elegidas (ej: "Grande · +Queso"). Null si el producto es simple.
  /// Lo compone el servidor desde el catálogo, no esta app.
  final String? optionsSummary;

  /// Lo que el cliente le dijo a la cocina: "sin cebolla", "bien cocida".
  final String? notes;

  double get subtotal => unitPrice * quantity;

  Map<String, dynamic> toJson() => {
        'productName': productName,
        'quantity': quantity,
        'unitPrice': unitPrice,
        if (optionsSummary != null) 'optionsSummary': optionsSummary,
        if (notes != null) 'notes': notes,
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
    this.driverCard,
    this.etaMinutes,
    this.prepMinutes,
    this.acceptedAt,
    this.readyAt,
    this.pickedUpAt,
    this.deliveredAt,
    this.pickupPhotoPath,
    this.deliveryPhotoPath,
    this.deliveryPin,
    this.businessLat,
    this.businessLng,
    this.deliveryLat,
    this.deliveryLng,
    this.driverLat,
    this.driverLng,
    this.hasSignature = false,
    this.rating,
    this.ratingComment,
    this.ratedAt,
    this.timeline = const [],
    this.paymentLabel,
    this.paymentNote,
    this.cobraElRepartidor = false,
    this.promisedAt,
  });

  factory CustomerOrderEntity.fromJson(Map<String, dynamic> j) =>
      CustomerOrderEntity(
        id: j['id'] as String,
        orderRef: j['orderRef'] as String,
        businessName: j['businessName'] as String,
        businessAddress: j['businessAddress'] as String,
        deliveryAddress: j['deliveryAddress'] as String,
        // `orElse` obligatorio: sin él, un estado que esta versión no conozca
        // lanza, y el `try` del datasource descarta la caché ENTERA — el
        // usuario perdería todo su historial por un pedido.
        status: CustomerOrderStatus.values.firstWhere(
          (s) => s.name == j['status'],
          orElse: () => CustomerOrderStatus.confirmed,
        ),
        lines: (j['lines'] as List)
            .map((l) => OrderLineEntity.fromJson(l as Map<String, dynamic>))
            .toList(),
        subtotal: (j['subtotal'] as num).toDouble(),
        deliveryFee: (j['deliveryFee'] as num).toDouble(),
        createdAt: DateTime.parse(j['createdAt'] as String),
        driverName: j['driverName'] as String?,
        driverPhone: j['driverPhone'] as String?,
        driverCard: DriverCardInfo.fromJson(j),
        // Vacía cuando el servidor no la manda (el listado no la trae, y un
        // backend anterior a la bitácora tampoco): la pantalla cae entonces
        // a los pasos fijos de siempre en vez de pintar una línea en blanco.
        timeline: ((j['timeline'] as List<dynamic>?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(PasoPedido.fromJson)
            .toList(),
        paymentLabel: j['paymentLabel'] as String?,
        paymentNote: j['paymentNote'] as String?,
        cobraElRepartidor: (j['cobraElRepartidor'] as bool?) ?? false,
        promisedAt:
            DateTime.tryParse(j['promisedAt'] as String? ?? '')?.toLocal(),
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
        deliveryPin: j['deliveryPin'] as String?,
        businessLat: (j['businessLat'] as num?)?.toDouble(),
        businessLng: (j['businessLng'] as num?)?.toDouble(),
        deliveryLat: (j['deliveryLat'] as num?)?.toDouble(),
        deliveryLng: (j['deliveryLng'] as num?)?.toDouble(),
        driverLat: (j['driverLat'] as num?)?.toDouble(),
        driverLng: (j['driverLng'] as num?)?.toDouble(),
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
        driverCard: DriverCardInfo.fromJson(j),
        // Vacía cuando el servidor no la manda (el listado no la trae, y un
        // backend anterior a la bitácora tampoco): la pantalla cae entonces
        // a los pasos fijos de siempre en vez de pintar una línea en blanco.
        timeline: ((j['timeline'] as List<dynamic>?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(PasoPedido.fromJson)
            .toList(),
        paymentLabel: j['paymentLabel'] as String?,
        paymentNote: j['paymentNote'] as String?,
        cobraElRepartidor: (j['cobraElRepartidor'] as bool?) ?? false,
        promisedAt:
            DateTime.tryParse(j['promisedAt'] as String? ?? '')?.toLocal(),
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
        deliveryPin: j['deliveryPin'] as String?,
        businessLat: (j['businessLat'] as num?)?.toDouble(),
        businessLng: (j['businessLng'] as num?)?.toDouble(),
        deliveryLat: (j['deliveryLat'] as num?)?.toDouble(),
        deliveryLng: (j['deliveryLng'] as num?)?.toDouble(),
        driverLat: (j['driverLat'] as num?)?.toDouble(),
        driverLng: (j['driverLng'] as num?)?.toDouble(),
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

  /// Foto, calificación, verificación y placa del repartidor asignado.
  /// Null mientras el pedido no tiene repartidor.
  final DriverCardInfo? driverCard;

  /// ¿Hay datos reales suficientes para dibujar el mapa? Sin esto, antes se
  /// pintaba un mapa inventado a partir del hash del nombre del negocio.
  bool get hasRealGeo =>
      businessLat != null && businessLng != null && deliveryLat != null && deliveryLng != null;

  /// PIN de 4 dígitos que el cliente dicta al repartidor para recibir el
  /// pedido. Sin él, el repartidor no puede marcarlo como entregado.
  final String? deliveryPin;

  /// Geografía real del pedido. Nulas cuando el negocio no tiene punto en el
  /// mapa: la pantalla oculta el mapa en vez de dibujar uno inventado.
  final double? businessLat;
  final double? businessLng;
  final double? deliveryLat;
  final double? deliveryLng;

  /// Posición viva del repartidor (heartbeat), solo mientras lleva el pedido.
  final double? driverLat;
  final double? driverLng;

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

  /// El recorrido con su hora, armado por el servidor. Vacío cuando no llegó
  /// (listado, o un backend anterior a la bitácora).
  final List<PasoPedido> timeline;

  /// «Nequi», «Llave Bre-B», «Efectivo»… El texto lo resuelve el servidor
  /// desde su catálogo, para que añadir un método no deje un hueco en los
  /// teléfonos que no se hayan actualizado.
  final String? paymentLabel;

  /// Lo que hay que hacer al recibir: «Le transfieres al repartidor», «Ya
  /// pagado en la app».
  final String? paymentNote;

  /// Si el repartidor cobra en la puerta. Decidirlo mal cuesta plata real.
  final bool cobraElRepartidor;

  /// Cuándo se prometió la entrega. Solo en envíos a otra ciudad: ahí
  /// «30 min» no significa nada y hace falta una fecha.
  final DateTime? promisedAt;

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
    DriverCardInfo? driverCard,
    int? etaMinutes,
    int? prepMinutes,
    DateTime? acceptedAt,
    DateTime? readyAt,
    DateTime? pickedUpAt,
    DateTime? deliveredAt,
    String? pickupPhotoPath,
    String? deliveryPhotoPath,
    String? deliveryPin,
    double? businessLat,
    double? businessLng,
    double? deliveryLat,
    double? deliveryLng,
    double? driverLat,
    double? driverLng,
    bool? hasSignature,
    int? rating,
    String? ratingComment,
    DateTime? ratedAt,
    List<PasoPedido>? timeline,
    String? paymentLabel,
    String? paymentNote,
    bool? cobraElRepartidor,
    DateTime? promisedAt,
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
      // Igual que el PIN: la ficha se conserva si la actualización no la trae.
      driverCard: driverCard ?? this.driverCard,
      driverPhone: driverPhone ?? this.driverPhone,
      etaMinutes: etaMinutes ?? this.etaMinutes,
      prepMinutes: prepMinutes ?? this.prepMinutes,
      acceptedAt: acceptedAt ?? this.acceptedAt,
      readyAt: readyAt ?? this.readyAt,
      pickedUpAt: pickedUpAt ?? this.pickedUpAt,
      deliveredAt: deliveredAt ?? this.deliveredAt,
      pickupPhotoPath: pickupPhotoPath ?? this.pickupPhotoPath,
      deliveryPhotoPath: deliveryPhotoPath ?? this.deliveryPhotoPath,
      // El PIN faltaba en copyWith: como las actualizaciones en vivo NO lo
      // traen (el repartidor recibe el mismo DTO y jamás debe verlo), el
      // primer cambio de estado lo borraba y el cliente se quedaba sin PIN
      // justo cuando iba a necesitarlo.
      deliveryPin: deliveryPin ?? this.deliveryPin,
      businessLat: businessLat ?? this.businessLat,
      businessLng: businessLng ?? this.businessLng,
      deliveryLat: deliveryLat ?? this.deliveryLat,
      deliveryLng: deliveryLng ?? this.deliveryLng,
      driverLat: driverLat ?? this.driverLat,
      driverLng: driverLng ?? this.driverLng,
      hasSignature: hasSignature ?? this.hasSignature,
      rating: rating ?? this.rating,
      ratingComment: ratingComment ?? this.ratingComment,
      ratedAt: ratedAt ?? this.ratedAt,
      // Se CONSERVAN igual que el PIN y la ficha del conductor: las
      // actualizaciones en vivo no traen la bitácora ni el pago, y sin este
      // `??` el primer cambio de estado vaciaría la línea de tiempo justo
      // cuando el cliente la está mirando.
      timeline: timeline ?? this.timeline,
      paymentLabel: paymentLabel ?? this.paymentLabel,
      paymentNote: paymentNote ?? this.paymentNote,
      cobraElRepartidor: cobraElRepartidor ?? this.cobraElRepartidor,
      promisedAt: promisedAt ?? this.promisedAt,
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
        // Aplanada en las MISMAS claves del backend: fromJson la reconstruye
        // igual venga de la API o del disco.
        if (driverCard != null) ...driverCard!.toJson(),
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
        // La caché local guarda el pago y la promesa; la bitácora NO: se
        // vuelve a pedir al abrir el detalle, y guardarla congelaría una
        // línea de tiempo vieja que al reabrir parecería la de ahora.
        'paymentLabel': paymentLabel,
        'paymentNote': paymentNote,
        'cobraElRepartidor': cobraElRepartidor,
        'promisedAt': promisedAt?.toIso8601String(),
      };
}
