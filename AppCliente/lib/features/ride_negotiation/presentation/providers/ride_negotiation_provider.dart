import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/features/ride_negotiation/domain/entities/ride_entities.dart';
import 'package:nexum_client/shared/services/transport_ws_service.dart';

class RideNegotiationState {
  const RideNegotiationState({
    this.ride,
    this.isCreating = false,
    this.error,
  });

  final RideEntity? ride;
  final bool isCreating;
  final String? error;

  RideNegotiationState copyWith({
    RideEntity? ride,
    bool clearRide = false,
    bool? isCreating,
    String? error,
  }) =>
      RideNegotiationState(
        ride: clearRide ? null : (ride ?? this.ride),
        isCreating: isCreating ?? this.isCreating,
        error: error,
      );
}

class RideNegotiationNotifier extends StateNotifier<RideNegotiationState> {
  RideNegotiationNotifier(this._dio, this._ws)
      : super(const RideNegotiationState()) {
    _sub = _ws.rideUpdates.listen(_onRideUpdate);
  }

  final Dio _dio;
  final TransportWsService _ws;
  StreamSubscription<RideUpdateEvent>? _sub;

  /// Publish a ride request with an offered fare. Returns error string or null.
  Future<String?> createRide({
    required String serviceType,
    required String originAddress,
    required String destinationAddress,
    required double offeredFare,
    required double distanceKm,
    required int etaMinutes,
    String? notes,
  }) async {
    state = state.copyWith(isCreating: true, error: null);
    try {
      await _ws.connect();
      final res = await _dio.post<Map<String, dynamic>>(
        '/client/rides/request',
        data: {
          'serviceType': serviceType,
          'originAddress': originAddress,
          'destinationAddress': destinationAddress,
          'offeredFare': offeredFare,
          'distanceKm': distanceKm,
          'etaMinutes': etaMinutes,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
        },
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data == null) {
        state = state.copyWith(isCreating: false);
        return 'No se pudo crear la solicitud.';
      }
      final ride = RideEntity.fromJson(data);
      state = state.copyWith(ride: ride, isCreating: false);
      _ws.subscribeRide(ride.id);
      return null;
    } on DioException catch (e) {
      state = state.copyWith(isCreating: false);
      final msg = (e.response?.data is Map)
          ? (e.response?.data as Map)['error'] as String?
          : null;
      return msg ?? 'No se pudo crear la solicitud.';
    } catch (_) {
      state = state.copyWith(isCreating: false);
      return 'No se pudo crear la solicitud.';
    }
  }

  void acceptBid(String bidId) {
    final ride = state.ride;
    if (ride == null) return;
    _ws.acceptBid(ride.id, bidId);
  }

  void cancel() {
    final ride = state.ride;
    if (ride != null) {
      _ws.cancelRide(ride.id);
      _ws.unsubscribeRide(ride.id);
    }
    state = state.copyWith(clearRide: true);
  }

  /// Sends the client's star rating for the driver after the ride completes.
  Future<void> rateRide(String rideId, int stars, {String? comment}) async {
    try {
      await _dio.post<void>(
        '/client/rides/$rideId/rate',
        data: {'stars': stars, if (comment != null) 'comment': comment},
      );
    } catch (_) {
      // Best-effort — silently swallow on failure.
    }
  }

  void _onRideUpdate(RideUpdateEvent event) {
    final ride = RideEntity.fromJson(event.ride);
    // Only track our own active ride.
    if (state.ride != null && ride.id != state.ride!.id) return;
    state = state.copyWith(ride: ride);
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

final rideNegotiationProvider =
    StateNotifierProvider<RideNegotiationNotifier, RideNegotiationState>((ref) {
  return RideNegotiationNotifier(
    ref.read(apiClientProvider),
    TransportWsService(),
  );
});
