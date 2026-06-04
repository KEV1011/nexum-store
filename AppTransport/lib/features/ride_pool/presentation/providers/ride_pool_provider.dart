import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/features/ride_pool/domain/entities/ride_entities.dart';
import 'package:nexum_driver/shared/services/driver_ws_service.dart';

class RidePoolState {
  const RidePoolState({
    this.openRides = const [],
    this.activeRide,
    this.completedRide,
    this.registered = false,
  });

  /// Open ride requests the driver may bid on.
  final List<RideEntity> openRides;

  /// The ride this driver was matched to (if any).
  final RideEntity? activeRide;

  /// Set briefly when the active ride reaches 'completed' so the screen
  /// can navigate to the summary/rating flow before it is cleared.
  final RideEntity? completedRide;

  /// Whether the driver has joined the live pool.
  final bool registered;

  RidePoolState copyWith({
    List<RideEntity>? openRides,
    RideEntity? activeRide,
    bool clearActive = false,
    RideEntity? completedRide,
    bool clearCompleted = false,
    bool? registered,
  }) =>
      RidePoolState(
        openRides: openRides ?? this.openRides,
        activeRide: clearActive ? null : (activeRide ?? this.activeRide),
        completedRide:
            clearCompleted ? null : (completedRide ?? this.completedRide),
        registered: registered ?? this.registered,
      );
}

class RidePoolNotifier extends StateNotifier<RidePoolState> {
  RidePoolNotifier(this._ws) : super(const RidePoolState()) {
    _reqSub = _ws.rideRequests.listen(_onNewRequest);
    _updSub = _ws.rideUpdates.listen(_onRideUpdate);
  }

  final DriverWsService _ws;
  StreamSubscription<Map<String, dynamic>>? _reqSub;
  StreamSubscription<Map<String, dynamic>>? _updSub;

  /// Track which rides the driver has already bid on (rideId → fare).
  final Map<String, double> myBids = {};

  void register() {
    _ws.registerForRides();
    state = state.copyWith(registered: true);
  }

  void clear() {
    myBids.clear();
    state = const RidePoolState();
  }

  void bid(String rideId, double fare, int etaMinutes) {
    _ws.placeBid(rideId, fare, etaMinutes);
    myBids[rideId] = fare;
    // Optimistic: keep the card but mark as bid (UI reads myBids).
    state = state.copyWith();
  }

  void withdraw(String rideId) {
    _ws.withdrawBid(rideId);
    myBids.remove(rideId);
    state = state.copyWith();
  }

  void advance(String rideId, String status) => _ws.sendRideStatus(rideId, status);

  void cancelActive() {
    final ride = state.activeRide;
    if (ride != null) _ws.cancelRide(ride.id);
  }

  void clearCompletedRide() {
    state = state.copyWith(clearCompleted: true);
  }

  // ── stream handlers ─────────────────────────────────────────────────────────

  void _onNewRequest(Map<String, dynamic> json) {
    final ride = RideEntity.fromJson(json);
    if (ride.status != RideStatus.open) return;
    final exists = state.openRides.any((r) => r.id == ride.id);
    if (exists) return;
    state = state.copyWith(openRides: [ride, ...state.openRides]);
  }

  void _onRideUpdate(Map<String, dynamic> json) {
    final ride = RideEntity.fromJson(json);
    // Driver view exposes only this driver's own bid.
    final myBid = ride.bids.isNotEmpty ? ride.bids.first : null;

    if (ride.status == RideStatus.open) {
      // Refresh the open card (e.g. fare unchanged but still live).
      final updated = [
        ride,
        ...state.openRides.where((r) => r.id != ride.id),
      ];
      state = state.copyWith(openRides: updated);
      return;
    }

    // No longer open → drop from the pool list.
    final remaining = state.openRides.where((r) => r.id != ride.id).toList();

    final iWon = myBid != null && myBid.status == BidStatus.accepted;
    final terminal =
        ride.status == RideStatus.completed || ride.status == RideStatus.cancelled;

    if (iWon && !terminal) {
      myBids.remove(ride.id);
      state = state.copyWith(openRides: remaining, activeRide: ride);
    } else if (state.activeRide?.id == ride.id) {
      // My active ride changed.
      if (terminal) {
        final wasCompleted = ride.status == RideStatus.completed;
        state = state.copyWith(
          openRides: remaining,
          clearActive: true,
          completedRide: wasCompleted ? ride : null,
        );
      } else {
        state = state.copyWith(openRides: remaining, activeRide: ride);
      }
    } else {
      // I lost this bid or it's unrelated → just clean the pool.
      myBids.remove(ride.id);
      state = state.copyWith(openRides: remaining);
    }
  }

  @override
  void dispose() {
    _reqSub?.cancel();
    _updSub?.cancel();
    super.dispose();
  }
}

final ridePoolProvider =
    StateNotifierProvider<RidePoolNotifier, RidePoolState>((ref) {
  return RidePoolNotifier(DriverWsService());
});
