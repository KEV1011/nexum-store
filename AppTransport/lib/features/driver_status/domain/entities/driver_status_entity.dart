/// Estado del conductor en la plataforma.
enum DriverStatus {
  online, // En línea: disponible para recibir viajes
  offline, // Desconectado: no recibe viajes
  busy, // En viaje activo
}

/// Entidad que representa el estado completo del conductor.
class DriverStatusEntity {
  const DriverStatusEntity({
    required this.status,
    required this.dailyTrips,
    required this.dailyEarnings,
    required this.onlineSince,
    this.currentLatitude,
    this.currentLongitude,
    this.usingFallbackLocation = false,
  });

  final DriverStatus status;
  final int dailyTrips;
  final double dailyEarnings;
  final DateTime? onlineSince; // Cuándo se puso en línea hoy
  final double? currentLatitude;
  final double? currentLongitude;

  /// `true` cuando se conectó SIN un punto real de GPS (sin permiso o con el
  /// GPS apagado) y quedó anclado al centro de Pamplona como respaldo. En ese
  /// caso el despacho no lo ubica donde de verdad está.
  final bool usingFallbackLocation;

  bool get isOnline => status == DriverStatus.online;
  bool get isOffline => status == DriverStatus.offline;
  bool get isBusy => status == DriverStatus.busy;

  /// Tiempo en línea hoy (si está online)
  Duration get timeOnline {
    if (onlineSince == null) return Duration.zero;
    return DateTime.now().difference(onlineSince!);
  }

  DriverStatusEntity copyWith({
    DriverStatus? status,
    int? dailyTrips,
    double? dailyEarnings,
    DateTime? onlineSince,
    double? currentLatitude,
    double? currentLongitude,
    bool? usingFallbackLocation,
  }) {
    return DriverStatusEntity(
      status: status ?? this.status,
      dailyTrips: dailyTrips ?? this.dailyTrips,
      dailyEarnings: dailyEarnings ?? this.dailyEarnings,
      onlineSince: onlineSince ?? this.onlineSince,
      currentLatitude: currentLatitude ?? this.currentLatitude,
      currentLongitude: currentLongitude ?? this.currentLongitude,
      usingFallbackLocation:
          usingFallbackLocation ?? this.usingFallbackLocation,
    );
  }

  static DriverStatusEntity get initial => const DriverStatusEntity(
        status: DriverStatus.offline,
        dailyTrips: 0,
        dailyEarnings: 0.0,
        onlineSince: null,
      );
}
