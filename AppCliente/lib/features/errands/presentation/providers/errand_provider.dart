import 'dart:async';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/features/errands/domain/entities/errand_entity.dart';
import 'package:nexum_client/shared/services/transport_ws_service.dart';

// ── State ─────────────────────────────────────────────────────────────────────

class ErrandState {
  const ErrandState({
    this.active,
    this.past = const [],
    this.isLoading = false,
  });

  final ErrandEntity? active;
  final List<ErrandEntity> past;
  final bool isLoading;

  ErrandState copyWith({
    ErrandEntity? active,
    bool clearActive = false,
    List<ErrandEntity>? past,
    bool? isLoading,
  }) =>
      ErrandState(
        active: clearActive ? null : (active ?? this.active),
        past: past ?? this.past,
        isLoading: isLoading ?? this.isLoading,
      );
}

// ── Notifier ──────────────────────────────────────────────────────────────────

class ErrandNotifier extends StateNotifier<ErrandState> {
  ErrandNotifier(this._dio, this._wsService) : super(const ErrandState()) {
    _listenToWs();
  }

  final Dio _dio;
  final TransportWsService _wsService;
  StreamSubscription<ErrandUpdateEvent>? _sub;

  /// Server-assigned ID for the active errand (may differ from the local ID
  /// used while the request is in flight).
  String? _activeServerId;

  final _rng = math.Random();
  final _timers = <Timer>[];

  static const _mockMessengers = [
    ('Laura Mendoza', '3174521890', 4.9),
    ('Sergio Ramírez', '3123456789', 4.7),
    ('Diana Parra', '3185556677', 4.8),
    ('Felipe Acosta', '3001122334', 4.6),
  ];

  // ── WS listener ─────────────────────────────────────────────────────────────

  void _listenToWs() {
    _sub = _wsService.errandUpdates.listen(_applyErrandUpdate);
  }

  void _applyErrandUpdate(ErrandUpdateEvent event) {
    if (!mounted) return;
    if (event.errandId != _activeServerId) return;

    final dto = event.payload['errand'] as Map<String, dynamic>?;
    if (dto == null) return;

    final current = state.active;
    if (current == null) return;

    final statusStr = dto['status'] as String?;
    final status = _mapStatus(statusStr) ?? current.status;

    final updated = current.copyWith(
      status: status,
      messengerName: (dto['driverName'] as String?) ?? current.messengerName,
      messengerPhone: (dto['driverPhone'] as String?) ?? current.messengerPhone,
      actualPurchaseCost:
          (dto['actualPurchaseCost'] as num?)?.toDouble() ??
          current.actualPurchaseCost,
    );

    if (status == ErrandStatus.delivered || status == ErrandStatus.cancelled) {
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

  ErrandStatus? _mapStatus(String? raw) => switch (raw) {
        'searching' => ErrandStatus.searching,
        'accepted' => ErrandStatus.accepted,
        'shopping' => ErrandStatus.shopping,
        'on_the_way' => ErrandStatus.onTheWay,
        'delivered' => ErrandStatus.delivered,
        'cancelled' => ErrandStatus.cancelled,
        _ => null,
      };

  // ── Public API ───────────────────────────────────────────────────────────────

  Future<void> createErrand(ErrandEntity errand) async {
    state = state.copyWith(active: errand, isLoading: true);

    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/client/errands/request',
        data: {
          'category': errand.category.name,
          'description': errand.description,
          'pickupAddress': errand.pickupAddress,
          'dropoffAddress': errand.dropoffAddress,
          if (errand.purchaseBudget != null)
            'purchaseBudget': errand.purchaseBudget,
          if (errand.notes != null) 'notes': errand.notes,
        },
      );

      final data = res.data!['data'] as Map<String, dynamic>;
      final serverId = data['id'] as String;
      _activeServerId = serverId;

      // Patch the active entity with the server-assigned ID and ref.
      final serverErrand = errand.copyWith(
        id: serverId,
        status: ErrandStatus.searching,
      );
      state = state.copyWith(active: serverErrand, isLoading: false);

      // Subscribe to real-time updates.
      final wsOk = await _wsService.connect();
      if (wsOk) {
        _wsService.subscribeErrand(serverId);
      } else {
        _simulateLifecycle(serverId);
      }
    } catch (_) {
      // Server unavailable — fall back to mock simulation.
      state = state.copyWith(isLoading: false);
      _activeServerId = errand.id;
      _simulateLifecycle(errand.id);
    }
  }

  void markDelivered({int? rating, String? comment}) {
    final current = state.active;
    if (current == null) return;
    final done = current.copyWith(
      status: ErrandStatus.delivered,
      rating: rating,
      ratingComment: comment,
    );
    state = state.copyWith(
      clearActive: true,
      past: [done, ...state.past],
    );
    _activeServerId = null;
  }

  Future<void> cancelErrand() async {
    _clearTimers();
    final current = state.active;
    if (current == null) return;

    final serverId = _activeServerId;
    _activeServerId = null;

    // Update local state immediately.
    final cancelled = current.copyWith(status: ErrandStatus.cancelled);
    state = state.copyWith(
      clearActive: true,
      past: [cancelled, ...state.past],
    );

    // Fire-and-forget the cancel request to the server.
    if (serverId != null) {
      try {
        await _dio.post<void>('/client/errands/$serverId/cancel');
      } catch (_) {}
      _wsService.unsubscribeErrand(serverId);
    }
  }

  // ── Mock simulation (fallback) ────────────────────────────────────────────

  void _simulateLifecycle(String errandId) {
    _clearTimers();

    // 1. Assign messenger (4–9 s)
    _schedule(Duration(seconds: 4 + _rng.nextInt(5)), () {
      final current = state.active;
      if (current == null || current.id != errandId) return;
      final m = _mockMessengers[_rng.nextInt(_mockMessengers.length)];
      state = state.copyWith(
        active: current.copyWith(
          status: ErrandStatus.accepted,
          messengerName: m.$1,
          messengerPhone: m.$2,
          messengerRating: m.$3,
        ),
      );
    });

    // 2. Shopping (12 s)
    _schedule(const Duration(seconds: 12), () {
      final current = state.active;
      if (current == null || current.id != errandId) return;
      if (current.status != ErrandStatus.accepted) return;
      state = state.copyWith(
        active: current.copyWith(status: ErrandStatus.shopping),
      );
    });

    // 3. On the way (20 s) — report actual purchase cost
    _schedule(const Duration(seconds: 20), () {
      final current = state.active;
      if (current == null || current.id != errandId) return;
      if (current.status != ErrandStatus.shopping) return;
      double? actualCost;
      if (current.hasBudget) {
        actualCost =
            current.purchaseBudget! * (0.75 + _rng.nextDouble() * 0.2);
        actualCost = (actualCost / 100).round() * 100;
      }
      state = state.copyWith(
        active: current.copyWith(
          status: ErrandStatus.onTheWay,
          actualPurchaseCost: actualCost,
        ),
      );
    });
  }

  void _schedule(Duration d, void Function() action) {
    _timers.add(Timer(d, () {
      if (mounted) action();
    }));
  }

  void _clearTimers() {
    for (final t in _timers) {
      t.cancel();
    }
    _timers.clear();
  }

  @override
  void dispose() {
    _clearTimers();
    _sub?.cancel();
    super.dispose();
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

final errandProvider = StateNotifierProvider<ErrandNotifier, ErrandState>(
  (ref) => ErrandNotifier(
    ref.read(apiClientProvider),
    TransportWsService(),
  ),
);
