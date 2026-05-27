import 'dart:math';

import 'package:nexum_driver/core/mock_data/passengers_mock.dart';
import 'package:nexum_driver/core/mock_data/trips_mock.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';

/// Datasource mock para solicitudes de viaje.
///
/// Genera solicitudes aleatorias combinando [TripsMock.tripRequests]
/// con [PassengersMock.passengers]. No realiza ninguna llamada de red;
/// toda la lógica es en memoria para el MVP.
class TripRequestsDataSource {
  TripRequestsDataSource() : _random = Random();

  final Random _random;

  // ── generateMockRequest ───────────────────────────────────────────────────

  /// Genera una [TripRequestEntity] aleatoria a partir de los datasets mock.
  ///
  /// Selecciona aleatoriamente un [TripRequestData] de [TripsMock.tripRequests]
  /// y un [PassengerEntity] de [PassengersMock.passengers], combina los datos
  /// y retorna la entidad lista para mostrarse al conductor.
  Future<TripRequestEntity> generateMockRequest() async {
    // Simula latencia de red mínima
    await Future<void>.delayed(const Duration(milliseconds: 60));

    final tripData = TripsMock
        .tripRequests[_random.nextInt(TripsMock.tripRequests.length)];
    final passenger = PassengersMock
        .passengers[_random.nextInt(PassengersMock.passengers.length)];

    // Genera un ID único basado en timestamp + random para evitar colisiones
    final uniqueId =
        '${tripData.id}_${DateTime.now().millisecondsSinceEpoch}_${_random.nextInt(999)}';

    return TripRequestEntity(
      id: uniqueId,
      passenger: passenger,
      origin: LocationModel(
        latitude: tripData.originLat,
        longitude: tripData.originLng,
        address: tripData.originAddress,
      ),
      destination: LocationModel(
        latitude: tripData.destinationLat,
        longitude: tripData.destinationLng,
        address: tripData.destinationAddress,
      ),
      distanceKm: tripData.distanceKm,
      durationMinutes: tripData.durationMinutes,
      estimatedFare: tripData.estimatedFare,
      distanceToPickupKm: tripData.distanceToPickupKm,
      etaToPickupMinutes: tripData.etaToPickupMinutes,
      requestedAt: DateTime.now(),
    );
  }

  // ── acceptTrip ─────────────────────────────────────────────────────────────

  /// Acepta la solicitud de viaje. Simula confirmación del servidor.
  ///
  /// Returns la entidad actualizada con estado [TripRequestStatus.accepted].
  Future<TripRequestEntity> acceptTrip(TripRequestEntity request) async {
    await Future<void>.delayed(const Duration(milliseconds: 120));
    return request.copyWith(status: TripRequestStatus.accepted);
  }

  // ── rejectTrip ─────────────────────────────────────────────────────────────

  /// Rechaza la solicitud de viaje. No-op con delay mínimo.
  Future<void> rejectTrip(TripRequestEntity request) async {
    await Future<void>.delayed(const Duration(milliseconds: 80));
    // En el MVP no es necesario persistir el rechazo.
  }
}
