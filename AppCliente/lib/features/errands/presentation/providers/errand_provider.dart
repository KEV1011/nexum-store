import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/features/errands/domain/entities/errand_entity.dart';

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
  ErrandNotifier() : super(const ErrandState());

  final _rng = math.Random();
  final _timers = <Timer>[];

  static const _mockMessengers = [
    ('Laura Mendoza', '3174521890', 4.9),
    ('Sergio Ramírez', '3123456789', 4.7),
    ('Diana Parra', '3185556677', 4.8),
    ('Felipe Acosta', '3001122334', 4.6),
  ];

  Future<void> createErrand(ErrandEntity errand) async {
    state = state.copyWith(active: errand, isLoading: true);
    await Future<void>.delayed(const Duration(milliseconds: 700));
    state = state.copyWith(isLoading: false);
    _simulateLifecycle(errand.id);
  }

  /// Simula todo el ciclo: asignación → compra → en camino.
  void _simulateLifecycle(String errandId) {
    _clearTimers();

    // 1. Asignar mensajero (4-9s)
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

    // 2. Realizando el mandado (12s)
    _schedule(const Duration(seconds: 12), () {
      final current = state.active;
      if (current == null || current.id != errandId) return;
      if (current.status != ErrandStatus.accepted) return;
      state = state.copyWith(
        active: current.copyWith(status: ErrandStatus.shopping),
      );
    });

    // 3. En camino (20s) — reporta costo real de compras
    _schedule(const Duration(seconds: 20), () {
      final current = state.active;
      if (current == null || current.id != errandId) return;
      if (current.status != ErrandStatus.shopping) return;
      double? actualCost;
      if (current.hasBudget) {
        // El costo real suele ser un poco menor al presupuesto.
        actualCost = current.purchaseBudget! * (0.75 + _rng.nextDouble() * 0.2);
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

  void markDelivered() {
    final current = state.active;
    if (current == null) return;
    final done = current.copyWith(status: ErrandStatus.delivered);
    state = state.copyWith(
      clearActive: true,
      past: [done, ...state.past],
    );
  }

  void cancelErrand() {
    _clearTimers();
    final current = state.active;
    if (current == null) return;
    final cancelled = current.copyWith(status: ErrandStatus.cancelled);
    state = state.copyWith(
      clearActive: true,
      past: [cancelled, ...state.past],
    );
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
    super.dispose();
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

final errandProvider =
    StateNotifierProvider<ErrandNotifier, ErrandState>(
  (_) => ErrandNotifier(),
);
