import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
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
  PooledDriverNotifier(this._client) : super(const PooledDriverState());

  final DioClient _client;

  // ── Fare cap (for the publish form) ─────────────────────────────────────────

  Future<FareCapInfo?> fetchFareCap({
    required PooledCity origin,
    required PooledCity destination,
    required int seats,
  }) async {
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
      return null;
    }
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
    } on AppException catch (e) {
      return _extractError(e) ?? 'No se pudo publicar el viaje.';
    } catch (_) {
      return 'No se pudo publicar el viaje.';
    }
  }

  // ── My published trips ─────────────────────────────────────────────────────

  Future<void> loadMine() async {
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
      state = state.copyWith(isLoading: false);
    }
  }

  Future<void> depart(String tripId) => _action(tripId, 'depart');
  Future<void> complete(String tripId) => _action(tripId, 'complete');
  Future<void> cancel(String tripId) => _action(tripId, 'cancel');

  Future<void> _action(String tripId, String action) async {
    try {
      await _client.post<Map<String, dynamic>>(
        '/driver/intercity/pool/$tripId/$action',
      );
    } catch (_) {
      // Even on failure we reload to reflect the true server state.
    }
    await loadMine();
  }

  String? _extractError(AppException e) {
    final details = e.details;
    if (details is Map && details['error'] is String) {
      return details['error'] as String;
    }
    return e.message;
  }
}

final pooledDriverProvider =
    StateNotifierProvider<PooledDriverNotifier, PooledDriverState>((ref) {
  return PooledDriverNotifier(DioClient());
});
