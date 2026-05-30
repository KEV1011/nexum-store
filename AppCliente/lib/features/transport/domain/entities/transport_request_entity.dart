/// Tipos de servicio de transporte ofrecidos al cliente.
enum TransportServiceType {
  taxi,
  moto,
  particular,
  envios;

  String get label => switch (this) {
        TransportServiceType.taxi => 'Taxi',
        TransportServiceType.moto => 'Moto',
        TransportServiceType.particular => 'Particular',
        TransportServiceType.envios => 'Envíos',
      };

  String get description => switch (this) {
        TransportServiceType.taxi => 'Taxi tradicional, tarifa regulada',
        TransportServiceType.moto => 'Mototaxi rápido y económico',
        TransportServiceType.particular => 'Vehículo particular cómodo',
        TransportServiceType.envios => 'Envío de paquetes a domicilio',
      };

  double get baseFare => switch (this) {
        TransportServiceType.taxi => 4000,
        TransportServiceType.moto => 3000,
        TransportServiceType.particular => 5000,
        TransportServiceType.envios => 5000,
      };

  double get perKmRate => switch (this) {
        TransportServiceType.taxi => 800,
        TransportServiceType.moto => 600,
        TransportServiceType.particular => 1000,
        TransportServiceType.envios => 800,
      };

  double estimateFare(double distanceKm) => baseFare + distanceKm * perKmRate;
}

/// Estado del viaje o envío en tiempo real.
enum TransportStatus {
  searching,
  accepted,
  arriving,
  arrived,
  inProgress,
  completed,
  cancelled;

  String get label => switch (this) {
        TransportStatus.searching => 'Buscando conductor...',
        TransportStatus.accepted => 'Conductor asignado',
        TransportStatus.arriving => 'Conductor en camino',
        TransportStatus.arrived => 'Conductor llegó',
        TransportStatus.inProgress => 'En trayecto',
        TransportStatus.completed => 'Completado',
        TransportStatus.cancelled => 'Cancelado',
      };

  bool get isActive =>
      this != TransportStatus.completed && this != TransportStatus.cancelled;

  bool get isCompleted => this == TransportStatus.completed;

  bool get isCancelled => this == TransportStatus.cancelled;

  bool get canCancel =>
      this == TransportStatus.searching ||
      this == TransportStatus.accepted ||
      this == TransportStatus.arriving;

  int get step => switch (this) {
        TransportStatus.searching => 0,
        TransportStatus.accepted ||
        TransportStatus.arriving =>
          1,
        TransportStatus.arrived => 2,
        TransportStatus.inProgress => 3,
        TransportStatus.completed => 4,
        TransportStatus.cancelled => 0,
      };
}

/// Solicitud de transporte o envío realizada por el cliente.
class TransportRequestEntity {
  const TransportRequestEntity({
    required this.id,
    required this.requestRef,
    required this.serviceType,
    required this.originAddress,
    required this.destinationAddress,
    required this.estimatedFare,
    required this.distanceKm,
    required this.etaMinutes,
    required this.status,
    required this.createdAt,
    this.driverName,
    this.driverPhone,
    this.driverVehicle,
    this.acceptedAt,
    this.completedAt,
    this.recipientName,
    this.recipientPhone,
    this.packageDescription,
    this.rating,
    this.ratingComment,
    this.driverLat,
    this.driverLng,
  });

  factory TransportRequestEntity.fromJson(Map<String, dynamic> json) =>
      TransportRequestEntity(
        id: json['id'] as String,
        requestRef: json['requestRef'] as String,
        serviceType: TransportServiceType.values.firstWhere(
          (e) => e.name == json['serviceType'],
        ),
        originAddress: json['originAddress'] as String,
        destinationAddress: json['destinationAddress'] as String,
        estimatedFare: (json['estimatedFare'] as num).toDouble(),
        distanceKm: (json['distanceKm'] as num).toDouble(),
        etaMinutes: json['etaMinutes'] as int,
        status: TransportStatus.values.firstWhere(
          (e) => e.name == json['status'],
        ),
        createdAt: DateTime.parse(json['createdAt'] as String),
        driverName: json['driverName'] as String?,
        driverPhone: json['driverPhone'] as String?,
        driverVehicle: json['driverVehicle'] as String?,
        acceptedAt: json['acceptedAt'] != null
            ? DateTime.parse(json['acceptedAt'] as String)
            : null,
        completedAt: json['completedAt'] != null
            ? DateTime.parse(json['completedAt'] as String)
            : null,
        recipientName: json['recipientName'] as String?,
        recipientPhone: json['recipientPhone'] as String?,
        packageDescription: json['packageDescription'] as String?,
        rating: json['rating'] as int?,
        ratingComment: json['ratingComment'] as String?,
        driverLat: (json['driverLat'] as num?)?.toDouble(),
        driverLng: (json['driverLng'] as num?)?.toDouble(),
      );

  final String id;
  final String requestRef;
  final TransportServiceType serviceType;
  final String originAddress;
  final String destinationAddress;
  final double estimatedFare;
  final double distanceKm;
  final int etaMinutes;
  final TransportStatus status;
  final DateTime createdAt;
  final String? driverName;
  final String? driverPhone;
  final String? driverVehicle;
  final DateTime? acceptedAt;
  final DateTime? completedAt;
  final String? recipientName;
  final String? recipientPhone;
  final String? packageDescription;
  final int? rating;
  final String? ratingComment;
  final double? driverLat;
  final double? driverLng;

  bool get isActive => status.isActive;
  bool get isCompleted => status.isCompleted;
  bool get isCancelled => status.isCancelled;
  bool get isRated => rating != null;

  TransportRequestEntity copyWith({
    String? id,
    String? requestRef,
    TransportServiceType? serviceType,
    String? originAddress,
    String? destinationAddress,
    double? estimatedFare,
    double? distanceKm,
    int? etaMinutes,
    TransportStatus? status,
    DateTime? createdAt,
    String? driverName,
    String? driverPhone,
    String? driverVehicle,
    DateTime? acceptedAt,
    DateTime? completedAt,
    String? recipientName,
    String? recipientPhone,
    String? packageDescription,
    int? rating,
    String? ratingComment,
    double? driverLat,
    double? driverLng,
  }) {
    return TransportRequestEntity(
      id: id ?? this.id,
      requestRef: requestRef ?? this.requestRef,
      serviceType: serviceType ?? this.serviceType,
      originAddress: originAddress ?? this.originAddress,
      destinationAddress: destinationAddress ?? this.destinationAddress,
      estimatedFare: estimatedFare ?? this.estimatedFare,
      distanceKm: distanceKm ?? this.distanceKm,
      etaMinutes: etaMinutes ?? this.etaMinutes,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      driverName: driverName ?? this.driverName,
      driverPhone: driverPhone ?? this.driverPhone,
      driverVehicle: driverVehicle ?? this.driverVehicle,
      acceptedAt: acceptedAt ?? this.acceptedAt,
      completedAt: completedAt ?? this.completedAt,
      recipientName: recipientName ?? this.recipientName,
      recipientPhone: recipientPhone ?? this.recipientPhone,
      packageDescription: packageDescription ?? this.packageDescription,
      rating: rating ?? this.rating,
      ratingComment: ratingComment ?? this.ratingComment,
      driverLat: driverLat ?? this.driverLat,
      driverLng: driverLng ?? this.driverLng,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'requestRef': requestRef,
        'serviceType': serviceType.name,
        'originAddress': originAddress,
        'destinationAddress': destinationAddress,
        'estimatedFare': estimatedFare,
        'distanceKm': distanceKm,
        'etaMinutes': etaMinutes,
        'status': status.name,
        'createdAt': createdAt.toIso8601String(),
        if (driverName != null) 'driverName': driverName,
        if (driverPhone != null) 'driverPhone': driverPhone,
        if (driverVehicle != null) 'driverVehicle': driverVehicle,
        if (acceptedAt != null) 'acceptedAt': acceptedAt!.toIso8601String(),
        if (completedAt != null) 'completedAt': completedAt!.toIso8601String(),
        if (recipientName != null) 'recipientName': recipientName,
        if (recipientPhone != null) 'recipientPhone': recipientPhone,
        if (packageDescription != null) 'packageDescription': packageDescription,
        if (rating != null) 'rating': rating,
        if (ratingComment != null) 'ratingComment': ratingComment,
        if (driverLat != null) 'driverLat': driverLat,
        if (driverLng != null) 'driverLng': driverLng,
      };
}
