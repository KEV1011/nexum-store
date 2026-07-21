import 'dart:async';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
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

  /// Sondeo de la posición EN VIVO del conductor (confirmado/en curso): el WS
  /// solo avisa transiciones; la posición viaja en el DTO del booking
  /// (driverLat/driverLng, del heartbeat GPS) y se refresca cada 8 s.
  Timer? _trackTimer;

  void _startTracking() {
    if (_trackTimer != null) return;
    _trackTimer = Timer.periodic(const Duration(seconds: 8), (t) async {
      final serverId = _activeServerId;
      final active = state.active;
      if (!mounted || serverId == null || active == null) {
        t.cancel();
        _trackTimer = null;
        return;
      }
      if (active.status != IntercityStatus.confirmed &&
          active.status != IntercityStatus.inProgress) {
        return; // aún no hay conductor en ruta; se reintenta en el siguiente tick
      }
      try {
        final res =
            await _dio.get<Map<String, dynamic>>('/client/intercity/$serverId');
        final dto = res.data?['data'] as Map<String, dynamic>?;
        if (dto == null || !mounted) return;
        final lat = (dto['driverLat'] as num?)?.toDouble();
        final lng = (dto['driverLng'] as num?)?.toDouble();
        final current = state.active;
        if (current == null || lat == null || lng == null) return;
        state = state.copyWith(
          active: current.copyWith(driverLat: lat, driverLng: lng),
        );
      } catch (_) {
        // Red intermitente: siguiente tick.
      }
    });
  }

  void _stopTracking() {
    _trackTimer?.cancel();
    _trackTimer = null;
  }

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
      _stopTracking();
      state = state.copyWith(
        clearActive: true,
        past: [updated, ...state.past],
      );
      _activeServerId = null;
      _sub?.cancel();
    } else {
      state = state.copyWith(active: updated);
      // Con conductor confirmado/en ruta, empieza el seguimiento en vivo.
      if (status == IntercityStatus.confirmed ||
          status == IntercityStatus.inProgress) {
        _startTracking();
      }
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

  /// Creates an intercity request. Returns `null` on success (or accepted mock
  /// fallback when the server is unreachable), or an error message when the
  /// server rejects the request for a business reason — e.g. a trunk route that
  /// requires a habilitated operator under the dual model (Option B).
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
          if (request.stops.isNotEmpty)
            'stops': [
              for (var i = 0; i < request.stops.length; i++)
                {'name': request.stops[i], 'order': i},
            ],
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
      return null;
    } on DioException catch (e) {
      final status = e.response?.statusCode ?? 0;
      // 4xx = the server deliberately rejected the request (validation or a
      // legal/business rule). Surface it instead of faking a driver match.
      if (status >= 400 && status < 500) {
        final body = e.response?.data;
        final msg = body is Map<String, dynamic> ? body['error'] as String? : null;
        state = state.copyWith(clearActive: true, isLoading: false);
        _activeServerId = null;
        return msg ?? 'No se pudo crear la solicitud.';
      }
      // Network/5xx — es un fallo real de conexión, no un match. Se informa al
      // usuario en vez de fabricar un conductor falso.
      state = state.copyWith(clearActive: true, isLoading: false);
      _activeServerId = null;
      return 'No se pudo conectar con el servidor. Inténtalo de nuevo.';
    } catch (_) {
      state = state.copyWith(clearActive: true, isLoading: false);
      _activeServerId = null;
      return 'Ocurrió un error al crear la solicitud. Inténtalo de nuevo.';
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
    // Con la reserva confirmada arranca el mapa en vivo.
    _startTracking();
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
    _stopTracking();
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

  // ── Mock simulation (fallback) ────────────────────────────────────────────

  void _simulateDriverMatch(String requestId) {
    // Nunca simular en producción: mostrar un conductor falso al pasajero rompe
    // el "flujo real". Solo se usa como ayuda de desarrollo offline (no-op en
    // release).
    if (!kDebugMode) return;
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
    _trackTimer?.cancel();
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
