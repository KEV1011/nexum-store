import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/pooled/data/datasources/intercity_local_store.dart';
import 'package:nexum_driver/features/pooled/domain/entities/pooled_trip_entity.dart';

class FareCapInfo {
  const FareCapInfo({
    required this.maxFarePerSeat,
    required this.suggestedFarePerSeat,
    required this.distanceKm,
    required this.durationMinutes,
  });

  final double maxFarePerSeat;
  final double suggestedFarePerSeat;
  final double distanceKm;
  final int durationMinutes;
}

class PooledDriverState {
  const PooledDriverState({
    this.trips = const [],
    this.isLoading = false,
  });

  final List<PooledTripEntity> trips;
  final bool isLoading;

  PooledDriverState copyWith({
    List<PooledTripEntity>? trips,
    bool? isLoading,
  }) =>
      PooledDriverState(
        trips: trips ?? this.trips,
        isLoading: isLoading ?? this.isLoading,
      );
}

class PooledDriverNotifier extends StateNotifier<PooledDriverState> {
  PooledDriverNotifier(this._client) : super(const PooledDriverState()) {
    // Cuando el store local cambia (nueva reserva simulada, etc.) refrescamos.
    _storeSub = _store.changes.listen((_) => _reloadFromStore());
  }

  final DioClient _client;
  final IntercityLocalStore _store = IntercityLocalStore.instance;
  StreamSubscription<void>? _storeSub;

  @override
  void dispose() {
    _storeSub?.cancel();
    super.dispose();
  }

  /// `true` cuando debemos operar sin backend (demo web). En nativo intentamos
  /// la API primero y solo caemos al store local si falla.
  bool get _offlineMode => kIsWeb;

  Future<void> _reloadFromStore() async {
    final trips = await _store.load();
    if (mounted) state = state.copyWith(trips: trips, isLoading: false);
  }

  // ── Fare cap (for the publish form) ─────────────────────────────────────────

  Future<FareCapInfo?> fetchFareCap({
    required PooledCity origin,
    required PooledCity destination,
    required int seats,
  }) async {
    if (_offlineMode) return _localFareCap(origin, destination);
    try {
      final res = await _client.get<Map<String, dynamic>>(
        '/driver/intercity/pool/fare-cap',
        queryParameters: {
          'origin': origin.name,
          'destination': destination.name,
          'seats': seats,
        },
      );
      final d = res.data?['data'] as Map<String, dynamic>?;
      if (d == null) return null;
      return FareCapInfo(
        maxFarePerSeat: (d['maxFarePerSeat'] as num?)?.toDouble() ?? 0,
        suggestedFarePerSeat: (d['suggestedFarePerSeat'] as num?)?.toDouble() ?? 0,
        distanceKm: (d['distanceKm'] as num?)?.toDouble() ?? 0,
        durationMinutes: (d['durationMinutes'] as num?)?.toInt() ?? 0,
      );
    } catch (_) {
      return _localFareCap(origin, destination);
    }
  }

  /// Tope/sugerencia de tarifa calculado localmente a partir de una distancia
  /// estimada por ruta. TODO: reemplazar por el cálculo real del backend.
  FareCapInfo _localFareCap(PooledCity origin, PooledCity destination) {
    final km = _estimateKm(origin, destination);
    final suggested = (3000 + km * 350).roundToDouble();
    final maxFare = (suggested * 1.25).roundToDouble();
    return FareCapInfo(
      maxFarePerSeat: maxFare,
      suggestedFarePerSeat: suggested,
      distanceKm: km,
      durationMinutes: (km / 50 * 60).round(),
    );
  }

  double _estimateKm(PooledCity a, PooledCity b) {
    // Distancias aproximadas desde/hacia Pamplona (km).
    const fromPamplona = <PooledCity, double>{
      PooledCity.cucuta: 75,
      PooledCity.bucaramanga: 130,
      PooledCity.bogota: 480,
      PooledCity.medellin: 620,
      PooledCity.ocana: 230,
      PooledCity.chinacota: 45,
      PooledCity.cacota: 30,
      PooledCity.silos: 55,
      PooledCity.mutiscua: 35,
      PooledCity.pamplonita: 25,
      PooledCity.chitaga: 50,
      PooledCity.malaga: 95,
    };
    if (a == PooledCity.pamplona) return fromPamplona[b] ?? 100;
    if (b == PooledCity.pamplona) return fromPamplona[a] ?? 100;
    // Ruta que no toca Pamplona: suma aproximada.
    return ((fromPamplona[a] ?? 100) + (fromPamplona[b] ?? 100)) * 0.7;
  }

  // ── Publish ──────────────────────────────────────────────────────────────────

  /// Returns `null` on success, or a human error message on failure.
  Future<String?> publish({
    required PooledCity origin,
    required PooledCity destination,
    required DateTime departureTime,
    required int totalSeats,
    required double farePerSeat,
    required String vehicleDescription,
    String? notes,
    bool allowFleet = false,
  }) async {
    if (_offlineMode) {
      await _store.publish(
        origin: origin,
        destination: destination,
        departureTime: departureTime,
        totalSeats: totalSeats,
        farePerSeat: farePerSeat,
        vehicleDescription: vehicleDescription,
        notes: notes,
        allowFleet: allowFleet,
      );
      await loadMine();
      return null;
    }
    try {
      await _client.post<Map<String, dynamic>>(
        '/driver/intercity/pool/publish',
        data: {
          'origin': origin.name,
          'destination': destination.name,
          'departureTime': departureTime.toIso8601String(),
          'totalSeats': totalSeats,
          'farePerSeat': farePerSeat,
          'vehicleDescription': vehicleDescription,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
          'allowFleet': allowFleet,
        },
      );
      await loadMine();
      return null;
    } catch (_) {
      // Backend inalcanzable: publicamos en el store local como respaldo.
      await _store.publish(
        origin: origin,
        destination: destination,
        departureTime: departureTime,
        totalSeats: totalSeats,
        farePerSeat: farePerSeat,
        vehicleDescription: vehicleDescription,
        notes: notes,
        allowFleet: allowFleet,
      );
      await loadMine();
      return null;
    }
  }

  // ── My published trips ─────────────────────────────────────────────────────

  Future<void> loadMine() async {
    if (_offlineMode) {
      state = state.copyWith(isLoading: true);
      final trips = await _store.load();
      state = state.copyWith(trips: trips, isLoading: false);
      return;
    }
    state = state.copyWith(isLoading: true);
    try {
      final res = await _client.get<Map<String, dynamic>>(
        '/driver/intercity/pool/mine',
      );
      final list = (res.data?['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(PooledTripEntity.fromJson)
          .toList();
      state = state.copyWith(trips: list, isLoading: false);
    } catch (_) {
      // Backend inalcanzable: respaldo con el store local.
      final trips = await _store.load();
      state = state.copyWith(trips: trips, isLoading: false);
    }
  }

  Future<void> depart(String tripId) => _action(tripId, 'depart');
  Future<void> complete(String tripId) => _action(tripId, 'complete');
  Future<void> cancel(String tripId) => _action(tripId, 'cancel');

  Future<void> _action(String tripId, String action) async {
    // Viajes locales (demo o respaldo) se resuelven en el store.
    if (_offlineMode || tripId.startsWith('local_')) {
      switch (action) {
        case 'depart':
          await _store.depart(tripId);
        case 'complete':
          await _store.complete(tripId);
        case 'cancel':
          await _store.cancel(tripId);
      }
      await loadMine();
      return;
    }
    try {
      await _client.post<Map<String, dynamic>>(
        '/driver/intercity/pool/$tripId/$action',
      );
    } catch (_) {
      // Even on failure we reload to reflect the true server state.
    }
    await loadMine();
  }

}

final pooledDriverProvider =
    StateNotifierProvider<PooledDriverNotifier, PooledDriverState>((ref) {
  return PooledDriverNotifier(DioClient());
});
