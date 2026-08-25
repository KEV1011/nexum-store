// `export` re-expone la clase a quien importe este archivo, pero NO la trae
// a este ámbito: hace falta el import además del export.
import 'package:latlong2/latlong.dart';

import 'package:nexum_client/core/utils/eta_vivo.dart';
import 'package:nexum_client/shared/models/driver_card_info.dart';

export 'package:nexum_client/shared/models/driver_card_info.dart';

/// Respuesta del endpoint GET /client/trips/estimate.
class FareEstimate {
  const FareEstimate({
    required this.baseFare,
    required this.suggestedFare,
    required this.surgeMultiplier,
    required this.isSurge,
    required this.demand,
    required this.supply,
  });

  factory FareEstimate.fromJson(Map<String, dynamic> json) => FareEstimate(
        baseFare: (json['baseFare'] as num).toDouble(),
        suggestedFare: (json['suggestedFare'] as num).toDouble(),
        surgeMultiplier: (json['surgeMultiplier'] as num).toDouble(),
        isSurge: json['isSurge'] as bool,
        demand: (json['demand'] as num).toInt(),
        supply: (json['supply'] as num).toInt(),
      );

  final double baseFare;
  final double suggestedFare;
  final double surgeMultiplier;
  final bool isSurge;
  final int demand;
  final int supply;
}

/// Tipos de servicio de transporte ofrecidos al cliente.
enum TransportServiceType {
  transporte,
  moto,
  envios;

  String get label => switch (this) {
        TransportServiceType.transporte => 'Transporte',
        TransportServiceType.moto => 'Moto',
        TransportServiceType.envios => 'Envíos',
      };

  String get description => switch (this) {
        TransportServiceType.transporte => 'Carro o taxi, cómodo y seguro',
        TransportServiceType.moto => 'Mototaxi rápido y económico',
        TransportServiceType.envios => 'Paquetes, compras y diligencias',
      };

  double get baseFare => switch (this) {
        TransportServiceType.transporte => 4000,
        TransportServiceType.moto => 3000,
        TransportServiceType.envios => 5000,
      };

  double get perKmRate => switch (this) {
        TransportServiceType.transporte => 900,
        TransportServiceType.moto => 600,
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
    this.deliveryPin,
    required this.originAddress,
    required this.destinationAddress,
    required this.estimatedFare,
    this.finalFare,
    required this.distanceKm,
    required this.etaMinutes,
    required this.status,
    required this.createdAt,
    this.driverName,
    this.driverPhone,
    this.maskedPhone,
    this.contactChannel,
    this.driverVehicle,
    this.driverVehicleType,
    this.stops = const [],
    this.driverCard,
    this.acceptedAt,
    this.completedAt,
    this.recipientName,
    this.recipientPhone,
    this.packageDescription,
    this.rating,
    this.ratingComment,
    this.driverLat,
    this.driverLng,
    this.originLat,
    this.originLng,
    this.destLat,
    this.destLng,
  });

  factory TransportRequestEntity.fromJson(Map<String, dynamic> json) =>
      TransportRequestEntity(
        id: json['id'] as String,
        requestRef: json['requestRef'] as String,
        // Parsing defensivo: el backend usa 'taxi'/'particular' para el
        // servicio que la app llama 'transporte', y 'mandado' viaja como envío.
        deliveryPin: json['deliveryPin'] as String?,
        serviceType: TransportServiceType.values.firstWhere(
          (e) => e.name == json['serviceType'],
          orElse: () => switch (json['serviceType']) {
            'taxi' || 'particular' => TransportServiceType.transporte,
            'mandado' => TransportServiceType.envios,
            _ => TransportServiceType.transporte,
          },
        ),
        originAddress: json['originAddress'] as String,
        destinationAddress: json['destinationAddress'] as String,
        estimatedFare: (json['estimatedFare'] as num).toDouble(),
        finalFare: (json['finalFare'] as num?)?.toDouble(),
        distanceKm: (json['distanceKm'] as num).toDouble(),
        etaMinutes: json['etaMinutes'] as int,
        status: TransportStatus.values.firstWhere(
          (e) => e.name == json['status'],
          orElse: () => switch (json['status']) {
            'in_progress' => TransportStatus.inProgress,
            _ => TransportStatus.searching,
          },
        ),
        createdAt: DateTime.parse(json['createdAt'] as String),
        driverName: json['driverName'] as String?,
        driverPhone: json['driverPhone'] as String?,
        maskedPhone: json['maskedPhone'] as String?,
        contactChannel: json['contactChannel'] as String?,
        driverVehicle: json['driverVehicle'] as String?,
        driverVehicleType: json['driverVehicleType'] as String?,
        stops: ((json['stops'] as List<dynamic>?) ?? const [])
            .map((e) => (e as Map<String, dynamic>)['name']?.toString() ?? '')
            .where((n) => n.isNotEmpty)
            .toList(),
        driverCard: DriverCardInfo.fromJson(json),
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
        originLat: (json['originLat'] as num?)?.toDouble(),
        originLng: (json['originLng'] as num?)?.toDouble(),
        destLat: (json['destLat'] as num?)?.toDouble(),
        destLng: (json['destLng'] as num?)?.toDouble(),
      );

  final String id;
  final String requestRef;
  final TransportServiceType serviceType;

  /// PIN que dicta quien RECIBE el envío. Solo lo genera el backend para
  /// ENVIOS: sin él el repartidor no puede cerrar la entrega, y es lo que
  /// prueba que el paquete llegó a su destinatario.
  final String? deliveryPin;
  final String originAddress;
  final String destinationAddress;
  /// Lo que se estimó al pedir el viaje. Es una previsión, no un cobro.
  final double estimatedFare;

  /// Lo que se cobró de verdad, sellado por el backend al completar el viaje.
  ///
  /// Null mientras el viaje no termina. El backend lo calcula y lo mandaba
  /// desde hace tiempo en el DTO, pero la app no lo leía: al terminar el viaje
  /// el pasajero seguía viendo la ESTIMACIÓN del principio, que se calcula con
  /// otra fórmula y por tanto casi nunca coincide con lo que paga.
  final double? finalFare;

  /// El importe que hay que enseñar: el cobrado si ya está, la estimación
  /// mientras tanto.
  double get displayFare => finalFare ?? estimatedFare;
  final double distanceKm;
  final int etaMinutes;
  final TransportStatus status;
  final DateTime createdAt;
  final String? driverName;
  final String? driverPhone;
  final String? maskedPhone;
  final String? contactChannel;
  final String? driverVehicle;

  /// Tipo REAL del vehículo asignado (PARTICULAR|TAXI|MOTO|TURBO|CAMION|MULA)
  /// — decide el ícono ilustrado del mapa.
  final String? driverVehicleType;

  /// Paradas intermedias del trayecto, en orden. Solo los nombres: las
  /// coordenadas ya las usó el servidor para medir y cobrar.
  final List<String> stops;

  /// Foto, calificación, verificación y placa del conductor asignado.
  /// Null mientras se busca conductor.
  final DriverCardInfo? driverCard;
  final DateTime? acceptedAt;
  final DateTime? completedAt;
  final String? recipientName;
  final String? recipientPhone;
  final String? packageDescription;
  final int? rating;
  final String? ratingComment;
  final double? driverLat;
  final double? driverLng;
  // Coordenadas reales del origen/destino resueltas por el autocompletado.
  // Null = el cliente escribió texto libre; el mapa cae a una posición
  // aproximada por hash de la dirección.
  final double? originLat;
  final double? originLng;
  final double? destLat;
  final double? destLng;

  bool get isActive => status.isActive;
  bool get isCompleted => status.isCompleted;
  bool get isCancelled => status.isCancelled;
  bool get isRated => rating != null;

  TransportRequestEntity copyWith({
    String? id,
    String? requestRef,
    TransportServiceType? serviceType,
    String? deliveryPin,
    String? originAddress,
    String? destinationAddress,
    double? estimatedFare,
    double? finalFare,
    double? distanceKm,
    int? etaMinutes,
    TransportStatus? status,
    DateTime? createdAt,
    String? driverName,
    String? driverPhone,
    String? maskedPhone,
    String? contactChannel,
    String? driverVehicle,
    String? driverVehicleType,
    List<String>? stops,
    DriverCardInfo? driverCard,
    DateTime? acceptedAt,
    DateTime? completedAt,
    String? recipientName,
    String? recipientPhone,
    String? packageDescription,
    int? rating,
    String? ratingComment,
    double? driverLat,
    double? driverLng,
    double? originLat,
    double? originLng,
    double? destLat,
    double? destLng,
  }) {
    return TransportRequestEntity(
      id: id ?? this.id,
      requestRef: requestRef ?? this.requestRef,
      serviceType: serviceType ?? this.serviceType,
      deliveryPin: deliveryPin ?? this.deliveryPin,
      originAddress: originAddress ?? this.originAddress,
      destinationAddress: destinationAddress ?? this.destinationAddress,
      estimatedFare: estimatedFare ?? this.estimatedFare,
      finalFare: finalFare ?? this.finalFare,
      distanceKm: distanceKm ?? this.distanceKm,
      etaMinutes: etaMinutes ?? this.etaMinutes,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      driverName: driverName ?? this.driverName,
      driverPhone: driverPhone ?? this.driverPhone,
      maskedPhone: maskedPhone ?? this.maskedPhone,
      contactChannel: contactChannel ?? this.contactChannel,
      driverVehicle: driverVehicle ?? this.driverVehicle,
      driverVehicleType: driverVehicleType ?? this.driverVehicleType,
      stops: stops ?? this.stops,
      driverCard: driverCard ?? this.driverCard,
      acceptedAt: acceptedAt ?? this.acceptedAt,
      completedAt: completedAt ?? this.completedAt,
      recipientName: recipientName ?? this.recipientName,
      recipientPhone: recipientPhone ?? this.recipientPhone,
      packageDescription: packageDescription ?? this.packageDescription,
      rating: rating ?? this.rating,
      ratingComment: ratingComment ?? this.ratingComment,
      driverLat: driverLat ?? this.driverLat,
      driverLng: driverLng ?? this.driverLng,
      originLat: originLat ?? this.originLat,
      originLng: originLng ?? this.originLng,
      destLat: destLat ?? this.destLat,
      destLng: destLng ?? this.destLng,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'requestRef': requestRef,
        'serviceType': serviceType.name,
        'originAddress': originAddress,
        'destinationAddress': destinationAddress,
        'estimatedFare': estimatedFare,
        if (finalFare != null) 'finalFare': finalFare,
        'distanceKm': distanceKm,
        'etaMinutes': etaMinutes,
        'status': status.name,
        'createdAt': createdAt.toIso8601String(),
        // Sin esto el PIN del envío se perdía al cerrar la app: se guardaba el
        // viaje pero no el dato que permite cerrar la entrega.
        if (deliveryPin != null) 'deliveryPin': deliveryPin,
        if (driverName != null) 'driverName': driverName,
        if (driverPhone != null) 'driverPhone': driverPhone,
        if (maskedPhone != null) 'maskedPhone': maskedPhone,
        if (contactChannel != null) 'contactChannel': contactChannel,
        if (driverVehicle != null) 'driverVehicle': driverVehicle,
        if (driverVehicleType != null) 'driverVehicleType': driverVehicleType,
        // La ficha se aplana en las MISMAS claves del backend, para que
        // `fromJson` la reconstruya igual venga de la API o del disco.
        if (driverCard != null) ...driverCard!.toJson(),
        if (acceptedAt != null) 'acceptedAt': acceptedAt!.toIso8601String(),
        if (completedAt != null) 'completedAt': completedAt!.toIso8601String(),
        if (recipientName != null) 'recipientName': recipientName,
        if (recipientPhone != null) 'recipientPhone': recipientPhone,
        if (packageDescription != null) 'packageDescription': packageDescription,
        if (rating != null) 'rating': rating,
        if (ratingComment != null) 'ratingComment': ratingComment,
        if (driverLat != null) 'driverLat': driverLat,
        if (driverLng != null) 'driverLng': driverLng,
        if (originLat != null) 'originLat': originLat,
        if (originLng != null) 'originLng': originLng,
        if (destLat != null) 'destLat': destLat,
        if (destLng != null) 'destLng': destLng,
      };
}

/// El ETA que se le enseña a la persona.
extension TransportEtaVivo on TransportRequestEntity {
  /// ¿Va el pasajero (o el paquete) ya dentro del vehículo?
  bool get aBordo => status == TransportStatus.inProgress;

  /// A dónde se dirige el conductor AHORA: al punto de recogida mientras va
  /// por el pasajero, al destino cuando ya lo lleva.
  LatLng? get _objetivo {
    if (aBordo) {
      return (destLat != null && destLng != null)
          ? LatLng(destLat!, destLng!)
          : null;
    }
    return (originLat != null && originLng != null)
        ? LatLng(originLat!, originLng!)
        : null;
  }

  /// Minutos que faltan de verdad, recalculados con cada posición que llega
  /// del conductor.
  ///
  /// Cae al ETA del servidor cuando todavía no hay posición —buscando
  /// conductor, o el GPS aún sin fijar—, que es exactamente lo que se mostraba
  /// antes y sigue siendo lo mejor que se puede decir en ese momento.
  int get etaVivoMin {
    final conductor = (driverLat != null && driverLng != null)
        ? LatLng(driverLat!, driverLng!)
        : null;
    return etaEnVivoMin(
          conductor: conductor,
          destino: _objetivo,
          aBordo: aBordo,
          etaTotalMin: etaMinutes,
          distanciaTotalKm: distanceKm,
        ) ??
        etaMinutes;
  }
}
