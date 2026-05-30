import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kKey = 'nexum_transport_v1';

const _mockDrivers = <(String, String, String)>[
  ('Carlos Méndez', '+57 310 456 7890', 'Toyota Yaris • NEX 123'),
  ('Diana Ruiz', '+57 315 234 5678', 'Honda CB 190 • TRX 456'),
  ('Andrés Peña', '+57 312 876 5432', 'Nissan Versa • PLM 789'),
  ('Valentina Cruz', '+57 320 123 4567', 'Bajaj Pulsar • MOT 321'),
];

class TransportState {
  const TransportState({
    this.requests = const [],
    this.isLoading = true,
  });

  final List<TransportRequestEntity> requests;
  final bool isLoading;

  List<TransportRequestEntity> get active =>
      requests.where((r) => r.isActive).toList();

  List<TransportRequestEntity> get past =>
      requests.where((r) => !r.isActive).toList();

  TransportRequestEntity? byId(String id) {
    for (final r in requests) {
      if (r.id == id) return r;
    }
    return null;
  }

  TransportState copyWith({
    List<TransportRequestEntity>? requests,
    bool? isLoading,
  }) {
    return TransportState(
      requests: requests ?? this.requests,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class TransportNotifier extends StateNotifier<TransportState> {
  TransportNotifier() : super(const TransportState()) {
    _load();
  }

  final _timers = <String, List<Timer>>{};
  final _random = Random();

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_kKey) ?? [];
    if (!mounted) return;
    final requests = raw
        .map(
          (s) => TransportRequestEntity.fromJson(
            jsonDecode(s) as Map<String, dynamic>,
          ),
        )
        .toList();
    state = state.copyWith(requests: requests, isLoading: false);
  }

  Future<String> request({
    required TransportServiceType serviceType,
    required String origin,
    required String destination,
    String? recipientName,
    String? recipientPhone,
    String? packageDescription,
  }) async {
    final distance = 1.5 + _random.nextDouble() * 6.5;
    final fare = serviceType.estimateFare(distance);
    final eta = (distance * 2.5 + 3).round();

    final id = 'tr-${DateTime.now().millisecondsSinceEpoch}';
    final ref = 'NXM-${1000 + _random.nextInt(8000)}';

    final req = TransportRequestEntity(
      id: id,
      requestRef: ref,
      serviceType: serviceType,
      originAddress: origin,
      destinationAddress: destination,
      estimatedFare: fare,
      distanceKm: distance,
      etaMinutes: eta,
      status: TransportStatus.searching,
      createdAt: DateTime.now(),
      recipientName: recipientName,
      recipientPhone: recipientPhone,
      packageDescription: packageDescription,
    );

    final updated = [req, ...state.requests];
    state = state.copyWith(requests: updated, isLoading: false);
    unawaited(_persist(updated));
    _startSimulation(id);

    return id;
  }

  void _startSimulation(String id) {
    final driver = _mockDrivers[_random.nextInt(_mockDrivers.length)];

    void schedule(
      int seconds,
      TransportRequestEntity Function(TransportRequestEntity) update,
    ) {
      final timer = Timer(Duration(seconds: seconds), () {
        if (!mounted) return;
        _update(id, update);
      });
      _timers.putIfAbsent(id, () => []).add(timer);
    }

    schedule(
      3,
      (r) => r.copyWith(
        status: TransportStatus.accepted,
        driverName: driver.$1,
        driverPhone: driver.$2,
        driverVehicle: driver.$3,
        acceptedAt: DateTime.now(),
      ),
    );
    schedule(8, (r) => r.copyWith(status: TransportStatus.arriving));
    schedule(20, (r) => r.copyWith(status: TransportStatus.arrived));
    schedule(30, (r) => r.copyWith(status: TransportStatus.inProgress));
    schedule(
      50,
      (r) => r.copyWith(
        status: TransportStatus.completed,
        completedAt: DateTime.now(),
      ),
    );
  }

  void cancelRequest(String id) {
    for (final t in _timers[id] ?? <Timer>[]) {
      t.cancel();
    }
    _timers.remove(id);
    _update(id, (r) => r.copyWith(status: TransportStatus.cancelled));
  }

  void rateRequest(String id, int stars, {String? comment}) {
    _update(id, (r) => r.copyWith(rating: stars, ratingComment: comment));
  }

  void _update(
    String id,
    TransportRequestEntity Function(TransportRequestEntity) fn,
  ) {
    final updated = [
      for (final r in state.requests)
        if (r.id == id) fn(r) else r,
    ];
    state = state.copyWith(requests: updated);
    unawaited(_persist(updated));
  }

  Future<void> _persist(List<TransportRequestEntity> requests) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      _kKey,
      requests.map((r) => jsonEncode(r.toJson())).toList(),
    );
  }

  @override
  void dispose() {
    for (final timers in _timers.values) {
      for (final t in timers) {
        t.cancel();
      }
    }
    super.dispose();
  }
}

final transportProvider =
    StateNotifierProvider<TransportNotifier, TransportState>(
  (ref) => TransportNotifier(),
);

final transportByIdProvider =
    Provider.family<TransportRequestEntity?, String>((ref, id) {
  return ref.watch(transportProvider).byId(id);
});
