import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/shared/services/transport_ws_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kKey = 'nexum_transport_v1';

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
  TransportNotifier(this._dio, this._wsService) : super(const TransportState()) {
    _load();
    _listenToWs();
  }

  final Dio _dio;
  final TransportWsService _wsService;
  final _timers = <String, List<Timer>>{};
  final _wsSubscribed = <String>{};
  final _random = Random();
  StreamSubscription<TripUpdateEvent>? _tripSub;
  StreamSubscription<DriverLocationEvent>? _locationSub;

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
    unawaited(_resumeActiveTracking(requests));
  }

  /// Al reabrir la app, reconecta el WS y se resuscribe a los viajes que siguen
  /// activos para reanudar el seguimiento en vivo. El backend responde a cada
  /// `subscribe_trip` con un snapshot `trip_update`, así que el estado (estado
  /// del viaje, conductor, ubicación) se reconcilia solo. En web el WS está
  /// deshabilitado y esto es un no-op silencioso.
  Future<void> _resumeActiveTracking(
    List<TransportRequestEntity> requests,
  ) async {
    final active = requests.where((r) => r.isActive).toList();
    if (active.isEmpty) return;
    final wsOk = await _wsService.connect();
    if (!wsOk || !mounted) return;
    for (final r in active) {
      if (_wsSubscribed.add(r.id)) {
        _wsService.subscribeTrip(r.id);
      }
    }
  }

  void _listenToWs() {
    _tripSub = _wsService.tripUpdates.listen(_applyTripUpdate);
    _locationSub = _wsService.driverLocations.listen(_applyLocationUpdate);
  }

  Future<String> request({
    required TransportServiceType serviceType,
    required String origin,
    required String destination,
    String? recipientName,
    String? recipientPhone,
    String? packageDescription,
    double surgeMultiplier = 1.0,
    double? originLat,
    double? originLng,
    double? destLat,
    double? destLng,
    double? distanceKm,
    int? etaMinutes,
  }) async {
    // Distancia/ETA reales (Google Directions) cuando el booking las resolvió;
    // estimación local como fallback para texto libre.
    final distance = distanceKm ?? (1.5 + _random.nextDouble() * 6.5);
    final fare = (serviceType.estimateFare(distance) * surgeMultiplier).roundToDouble();
    final eta = etaMinutes ?? (distance * 2.5 + 3).round();

    String id;
    String ref;

    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/client/trips/request',
        data: {
          'serviceType': serviceType.name,
          'originAddress': origin,
          'destinationAddress': destination,
          'estimatedFare': fare,
          'distanceKm': distance,
          'etaMinutes': eta,
          if (originLat != null) 'originLat': originLat,
          if (originLng != null) 'originLng': originLng,
          if (destLat != null) 'destLat': destLat,
          if (destLng != null) 'destLng': destLng,
          if (recipientName != null) 'recipientName': recipientName,
          if (recipientPhone != null) 'recipientPhone': recipientPhone,
          if (packageDescription != null) 'packageDescription': packageDescription,
        },
      );
      final data = res.data!['data'] as Map<String, dynamic>;
      id = data['id'] as String;
      ref = data['requestRef'] as String;
    } catch (_) {
      // Sin backend no hay viaje real que despachar: se propaga el error para
      // que la pantalla lo muestre (nada de ids locales inventados).
      throw Exception('No se pudo solicitar el viaje. Revisa tu conexión.');
    }

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
      originLat: originLat,
      originLng: originLng,
      destLat: destLat,
      destLng: destLng,
    );

    final updated = [req, ...state.requests];
    state = state.copyWith(requests: updated, isLoading: false);
    unawaited(_persist(updated));

    final wsOk = await _wsService.connect();
    if (wsOk) {
      if (_wsSubscribed.add(id)) _wsService.subscribeTrip(id);
    } else {
      // Sin WS (p. ej. web): seguimiento REAL por polling del backend, no
      // una simulación con conductores inventados.
      _startPolling(id);
    }

    return id;
  }

  void _applyTripUpdate(TripUpdateEvent event) {
    if (!mounted) return;
    final payload = event.payload['trip'] as Map<String, dynamic>?;
    if (payload == null) return;

    _update(event.tripId, (r) {
      final statusStr = payload['status'] as String?;
      // El backend envía snake_case ('in_progress'); el enum usa camelCase
      // ('inProgress'). Sin esta conversión el estado "En trayecto" se descartaba.
      final normalized = statusStr?.replaceAllMapped(
        RegExp(r'_([a-z])'),
        (m) => m[1]!.toUpperCase(),
      );
      final status = normalized != null
          ? TransportStatus.values.firstWhere(
              (s) => s.name == normalized,
              orElse: () => r.status,
            )
          : r.status;

      final acceptedAtStr = payload['acceptedAt'] as String?;
      final completedAtStr = payload['completedAt'] as String?;

      return r.copyWith(
        status: status,
        driverName: payload['driverName'] as String? ?? r.driverName,
        driverPhone: payload['driverPhone'] as String? ?? r.driverPhone,
        maskedPhone: payload['maskedPhone'] as String? ?? r.maskedPhone,
        contactChannel: payload['contactChannel'] as String? ?? r.contactChannel,
        driverVehicle: payload['driverVehicle'] as String? ?? r.driverVehicle,
        etaMinutes: payload['etaMinutes'] as int? ?? r.etaMinutes,
        acceptedAt: acceptedAtStr != null
            ? DateTime.tryParse(acceptedAtStr)
            : r.acceptedAt,
        completedAt: completedAtStr != null
            ? DateTime.tryParse(completedAtStr)
            : r.completedAt,
        driverLat: (payload['driverLat'] as num?)?.toDouble() ?? r.driverLat,
        driverLng: (payload['driverLng'] as num?)?.toDouble() ?? r.driverLng,
      );
    });
  }

  void _applyLocationUpdate(DriverLocationEvent event) {
    if (!mounted) return;
    _update(
      event.tripId,
      (r) => r.copyWith(driverLat: event.lat, driverLng: event.lng),
    );
  }

  /// Seguimiento por REST cuando el WS no está disponible: consulta el estado
  /// real del viaje cada 5 s y lo aplica igual que un `trip_update`, hasta que
  /// el viaje termina.
  void _startPolling(String id) {
    final timer = Timer.periodic(const Duration(seconds: 5), (t) async {
      if (!mounted) {
        t.cancel();
        return;
      }
      try {
        final res = await _dio.get<Map<String, dynamic>>('/client/trips/$id');
        final trip = res.data?['data'] as Map<String, dynamic>?;
        if (trip == null || !mounted) return;
        _applyTripUpdate(TripUpdateEvent(tripId: id, payload: {'trip': trip}));
        final status = trip['status'] as String?;
        if (status == 'completed' || status == 'cancelled') t.cancel();
      } catch (_) {
        // Red intermitente: se reintenta en el siguiente tick.
      }
    });
    _timers.putIfAbsent(id, () => []).add(timer);
  }

  void cancelRequest(String id) {
    for (final t in _timers[id] ?? <Timer>[]) {
      t.cancel();
    }
    _timers.remove(id);
    _wsService.unsubscribeTrip(id);
    _update(id, (r) => r.copyWith(status: TransportStatus.cancelled));
    // Cancela también en el backend para liberar/avisar al conductor asignado.
    unawaited(_cancelOnServer(id));
  }

  Future<void> _cancelOnServer(String id) async {
    try {
      await _dio.post<Map<String, dynamic>>('/client/trips/$id/cancel');
    } catch (_) {
      // Silencioso: la cancelación local ya se aplicó a la UI.
    }
  }

  void rateRequest(String id, int stars, {String? comment}) {
    _update(id, (r) => r.copyWith(rating: stars, ratingComment: comment));
  }

  /// Solicita una propina para el viaje [id]. Devuelve la URL de checkout de
  /// Wompi para abrir el pago, o null si falla. El 100% va al conductor.
  Future<String?> tipTrip(String id, double amount) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/client/trips/$id/tip',
        data: {'amount': amount},
      );
      return (res.data?['data'] as Map<String, dynamic>?)?['paymentUrl'] as String?;
    } catch (_) {
      return null;
    }
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
      for (final t in timers) t.cancel();
    }
    _tripSub?.cancel();
    _locationSub?.cancel();
    super.dispose();
  }
}

// ── Providers ─────────────────────────────────────────────────────────────────

final _transportWsServiceProvider = Provider<TransportWsService>((ref) {
  return TransportWsService();
});

final transportProvider =
    StateNotifierProvider<TransportNotifier, TransportState>(
  (ref) => TransportNotifier(
    ref.read(apiClientProvider),
    ref.read(_transportWsServiceProvider),
  ),
);

final transportByIdProvider =
    Provider.family<TransportRequestEntity?, String>((ref, id) {
  return ref.watch(transportProvider).byId(id);
});

// Historial de viajes finalizados desde el backend; si la red falla se usa el
// historial local persistido para que la pantalla degrade sin error.
final tripHistoryProvider =
    FutureProvider.autoDispose<List<TransportRequestEntity>>((ref) async {
  final dio = ref.read(apiClientProvider);
  try {
    final res = await dio.get<Map<String, dynamic>>('/client/trips/history');
    final data = res.data?['data'] as List<dynamic>? ?? const [];
    return data
        .map((e) => TransportRequestEntity.fromJson(e as Map<String, dynamic>))
        .toList();
  } catch (_) {
    return ref.read(transportProvider).past;
  }
});

// Fetches the current surge multiplier for Pamplona centre (default origin).
// Falls back to null on network error so the UI degrades gracefully.
final surgeEstimateProvider =
    FutureProvider.autoDispose<FareEstimate?>((ref) async {
  final dio = ref.read(apiClientProvider);
  try {
    final res = await dio.get<Map<String, dynamic>>(
      '/client/trips/estimate',
      queryParameters: {
        'lat': 7.3754,
        'lng': -72.6486,
        'distanceKm': 4.0,
        'etaMinutes': 10,
      },
    );
    final data = res.data?['data'] as Map<String, dynamic>?;
    if (data == null) return null;
    return FareEstimate.fromJson(data);
  } catch (_) {
    return null;
  }
});
