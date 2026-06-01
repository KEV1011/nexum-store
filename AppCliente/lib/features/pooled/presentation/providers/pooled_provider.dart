import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart'
    show IntercityCity;
import 'package:nexum_client/features/pooled/domain/entities/pooled_trip_entity.dart';
import 'package:nexum_client/shared/services/transport_ws_service.dart';

class PooledState {
  const PooledState({
    this.searchResults = const [],
    this.myBookings = const [],
    this.isSearching = false,
    this.isLoadingBookings = false,
    this.hasSearched = false,
    this.error,
  });

  final List<PooledTripEntity> searchResults;
  final List<PooledTripEntity> myBookings;
  final bool isSearching;
  final bool isLoadingBookings;
  final bool hasSearched;
  final String? error;

  PooledState copyWith({
    List<PooledTripEntity>? searchResults,
    List<PooledTripEntity>? myBookings,
    bool? isSearching,
    bool? isLoadingBookings,
    bool? hasSearched,
    String? error,
  }) =>
      PooledState(
        searchResults: searchResults ?? this.searchResults,
        myBookings: myBookings ?? this.myBookings,
        isSearching: isSearching ?? this.isSearching,
        isLoadingBookings: isLoadingBookings ?? this.isLoadingBookings,
        hasSearched: hasSearched ?? this.hasSearched,
        error: error,
      );
}

class PooledNotifier extends StateNotifier<PooledState> {
  PooledNotifier(this._dio, this._ws) : super(const PooledState());

  final Dio _dio;
  final TransportWsService _ws;

  StreamSubscription<PooledUpdateEvent>? _wsSub;
  String? _watchedTripId;

  // ── Search ───────────────────────────────────────────────────────────────

  Future<void> search({
    IntercityCity? origin,
    IntercityCity? destination,
    DateTime? date,
  }) async {
    state = state.copyWith(isSearching: true, error: null);
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/client/intercity/pool/search',
        queryParameters: {
          if (origin != null) 'origin': origin.name,
          if (destination != null) 'destination': destination.name,
          if (date != null) 'date': date.toIso8601String(),
        },
      );
      final list = (res.data?['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(PooledTripEntity.fromJson)
          .toList();
      state = state.copyWith(
        searchResults: list,
        isSearching: false,
        hasSearched: true,
      );
    } catch (_) {
      // No mock fallback for search: an empty result is the honest answer when
      // the server is unreachable (there are no published trips to show).
      state = state.copyWith(
        searchResults: const [],
        isSearching: false,
        hasSearched: true,
        error: 'No pudimos cargar los viajes. Revisa tu conexión.',
      );
    }
  }

  // ── Book ─────────────────────────────────────────────────────────────────

  /// Returns `null` on success, or a human error message on failure.
  Future<String?> bookSeats({
    required String tripId,
    required int seats,
    String? pickupAddress,
    String? notes,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/client/intercity/pool/$tripId/book',
        data: {
          'seatsBooked': seats,
          if (pickupAddress != null && pickupAddress.isNotEmpty)
            'pickupAddress': pickupAddress,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
        },
      );
      await loadMyBookings();
      return null;
    } on DioException catch (e) {
      final body = e.response?.data;
      if (body is Map && body['error'] is String) return body['error'] as String;
      return 'No se pudo reservar. Intenta de nuevo.';
    } catch (_) {
      return 'No se pudo reservar. Intenta de nuevo.';
    }
  }

  // ── My bookings ────────────────────────────────────────────────────────────

  Future<void> loadMyBookings() async {
    state = state.copyWith(isLoadingBookings: true);
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/client/intercity/pool/bookings',
      );
      final list = (res.data?['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(PooledTripEntity.fromJson)
          .toList();
      state = state.copyWith(myBookings: list, isLoadingBookings: false);
    } catch (_) {
      state = state.copyWith(isLoadingBookings: false);
    }
  }

  Future<String?> cancelBooking(String bookingId) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/client/intercity/pool/bookings/$bookingId/cancel',
      );
      await loadMyBookings();
      return null;
    } on DioException catch (e) {
      final body = e.response?.data;
      if (body is Map && body['error'] is String) return body['error'] as String;
      return 'No se pudo cancelar la reserva.';
    } catch (_) {
      return 'No se pudo cancelar la reserva.';
    }
  }

  // ── Live seat updates while viewing a trip ──────────────────────────────────

  void watchTrip(String tripId) {
    _watchedTripId = tripId;
    _ws.connect().then((ok) {
      if (ok) _ws.subscribePooled(tripId);
    });
    _wsSub?.cancel();
    _wsSub = _ws.pooledUpdates.listen((event) {
      if (event.tripId != _watchedTripId) return;
      final trip = event.payload['trip'];
      if (trip is! Map<String, dynamic>) return;
      final updated = PooledTripEntity.fromJson(trip);
      // Patch the matching trip in the search results so the seat count stays live.
      final patched = [
        for (final t in state.searchResults)
          if (t.id == updated.id) updated else t,
      ];
      state = state.copyWith(searchResults: patched);
    });
  }

  void unwatchTrip() {
    final id = _watchedTripId;
    if (id != null) _ws.unsubscribePooled(id);
    _watchedTripId = null;
    _wsSub?.cancel();
    _wsSub = null;
  }

  @override
  void dispose() {
    unwatchTrip();
    super.dispose();
  }
}

final pooledProvider =
    StateNotifierProvider<PooledNotifier, PooledState>((ref) {
  return PooledNotifier(ref.read(apiClientProvider), TransportWsService());
});
