import 'package:nexum_driver/features/trip_requests/domain/entities/passenger_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';

/// Estado de una solicitud de viaje entrante.
enum TripRequestStatus {
  pending,   // Aún disponible para el conductor
  accepted,  // El conductor la aceptó
  rejected,  // El conductor la rechazó
  expired,   // Tiempo de respuesta agotado
}

/// Entidad de dominio que representa una solicitud de viaje entrante.
/// Es el punto de partida para la transición al viaje activo.
class TripRequestEntity {
  const TripRequestEntity({
    required this.id,
    required this.passenger,
    required this.origin,
    required this.destination,
    required this.distanceKm,
    required this.durationMinutes,
    required this.estimatedFare,
    required this.distanceToPickupKm,
    required this.etaToPickupMinutes,
    this.status = TripRequestStatus.pending,
    this.requestedAt,
  });

  /// Identificador único de la solicitud.
  final String id;

  /// Pasajero que solicita el viaje.
  final PassengerEntity passenger;

  /// Punto de recogida del pasajero.
  final LocationModel origin;

  /// Destino final del pasajero.
  final LocationModel destination;

  /// Distancia total del viaje en kilómetros.
  final double distanceKm;

  /// Duración estimada del viaje en minutos.
  final int durationMinutes;

  /// Tarifa estimada en COP.
  final double estimatedFare;

  /// Distancia del conductor al punto de recogida (km).
  final double distanceToPickupKm;

  /// Tiempo estimado del conductor al punto de recogida (minutos).
  final int etaToPickupMinutes;

  /// Estado actual de la solicitud.
  final TripRequestStatus status;

  /// Momento en que se generó la solicitud.
  final DateTime? requestedAt;

  bool get isPending => status == TripRequestStatus.pending;
  bool get isAccepted => status == TripRequestStatus.accepted;

  TripRequestEntity copyWith({
    String? id,
    PassengerEntity? passenger,
    LocationModel? origin,
    LocationModel? destination,
    double? distanceKm,
    int? durationMinutes,
    double? estimatedFare,
    double? distanceToPickupKm,
    int? etaToPickupMinutes,
    TripRequestStatus? status,
    DateTime? requestedAt,
  }) {
    return TripRequestEntity(
      id: id ?? this.id,
      passenger: passenger ?? this.passenger,
      origin: origin ?? this.origin,
      destination: destination ?? this.destination,
      distanceKm: distanceKm ?? this.distanceKm,
      durationMinutes: durationMinutes ?? this.durationMinutes,
      estimatedFare: estimatedFare ?? this.estimatedFare,
      distanceToPickupKm: distanceToPickupKm ?? this.distanceToPickupKm,
      etaToPickupMinutes: etaToPickupMinutes ?? this.etaToPickupMinutes,
      status: status ?? this.status,
      requestedAt: requestedAt ?? this.requestedAt,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TripRequestEntity &&
          runtimeType == other.runtimeType &&
          id == other.id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() =>
      'TripRequestEntity(id: $id, passenger: ${passenger.name}, '
      'fare: $estimatedFare, distance: ${distanceKm}km)';
}
