import 'package:nexum_driver/features/pooled/domain/entities/pooled_trip_entity.dart'
    show PooledCity;

/// Oferta de reserva intermunicipal recibida por WebSocket
/// (`intercity_request`). El conductor puede aceptarla tal cual, hacer una
/// contraoferta o rechazarla.
class IntercityRequestEntity {
  const IntercityRequestEntity({
    required this.bookingId,
    required this.requestRef,
    required this.origin,
    required this.destination,
    required this.departureTime,
    required this.seats,
    required this.offeredFare,
    required this.receivedAt,
    this.pickupAddress,
    this.dropoffAddress,
    this.notes,
    this.stops = const [],
    this.distanceKm,
    this.durationMinutes,
    this.passengerName,
    this.passengerPhone,
    this.timeoutSeconds = 30,
  });

  /// Parsea el mensaje WS completo: `{booking: {...}, route: {...}}`.
  factory IntercityRequestEntity.fromWs(Map<String, dynamic> msg) {
    final b = msg['booking'] as Map<String, dynamic>;
    final route = msg['route'] as Map<String, dynamic>?;
    return IntercityRequestEntity(
      bookingId: b['id'] as String,
      requestRef: b['requestRef'] as String? ?? '',
      origin: PooledCity.fromApi(b['origin'] as String?),
      destination: PooledCity.fromApi(b['destination'] as String?),
      departureTime:
          DateTime.tryParse(b['departureTime'] as String? ?? '') ??
              DateTime.now(),
      seats: b['seats'] as String? ?? 'one',
      offeredFare: (b['offeredFare'] as num?)?.toDouble() ?? 0,
      pickupAddress: b['pickupAddress'] as String?,
      dropoffAddress: b['dropoffAddress'] as String?,
      notes: b['notes'] as String?,
      stops: [
        for (final st in (b['stops'] as List<dynamic>? ?? const []))
          if (st is Map<String, dynamic> && st['name'] is String)
            st['name'] as String,
      ],
      distanceKm: (route?['distanceKm'] as num?)?.toDouble(),
      durationMinutes: (route?['durationMinutes'] as num?)?.toInt(),
      passengerName: msg['passengerName'] as String?,
      passengerPhone: msg['passengerPhone'] as String?,
      timeoutSeconds: (msg['timeoutSeconds'] as num?)?.toInt() ?? 30,
      receivedAt: DateTime.now(),
    );
  }

  final String bookingId;
  final String requestRef;
  final PooledCity origin;
  final PooledCity destination;
  final DateTime departureTime;

  /// `one` | `two` | `three` | `fleet` (contrato del backend).
  final String seats;
  final double offeredFare;
  final String? pickupAddress;
  final String? dropoffAddress;
  final String? notes;

  /// Paradas intermedias del trayecto ("pasa por"), en orden.
  final List<String> stops;
  final double? distanceKm;
  final int? durationMinutes;

  /// Identidad del pasajero (para saber a quién se lleva y poder coordinar la
  /// recogida). Llegan en el nivel superior del mensaje WS, no dentro de booking.
  final String? passengerName;
  final String? passengerPhone;

  final int timeoutSeconds;
  final DateTime receivedAt;

  String get seatsLabel => switch (seats) {
        'one' => '1 puesto',
        'two' => '2 puestos',
        'three' => '3 puestos',
        'fleet' => 'Vehículo completo',
        _ => seats,
      };

  String get routeLabel =>
      '${origin.displayName} → ${destination.displayName}';
}
