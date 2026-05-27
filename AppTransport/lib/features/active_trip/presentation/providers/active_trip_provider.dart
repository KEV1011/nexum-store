import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/core/utils/fare_calculator.dart';
import 'package:nexum_driver/features/active_trip/data/datasources/active_trip_datasource.dart';
import 'package:nexum_driver/features/active_trip/data/repositories/active_trip_repository_impl.dart';
import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';
import 'package:nexum_driver/features/active_trip/domain/usecases/arrive_at_passenger_usecase.dart';
import 'package:nexum_driver/features/active_trip/domain/usecases/finish_trip_usecase.dart';
import 'package:nexum_driver/features/active_trip/domain/usecases/start_trip_usecase.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

// ── Infrastructure providers ─────────────────────────────────────────────────

final _activeTripDataSourceProvider = Provider<ActiveTripDataSource>((ref) {
  return ActiveTripDataSource();
});

final _activeTripRepositoryProvider =
    Provider<ActiveTripRepositoryImpl>((ref) {
  return ActiveTripRepositoryImpl(
    dataSource: ref.watch(_activeTripDataSourceProvider),
  );
});

final _arriveAtPassengerUseCaseProvider =
    Provider<ArriveAtPassengerUseCase>((ref) {
  return ArriveAtPassengerUseCase(ref.watch(_activeTripRepositoryProvider));
});

final _startTripUseCaseProvider = Provider<StartTripUseCase>((ref) {
  return StartTripUseCase(ref.watch(_activeTripRepositoryProvider));
});

final _finishTripUseCaseProvider = Provider<FinishTripUseCase>((ref) {
  return FinishTripUseCase(ref.watch(_activeTripRepositoryProvider));
});

// ── ActiveTripNotifier ────────────────────────────────────────────────────────

/// Notifier que gestiona el ciclo de vida completo de un viaje activo.
///
/// Estados posibles del viaje:
///   null        → sin viaje activo
///   toPickup    → conductor yendo al punto de recogida
///   waiting     → conductor esperando al pasajero
///   inProgress  → viaje en curso hacia el destino
class ActiveTripNotifier extends StateNotifier<ActiveTripEntity?> {
  ActiveTripNotifier({
    required ActiveTripRepositoryImpl repository,
    required ArriveAtPassengerUseCase arriveAtPassengerUseCase,
    required StartTripUseCase startTripUseCase,
    required FinishTripUseCase finishTripUseCase,
  })  : _repository = repository,
        _arriveAtPassengerUseCase = arriveAtPassengerUseCase,
        _startTripUseCase = startTripUseCase,
        _finishTripUseCase = finishTripUseCase,
        super(null);

  final ActiveTripRepositoryImpl _repository;
  final ArriveAtPassengerUseCase _arriveAtPassengerUseCase;
  final StartTripUseCase _startTripUseCase;
  final FinishTripUseCase _finishTripUseCase;

  /// Timer que actualiza la tarifa acumulada y los minutos transcurridos
  /// cada 30 segundos mientras el viaje está en progreso.
  Timer? _fareAccumulationTimer;

  /// Timer secundario que incrementa los segundos de espera (state: waiting).
  Timer? _waitingTimer;

  // ── beginTrip ─────────────────────────────────────────────────────────────

  /// Inicia el viaje activo desde una solicitud aceptada.
  ///
  /// Transiciona de null → [ActiveTripState.toPickup].
  Future<void> beginTrip(TripRequestEntity request) async {
    final entity = await _repository.startNavigationToPickup(request);
    state = entity;
  }

  // ── arrivedAtPassenger ────────────────────────────────────────────────────

  /// Registra que el conductor llegó al punto de recogida.
  ///
  /// Transiciona [ActiveTripState.toPickup] → [ActiveTripState.waiting].
  /// Inicia el cronómetro de espera.
  Future<void> arrivedAtPassenger() async {
    final current = state;
    if (current == null) return;

    final updated = await _arriveAtPassengerUseCase(current);
    state = updated;

    _startWaitingTimer();
  }

  // ── startTrip ─────────────────────────────────────────────────────────────

  /// Inicia el viaje con el pasajero a bordo.
  ///
  /// Transiciona [ActiveTripState.waiting] → [ActiveTripState.inProgress].
  /// Detiene el timer de espera e inicia la acumulación de tarifa.
  Future<void> startTrip() async {
    final current = state;
    if (current == null) return;

    _stopWaitingTimer();

    final updated = await _startTripUseCase(current);
    state = updated;

    _startFareAccumulationTimer();
  }

  // ── finishTrip ────────────────────────────────────────────────────────────

  /// Finaliza el viaje activo y retorna el [TripModel] con la tarifa real.
  ///
  /// Detiene todos los timers y establece el estado a null.
  Future<TripModel> finishTrip() async {
    final current = state;
    if (current == null) {
      throw StateError('No hay viaje activo para finalizar');
    }

    _stopFareAccumulationTimer();
    _stopWaitingTimer();

    final tripModel = await _finishTripUseCase(current);
    state = null;

    return tripModel;
  }

  // ── Timers ─────────────────────────────────────────────────────────────────

  /// Inicia el timer de acumulación de tarifa.
  /// Se dispara cada 30 segundos para actualizar [accumulatedFare] y
  /// [elapsedTripMinutes] usando [FareCalculator.calculateFare].
  void _startFareAccumulationTimer() {
    _stopFareAccumulationTimer();

    _fareAccumulationTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) {
        final current = state;
        if (current == null || !current.isInProgress) {
          _stopFareAccumulationTimer();
          return;
        }

        final newElapsedMinutes = current.elapsedTripMinutes + 1;
        final newFare = FareCalculator.calculateFare(
          distanceKm: current.request.distanceKm,
          durationMinutes: newElapsedMinutes,
        );

        state = current.copyWith(
          elapsedTripMinutes: newElapsedMinutes,
          accumulatedFare: newFare,
        );
      },
    );
  }

  /// Inicia el timer de espera del pasajero (incrementa cada segundo).
  void _startWaitingTimer() {
    _stopWaitingTimer();

    _waitingTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) {
        final current = state;
        if (current == null || !current.isWaiting) {
          _stopWaitingTimer();
          return;
        }

        state = current.copyWith(
          waitingSeconds: current.waitingSeconds + 1,
        );
      },
    );
  }

  void _stopFareAccumulationTimer() {
    _fareAccumulationTimer?.cancel();
    _fareAccumulationTimer = null;
  }

  void _stopWaitingTimer() {
    _waitingTimer?.cancel();
    _waitingTimer = null;
  }

  @override
  void dispose() {
    _stopFareAccumulationTimer();
    _stopWaitingTimer();
    super.dispose();
  }
}

// ── Public providers ──────────────────────────────────────────────────────────

/// Proveedor principal del viaje activo.
///
/// Retorna null cuando no hay viaje en curso, o la [ActiveTripEntity]
/// que representa el estado actual del viaje.
final activeTripProvider =
    StateNotifierProvider<ActiveTripNotifier, ActiveTripEntity?>((ref) {
  return ActiveTripNotifier(
    repository: ref.watch(_activeTripRepositoryProvider),
    arriveAtPassengerUseCase: ref.watch(_arriveAtPassengerUseCaseProvider),
    startTripUseCase: ref.watch(_startTripUseCaseProvider),
    finishTripUseCase: ref.watch(_finishTripUseCaseProvider),
  );
});

/// Proveedor derivado: retorna `true` si hay un viaje activo en curso.
final hasActiveTripProvider = Provider<bool>((ref) {
  return ref.watch(activeTripProvider) != null;
});
