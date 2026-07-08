import 'package:nexum_driver/core/utils/fare_calculator.dart';
import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

/// Fuente de datos mock para viajes activos.
///
/// Simula las transiciones de estado del viaje con pequeños delays para
/// imitar latencia de red realista durante desarrollo.
class ActiveTripDataSource {
  /// (a) Inicia la navegación al punto de recogida del pasajero.
  ///
  /// Crea un [ActiveTripEntity] con estado [ActiveTripState.toPickup].
  Future<ActiveTripEntity> startNavigationToPickup(
    TripRequestEntity request,
  ) async {
    await Future.delayed(const Duration(milliseconds: 400));

    return ActiveTripEntity(
      request: request.copyWith(status: TripRequestStatus.accepted),
      state: ActiveTripState.toPickup,
      startedAt: DateTime.now(),
    );
  }

  /// (b) Registra la llegada al punto de recogida.
  ///
  /// Transiciona a [ActiveTripState.waiting] y establece [pickedUpAt].
  Future<ActiveTripEntity> arriveAtPassenger(ActiveTripEntity trip) async {
    await Future.delayed(const Duration(milliseconds: 300));

    return trip.copyWith(
      state: ActiveTripState.waiting,
      pickedUpAt: DateTime.now(),
      waitingSeconds: 0,
    );
  }

  /// (c) Inicia el viaje (pasajero a bordo).
  ///
  /// Transiciona a [ActiveTripState.inProgress] y establece [tripStartedAt].
  Future<ActiveTripEntity> startTrip(ActiveTripEntity trip) async {
    await Future.delayed(const Duration(milliseconds: 300));

    final initialFare = FareCalculator.calculateFare(
      distanceKm: trip.request.distanceKm,
      durationMinutes: 0,
    );

    return trip.copyWith(
      state: ActiveTripState.inProgress,
      tripStartedAt: DateTime.now(),
      elapsedTripMinutes: 0,
      accumulatedFare: initialFare,
    );
  }

  /// Finaliza el viaje y calcula la tarifa real.
  ///
  /// Usa [trip.request.distanceKm] y el tiempo real transcurrido desde
  /// [tripStartedAt] para calcular la tarifa final con comisión del 15 %.
  Future<TripModel> finishTrip(ActiveTripEntity trip) async {
    await Future.delayed(const Duration(milliseconds: 600));

    final now = DateTime.now();
    final tripStart = trip.tripStartedAt ?? trip.startedAt;

    // Calcular minutos reales transcurridos
    final actualMinutes = now.difference(tripStart).inMinutes.clamp(
          trip.request.durationMinutes,
          trip.request.durationMinutes + 15,
        );

    final grossFare = FareCalculator.calculateFare(
      distanceKm: trip.request.distanceKm,
      durationMinutes: actualMinutes,
    );
    final commission = FareCalculator.calculateCommission(grossFare);
    final netEarning = FareCalculator.calculateNetEarning(grossFare);

    return TripModel(
      // El id real del backend: permite casar la liquidación que llega por
      // WS (`trip_status_ack.settlement`) en la pantalla de resumen.
      id: trip.request.id,
      passengerId: trip.request.passenger.id,
      passengerName: trip.request.passenger.name,
      origin: trip.request.origin,
      destination: trip.request.destination,
      distanceKm: trip.request.distanceKm,
      durationMinutes: actualMinutes,
      grossFare: grossFare,
      netEarning: netEarning,
      commission: commission,
      startedAt: tripStart,
      finishedAt: now,
      pickupPhotoPath: trip.pickupPhotoPath,
      pickupOrderRef: trip.pickupOrderRef,
      // En envíos el pedido sale del local al iniciar el viaje.
      pickedUpAt: trip.pickupPhotoPath != null ? tripStart : null,
    );
  }
}
