import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';

/// Estado de un viaje activo.
enum ActiveTripState {
  toPickup,    // (a) Conductor yendo al punto de recogida
  waiting,     // (b) Conductor esperando al pasajero en el punto de recogida
  inProgress,  // (c) Viaje en curso hacia el destino
}

/// Entidad de viaje activo. Evoluciona a través de 3 estados secuenciales.
class ActiveTripEntity {
  const ActiveTripEntity({
    required this.request,
    required this.state,
    required this.startedAt,
    this.pickedUpAt,
    this.tripStartedAt,
    this.waitingSeconds = 0,
    this.accumulatedFare = 0.0,
    this.elapsedTripMinutes = 0,
  });

  final TripRequestEntity request;
  final ActiveTripState state;
  final DateTime startedAt;       // Cuando el conductor aceptó
  final DateTime? pickedUpAt;     // Cuando llegó al pasajero
  final DateTime? tripStartedAt;  // Cuando inició el viaje
  final int waitingSeconds;       // Segundos esperando al pasajero
  final double accumulatedFare;   // Tarifa acumulada en tiempo real
  final int elapsedTripMinutes;   // Minutos transcurridos del viaje

  bool get isToPickup => state == ActiveTripState.toPickup;
  bool get isWaiting => state == ActiveTripState.waiting;
  bool get isInProgress => state == ActiveTripState.inProgress;

  ActiveTripEntity copyWith({
    TripRequestEntity? request,
    ActiveTripState? state,
    DateTime? startedAt,
    DateTime? pickedUpAt,
    DateTime? tripStartedAt,
    int? waitingSeconds,
    double? accumulatedFare,
    int? elapsedTripMinutes,
  }) {
    return ActiveTripEntity(
      request: request ?? this.request,
      state: state ?? this.state,
      startedAt: startedAt ?? this.startedAt,
      pickedUpAt: pickedUpAt ?? this.pickedUpAt,
      tripStartedAt: tripStartedAt ?? this.tripStartedAt,
      waitingSeconds: waitingSeconds ?? this.waitingSeconds,
      accumulatedFare: accumulatedFare ?? this.accumulatedFare,
      elapsedTripMinutes: elapsedTripMinutes ?? this.elapsedTripMinutes,
    );
  }
}
