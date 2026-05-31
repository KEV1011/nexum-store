import 'dart:async';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart';
import 'package:nexum_client/shared/services/transport_ws_service.dart';

// ── State ─────────────────────────────────────────────────────────────────────

class IntercityState {
  const IntercityState({
    this.active,
    this.past = const [],
    this.isLoading = false,
  });

  final IntercityRequestEntity? active;
  final List<IntercityRequestEntity> past;
  final bool isLoading;

  IntercityState copyWith({
    IntercityRequestEntity? active,
    bool clearActive = false,
    List<IntercityRequestEntity>? past,
    bool? isLoading,
  }) =>
      IntercityState(
        active: clearActive ? null : (active ?? this.active),
        past: past ?? this.past,
        isLoading: isLoading ?? this.isLoading,
      );
}

// ── Notifier ──────────────────────────────────────────────────────────────────

class IntercityNotifier extends StateNotifier<IntercityState> {
  IntercityNotifier(this._dio, this._wsService) : super(const IntercityState()) {
    _listenToWs();
  }

  final Dio _dio;
  final TransportWsService _wsService;
  StreamSubscription<IntercityUpdateEvent>? _sub;

  /// Server-assigned booking ID for the active request.
  String? _activeServerId;

  final _rng = math.Random();
  Timer? _matchTimer;

  static const _mockDrivers = [
    ('Carlos Vega', '3174521890', 'Toyota Hilux · VBN 432', 4.8),
    ('Jhon Díaz', '3123456789', 'Chevrolet Spark GT · KLP 871', 4.6),
    ('Andrés Ruiz', '3185556677', 'Kia Picanto · ZMX 209', 4.9),
    ('Mauricio Cáceres', '3001122334', 'Renault Logan · TRC 654', 4.7),
  ];

  // ── WS listener ─────────────────────────────────────────────────────────────

  void _listenToWs() {
    _sub = _wsService.intercityUpdates.listen(_applyIntercityUpdate);
  }

  void _applyIntercityUpdate(IntercityUpdateEvent event) {
    if (!mounted) return;
    if (event.bookingId != _activeServerId) return;

    final dto = event.payload['booking'] as Map<String, dynamic>?;
    if (dto == null) return;

    final current = state.active;
    if (current == null) return;

    final statusStr = dto['status'] as String?;
    final status = _mapStatus(statusStr) ?? current.status;

    final updated = current.copyWith(
      status: status,
      driverName: (dto['driverName'] as String?) ?? current.driverName,
      driverPhone: (dto['driverPhone'] as String?) ?? current.driverPhone,
      driverVehicle:
          (dto['driverVehicle'] as String?) ?? current.driverVehicle,
      counterFare:
          (dto['counterFare'] as num?)?.toDouble() ?? current.counterFare,
    );

    if (status == IntercityStatus.completed ||
        status == IntercityStatus.cancelled) {
      state = state.copyWith(
        clearActive: true,
        past: [updated, ...state.past],
      );
      _activeServerId = null;
      _sub?.cancel();
    } else {
      state = state.copyWith(active: updated);
    }
  }

  IntercityStatus? _mapStatus(String? raw) => switch (raw) {
        'searching' => IntercityStatus.searching,
        'driver_found' => IntercityStatus.driverFound,
        'confirmed' => IntercityStatus.confirmed,
        'in_progress' => IntercityStatus.inProgress,
        'completed' => IntercityStatus.completed,
        'cancelled' => IntercityStatus.cancelled,
        _ => null,
      };

  // ── Public API ───────────────────────────────────────────────────────────────

  Future<void> createRequest(IntercityRequestEntity request) async {
    state = state.copyWith(active: request, isLoading: true);

    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/client/intercity/request',
        data: {
          'origin': request.origin.name,
          'destination': request.destination.name,
          'departureTime': request.departureTime.toIso8601String(),
          'seats': request.seats.name,
          'offeredFare': request.offeredFare,
          if (request.pickupAddress != null)
            'pickupAddress': request.pickupAddress,
          if (request.dropoffAddress != null)
            'dropoffAddress': request.dropoffAddress,
          if (request.notes != null) 'notes': request.notes,
        },
      );

      final data = res.data!['data'] as Map<String, dynamic>;
      final serverId = data['id'] as String;
      _activeServerId = serverId;

      // Patch the active entity with the server-assigned ID.
      final serverRequest = request.copyWith(
        id: serverId,
        status: IntercityStatus.searching,
      );
      state = state.copyWith(active: serverRequest, isLoading: false);

      // Subscribe to real-time updates.
      final wsOk = await _wsService.connect();
      if (wsOk) {
        _wsService.subscribeIntercity(serverId);
      } else {
        _simulateDriverMatch(serverId);
      }
    } catch (_) {
      // Server unavailable — fall back to mock simulation.
      state = state.copyWith(isLoading: false);
      _activeServerId = request.id;
      _simulateDriverMatch(request.id);
    }
  }

  Future<void> confirmDriver() async {
    final current = state.active;
    if (current == null) return;

    // Update local state immediately.
    state = state.copyWith(
      active: current.copyWith(
        status: IntercityStatus.confirmed,
        offeredFare: current.counterFare ?? current.offeredFare,
      ),
    );

    // Fire-and-forget confirm to server.
    final serverId = _activeServerId;
    if (serverId != null) {
      try {
        await _dio.post<void>('/client/intercity/$serverId/confirm');
      } catch (_) {}
    }
  }

  Future<void> rejectCounterOffer() async {
    final current = state.active;
    if (current == null) return;

    // Build a new entity with driver fields cleared (copyWith can't null them).
    final reset = IntercityRequestEntity(
      id: current.id,
      origin: current.origin,
      destination: current.destination,
      departureTime: current.departureTime,
      seats: current.seats,
      offeredFare: current.offeredFare,
      status: IntercityStatus.searching,
      createdAt: current.createdAt,
      notes: current.notes,
      pickupAddress: current.pickupAddress,
      dropoffAddress: current.dropoffAddress,
    );
    state = state.copyWith(active: reset);

    // Fire-and-forget reject to server.
    final serverId = _activeServerId;
    if (serverId != null) {
      try {
        await _dio.post<void>('/client/intercity/$serverId/reject-offer');
      } catch (_) {
        // On failure, fall back to local simulation.
        _simulateDriverMatch(current.id);
      }
      // Server will push a new driver_found event via WS; no need to
      // re-subscribe — we are already subscribed.
    } else {
      _simulateDriverMatch(current.id);
    }
  }

  Future<void> cancelRequest() async {
    _matchTimer?.cancel();
    final current = state.active;
    if (current == null) return;

    final serverId = _activeServerId;
    _activeServerId = null;

    // Update local state immediately.
    final cancelled = current.copyWith(status: IntercityStatus.cancelled);
    state = state.copyWith(
      clearActive: true,
      past: [cancelled, ...state.past],
    );

    // Fire-and-forget cancel to server.
    if (serverId != null) {
      try {
        await _dio.post<void>('/client/intercity/$serverId/cancel');
      } catch (_) {}
      _wsService.unsubscribeIntercity(serverId);
    }
  }

  // ── Mock simulation (fallback) ────────────────────────────────────────────

  void _simulateDriverMatch(String requestId) {
    final delay = Duration(seconds: 6 + _rng.nextInt(8));
    _matchTimer?.cancel();
    _matchTimer = Timer(delay, () {
      if (!mounted) return;
      final current = state.active;
      if (current == null || current.id != requestId) return;
      final driver = _mockDrivers[_rng.nextInt(_mockDrivers.length)];
      state = state.copyWith(
        active: current.copyWith(
          status: IntercityStatus.driverFound,
          driverName: driver.$1,
          driverPhone: driver.$2,
          driverVehicle: driver.$3,
          driverRating: driver.$4,
          counterFare: _rng.nextBool()
              ? current.offeredFare
              : current.offeredFare * (1.05 + _rng.nextDouble() * 0.1),
        ),
      );
    });
  }

  @override
  void dispose() {
    _matchTimer?.cancel();
    _sub?.cancel();
    super.dispose();
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

final intercityProvider = StateNotifierProvider<IntercityNotifier, IntercityState>(
  (ref) => IntercityNotifier(
    ref.read(apiClientProvider),
    TransportWsService(),
  ),
);
