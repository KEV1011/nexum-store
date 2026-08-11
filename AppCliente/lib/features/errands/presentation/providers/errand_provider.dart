import 'package:nexum_client/shared/models/driver_card_info.dart';
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
      // fromJson devuelve null si el aviso no trae ficha: se conserva la que
      // ya había en vez de borrarla en la primera actualización.
      driverCard: DriverCardInfo.fromJson(dto) ?? current.driverCard,
      messengerRating:
          (dto['driverRating'] as num?)?.toDouble() ?? current.messengerRating,
      actualPurchaseCost:
          (dto['actualPurchaseCost'] as num?)?.toDouble() ??
          current.actualPurchaseCost,
    );

    if (status == ErrandStatus.delivered) {
      // Entregado: se MANTIENE como activo para que la pantalla muestre el
      // resumen del envío y permita calificar al mensajero (antes se limpiaba
      // y la pantalla rebotaba a /home sin resumen ni calificación). Se deja de
      // escuchar este mandado; el cliente cierra la tarjeta al terminar.
      state = state.copyWith(active: updated);
      if (_activeServerId != null) _wsService.unsubscribeErrand(_activeServerId!);
      _activeServerId = null;
      _clearTimers();
    } else if (status == ErrandStatus.cancelled) {
      state = state.copyWith(
        clearActive: true,
        past: [updated, ...state.past],
      );
      _activeServerId = null;
      _clearTimers();
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

  /// [pickupLat]/[pickupLng] vienen de la dirección que el cliente eligió en
  /// la lista o en el mapa. Mandan sobre el GPS del teléfono: la recogida
  /// suele ser en otro sitio (una tienda, la casa de alguien), y anclar el
  /// despacho a donde está parado el cliente mandaba al mensajero al lugar
  /// equivocado.
  Future<void> createErrand(
    ErrandEntity errand, {
    double? pickupLat,
    double? pickupLng,
  }) async {
    state = state.copyWith(active: errand, isLoading: true);

    try {
      // Ubicación del cliente (mejor esfuerzo) para anclar el matching del
      // mandado a conductores cercanos. Si no hay GPS, el backend usa el centro.
      final elegidas = (pickupLat != null && pickupLng != null)
          ? (pickupLat, pickupLng)
          : null;
      final coords = elegidas ?? await _currentCoords();
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

      // Patch the active entity with the server-assigned ID and ref. El
      // deliveryPin lo genera el backend: es lo que el cliente dicta al
      // mandadero para que pueda cerrar la entrega.
      final serverErrand = errand.copyWith(
        id: serverId,
        status: ErrandStatus.searching,
        deliveryPin: data['deliveryPin'] as String?,
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

  /// El cliente confirma la recepción. Se MANTIENE como activo (entregado) para
  /// mostrar el resumen y permitir calificar; se cierra al tocar "Volver".
  void markDelivered() {
    final current = state.active;
    if (current == null) return;
    final done = current.copyWith(status: ErrandStatus.delivered);
    state = state.copyWith(active: done);
    if (_activeServerId != null) _wsService.unsubscribeErrand(_activeServerId!);
    _activeServerId = null;
    _clearTimers();
  }

  /// Calificación local del mensajero (1-5). Se guarda en el mandado activo.
  void rateActiveErrand(int stars) {
    final current = state.active;
    if (current == null) return;
    state = state.copyWith(active: current.copyWith(rating: stars));
  }

  /// Cierra la tarjeta del envío entregado: lo archiva en el historial y limpia
  /// el activo (la pantalla vuelve al inicio).
  void dismissDelivered() {
    final current = state.active;
    if (current == null) return;
    state = state.copyWith(
      clearActive: true,
      past: [current, ...state.past],
    );
  }

  /// Cancela el mandado. Devuelve `null` si el servidor lo aceptó, o el motivo
  /// si NO se pudo: quien llama tiene que enseñarlo.
  ///
  /// Antes esto era fire-and-forget con `catch (_) {}`: el estado local pasaba
  /// a cancelado y, si la petición fallaba, el mandado seguía vivo en el
  /// servidor con el mandadero en camino. El cliente lo veía cancelado y ya no
  /// había forma de reintentar — `_activeServerId` se había puesto a null.
  Future<String?> cancelErrand() async {
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

    if (serverId != null) {
      try {
        await _dio.post<void>('/client/errands/$serverId/cancel');
      } catch (e) {
        // El servidor NO canceló: se deshace el cambio local para que la
        // pantalla siga mostrando el mandado activo, que es la verdad.
        _activeServerId = serverId;
        state = state.copyWith(
          active: current,
          past: state.past.where((x) => x.id != cancelled.id).toList(),
        );
        return e is DioException
            ? (e.response?.data is Map
                    ? (e.response!.data as Map)['error'] as String?
                    : null) ??
                'No pudimos cancelar el mandado. Revisa tu conexión e inténtalo de nuevo.'
            : 'No pudimos cancelar el mandado. Inténtalo de nuevo.';
      }
      _wsService.unsubscribeErrand(serverId);
    }
    return null;
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
