import 'dart:async';

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

  /// Creates an intercity request. Returns `null` on success, or an error
  /// message when the request can't be created — ya sea un rechazo de negocio
  /// del servidor (p. ej. ruta troncal que requiere operador habilitado) o un
  /// fallo de conexión. El emparejamiento con el conductor es siempre real
  /// (vía WebSocket); no se simula ningún conductor.
  Future<String?> createRequest(IntercityRequestEntity request) async {
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

      // Subscribe to real-time updates. El conductor llega por matching real;
      // si el WS no conecta, la solicitud queda en búsqueda (sin conductor
      // falso) y recibirá la actualización cuando el canal se restablezca.
      final wsOk = await _wsService.connect();
      if (wsOk) _wsService.subscribeIntercity(serverId);
      return null;
    } on DioException catch (e) {
      final body = e.response?.data;
      final msg = body is Map<String, dynamic> ? body['error'] as String? : null;
      state = state.copyWith(clearActive: true, isLoading: false);
      _activeServerId = null;
      final status = e.response?.statusCode ?? 0;
      // 4xx = rechazo deliberado (validación o regla legal/negocio).
      if (status >= 400 && status < 500) {
        return msg ?? 'No se pudo crear la solicitud.';
      }
      // Red caída / 5xx: informar en vez de fabricar un conductor.
      return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    } catch (_) {
      state = state.copyWith(clearActive: true, isLoading: false);
      _activeServerId = null;
      return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
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

    // Fire-and-forget reject to server. El servidor empuja un nuevo
    // driver_found por WS cuando otro conductor real se ofrece; ya estamos
    // suscritos, así que no hace falta nada más.
    final serverId = _activeServerId;
    if (serverId != null) {
      try {
        await _dio.post<void>('/client/intercity/$serverId/reject-offer');
      } catch (_) {}
    }
  }

  Future<void> cancelRequest() async {
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

  // ── History & rating ─────────────────────────────────────────────────────

  /// Loads the server-side trip history (completed/cancelled bookings) and
  /// replaces the local `past` list. Falls back silently to the local list
  /// when the server is unreachable.
  Future<void> loadHistory() async {
    try {
      final res = await _dio
          .get<Map<String, dynamic>>('/client/intercity/history');
      final list = (res.data?['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(IntercityRequestEntity.fromApi)
          .toList();
      if (!mounted) return;
      state = state.copyWith(past: list);
    } catch (_) {
      // Keep whatever we accumulated locally this session.
    }
  }

  /// Rates a completed trip (1-5 stars). Returns `null` on success or a
  /// human-readable error message.
  Future<String?> rateTrip(String id, int stars, {String? comment}) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/client/intercity/$id/rate',
        data: {
          'rating': stars,
          if (comment != null && comment.trim().isNotEmpty)
            'comment': comment.trim(),
        },
      );
      _applyLocalRating(id, stars);
      return null;
    } on DioException catch (e) {
      final body = e.response?.data;
      final msg =
          body is Map<String, dynamic> ? body['error'] as String? : null;
      final status = e.response?.statusCode ?? 0;
      if (status >= 400 && status < 500) {
        return msg ?? 'No se pudo enviar la calificación.';
      }
      // Offline: keep the rating locally so the UI reflects the user's action.
      _applyLocalRating(id, stars);
      return null;
    } catch (_) {
      _applyLocalRating(id, stars);
      return null;
    }
  }

  void _applyLocalRating(String id, int stars) {
    state = state.copyWith(
      past: [
        for (final t in state.past)
          if (t.id == id) t.copyWith(myRating: stars) else t,
      ],
    );
  }

  @override
  void dispose() {
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
