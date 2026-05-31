import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart';

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
  IntercityNotifier() : super(const IntercityState());

  final _rng = math.Random();
  Timer? _matchTimer;

  static const _mockDrivers = [
    ('Carlos Vega', '3174521890', 'Toyota Hilux · VBN 432', 4.8),
    ('Jhon Díaz', '3123456789', 'Chevrolet Spark GT · KLP 871', 4.6),
    ('Andrés Ruiz', '3185556677', 'Kia Picanto · ZMX 209', 4.9),
    ('Mauricio Cáceres', '3001122334', 'Renault Logan · TRC 654', 4.7),
  ];

  Future<void> createRequest(IntercityRequestEntity request) async {
    state = state.copyWith(active: request, isLoading: true);
    await Future<void>.delayed(const Duration(milliseconds: 800));
    state = state.copyWith(isLoading: false);
    _simulateDriverMatch(request.id);
  }

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

  void confirmDriver() {
    final current = state.active;
    if (current == null) return;
    state = state.copyWith(
      active: current.copyWith(
        status: IntercityStatus.confirmed,
        offeredFare: current.counterFare ?? current.offeredFare,
      ),
    );
  }

  void rejectCounterOffer() {
    final current = state.active;
    if (current == null) return;
    state = state.copyWith(
      active: current.copyWith(
        status: IntercityStatus.searching,
        driverName: null,
        driverPhone: null,
        driverVehicle: null,
        driverRating: null,
        counterFare: null,
      ),
    );
    _simulateDriverMatch(current.id);
  }

  void cancelRequest() {
    _matchTimer?.cancel();
    final current = state.active;
    if (current == null) return;
    final cancelled = current.copyWith(status: IntercityStatus.cancelled);
    state = state.copyWith(
      clearActive: true,
      past: [cancelled, ...state.past],
    );
  }

  @override
  void dispose() {
    _matchTimer?.cancel();
    super.dispose();
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

final intercityProvider =
    StateNotifierProvider<IntercityNotifier, IntercityState>(
  (_) => IntercityNotifier(),
);
