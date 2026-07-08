import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
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

  final _timers = <Timer>[];

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
      // Ubicación del cliente (mejor esfuerzo) para anclar el matching del
      // mandado a conductores cercanos. Si no hay GPS, el backend usa el centro.
      final coords = await _currentCoords();
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
          if (coords != null) 'pickupLat': coords.$1,
          if (coords != null) 'pickupLng': coords.$2,
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
        // Sin WS (p. ej. web): seguimiento real por polling del backend.
        _startPolling(serverId);
      }
    } catch (_) {
      // El servidor nunca recibió el mandado: se limpia y se informa en la
      // pantalla (nada de mensajeros simulados).
      state = state.copyWith(clearActive: true, isLoading: false);
      _activeServerId = null;
      throw Exception('No se pudo solicitar el mandado. Revisa tu conexión.');
    }
  }

  /// Ubicación actual del cliente (mejor esfuerzo) para el matching del mandado.
  /// Devuelve null si el GPS no está disponible o el permiso se deniega
  /// (p. ej. web): en ese caso el backend ancla la búsqueda al centro de Pamplona.
  Future<(double, double)?> _currentCoords() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return null;
      }
      final pos = await Geolocator.getCurrentPosition();
      return (pos.latitude, pos.longitude);
    } catch (_) {
      return null;
    }
  }

  void markDelivered() {
    final current = state.active;
    if (current == null) return;
    final done = current.copyWith(status: ErrandStatus.delivered);
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

  // ── Polling REST (fallback sin WS) ─────────────────────────────────────────

  /// Consulta el estado real del mandado cada 5 s cuando no hay WebSocket;
  /// aplica cada snapshot igual que un `errand_update` del WS.
  void _startPolling(String errandId) {
    _clearTimers();
    _timers.add(Timer.periodic(const Duration(seconds: 5), (t) async {
      if (!mounted || _activeServerId != errandId) {
        t.cancel();
        return;
      }
      try {
        final res =
            await _dio.get<Map<String, dynamic>>('/client/errands/$errandId');
        final data = res.data?['data'] as Map<String, dynamic>?;
        if (data == null || !mounted) return;
        _applyErrandUpdate(
          ErrandUpdateEvent(errandId: errandId, payload: {'errand': data}),
        );
        final status = data['status'] as String?;
        if (status == 'delivered' || status == 'cancelled') t.cancel();
      } catch (_) {
        // Red intermitente: se reintenta en el siguiente tick.
      }
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
