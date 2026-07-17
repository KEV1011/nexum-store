import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/intercity/domain/entities/intercity_request_entity.dart';
import 'package:nexum_driver/shared/services/driver_ws_service.dart';
import 'package:nexum_driver/shared/services/ws_service.dart' show IntercityLifecycleEvent;

/// Fase del viaje intermunicipal activo del conductor.
enum IntercityTripPhase {
  /// Aceptación enviada; esperando `intercity_accept_ok` del backend.
  pending,

  /// Contraoferta enviada; el pasajero decide (DRIVER_FOUND).
  waitingClient,

  /// Reserva confirmada: listo para iniciar (CONFIRMED).
  confirmed,

  /// Viaje en curso (IN_PROGRESS).
  inProgress,

  /// Viaje liquidado (COMPLETED). El conductor cierra la tarjeta.
  completed,
}

/// Viaje intermunicipal aceptado por el conductor y su fase actual.
class IntercityActiveTrip {
  const IntercityActiveTrip({
    required this.request,
    required this.phase,
    required this.fare,
  });

  final IntercityRequestEntity request;
  final IntercityTripPhase phase;

  /// Tarifa vigente: la contraoferta si la hubo, o la oferta del pasajero.
  /// Al completar, el backend devuelve la final liquidada.
  final double fare;

  IntercityActiveTrip copyWith({IntercityTripPhase? phase, double? fare}) =>
      IntercityActiveTrip(
        request: request,
        phase: phase ?? this.phase,
        fare: fare ?? this.fare,
      );
}

class IntercityDriverState {
  const IntercityDriverState({
    this.enabled = false,
    this.isLoading = false,
    this.requests = const [],
    this.active,
  });

  /// Disponibilidad del conductor para recibir solicitudes intermunicipales.
  final bool enabled;
  final bool isLoading;

  /// Ofertas pendientes recibidas por WebSocket.
  final List<IntercityRequestEntity> requests;

  /// Reserva aceptada en curso (una a la vez), o `null`.
  final IntercityActiveTrip? active;

  IntercityDriverState copyWith({
    bool? enabled,
    bool? isLoading,
    List<IntercityRequestEntity>? requests,
    IntercityActiveTrip? active,
    bool clearActive = false,
  }) =>
      IntercityDriverState(
        enabled: enabled ?? this.enabled,
        isLoading: isLoading ?? this.isLoading,
        requests: requests ?? this.requests,
        active: clearActive ? null : (active ?? this.active),
      );
}

class IntercityDriverNotifier extends StateNotifier<IntercityDriverState> {
  IntercityDriverNotifier(this._client, this._ws)
      : super(const IntercityDriverState()) {
    _reqSub = _ws.intercityRequests.listen(_onRequest);
    _cancelSub = _ws.intercityCancellations.listen(_onCancelled);
    _lifecycleSub = _ws.intercityLifecycle.listen(_onLifecycle);
    _errorSub = _ws.wsErrors.listen(_onWsError);
  }

  final DioClient _client;
  final DriverWsService _ws;

  StreamSubscription<IntercityRequestEntity>? _reqSub;
  StreamSubscription<String>? _cancelSub;
  StreamSubscription<IntercityLifecycleEvent>? _lifecycleSub;
  StreamSubscription<String>? _errorSub;

  void _onRequest(IntercityRequestEntity req) {
    // Reemplaza si ya existía (reoferta tras rechazo del cliente).
    final rest =
        state.requests.where((r) => r.bookingId != req.bookingId).toList();
    state = state.copyWith(requests: [req, ...rest]);
  }

  void _onCancelled(String bookingId) {
    final activeMatches = state.active?.request.bookingId == bookingId;
    state = state.copyWith(
      requests:
          state.requests.where((r) => r.bookingId != bookingId).toList(),
      clearActive: activeMatches,
    );
  }

  void _onLifecycle(IntercityLifecycleEvent event) {
    final active = state.active;
    if (active == null || active.request.bookingId != event.bookingId) return;

    switch (event.type) {
      case 'accept_ok':
        // Directo → confirmed; con contraoferta → el pasajero decide.
        state = state.copyWith(
          active: active.copyWith(
            phase: event.status == 'driver_found'
                ? IntercityTripPhase.waitingClient
                : IntercityTripPhase.confirmed,
          ),
        );
      case 'update':
        if (event.status == 'confirmed') {
          state = state.copyWith(
            active: active.copyWith(phase: IntercityTripPhase.confirmed),
          );
        } else if (event.status == 'cancelled' || event.status == 'searching') {
          // El pasajero canceló o rechazó la contraoferta.
          state = state.copyWith(clearActive: true);
        }
      case 'start_ok':
        state = state.copyWith(
          active: active.copyWith(phase: IntercityTripPhase.inProgress),
        );
      case 'complete_ok':
        state = state.copyWith(
          active: active.copyWith(
            phase: IntercityTripPhase.completed,
            fare: event.finalFare,
          ),
        );
    }
  }

  void _onWsError(String _) {
    // Un error del backend mientras la aceptación estaba en vuelo significa
    // que la reserva ya no está disponible (otro conductor ganó, o expiró).
    if (state.active?.phase == IntercityTripPhase.pending) {
      state = state.copyWith(clearActive: true);
    }
  }

  // ── Disponibilidad ──────────────────────────────────────────────────────────

  Future<void> loadAvailability() async {
    state = state.copyWith(isLoading: true);
    try {
      final res = await _client.get<Map<String, dynamic>>(
        '/driver/intercity/availability',
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      state = state.copyWith(
        enabled: data?['enabled'] as bool? ?? false,
        isLoading: false,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  /// Devuelve `null` si guardó bien, o un mensaje de error.
  Future<String?> setAvailability({required bool enabled}) async {
    final previous = state.enabled;
    state = state.copyWith(enabled: enabled);
    try {
      await _client.put<Map<String, dynamic>>(
        '/driver/intercity/availability',
        data: {'enabled': enabled},
      );
      return null;
    } catch (_) {
      state = state.copyWith(enabled: previous);
      return 'No se pudo actualizar tu disponibilidad.';
    }
  }

  // ── Respuesta a ofertas ─────────────────────────────────────────────────────

  void accept(String bookingId, {double? counterFare}) {
    final req = state.requests
        .where((r) => r.bookingId == bookingId)
        .toList();
    _ws.acceptIntercity(bookingId, counterFare: counterFare);
    state = state.copyWith(
      requests:
          state.requests.where((r) => r.bookingId != bookingId).toList(),
      // La tarjeta pasa a "viaje activo" en fase pending hasta el accept_ok.
      active: req.isEmpty
          ? state.active
          : IntercityActiveTrip(
              request: req.first,
              phase: IntercityTripPhase.pending,
              fare: counterFare ?? req.first.offeredFare,
            ),
    );
  }

  void reject(String bookingId) {
    _ws.rejectIntercity(bookingId);
    _onCancelled(bookingId);
  }

  // ── Ciclo del viaje activo ──────────────────────────────────────────────────

  void startTrip() {
    final active = state.active;
    if (active == null || active.phase != IntercityTripPhase.confirmed) return;
    _ws.startIntercity(active.request.bookingId);
  }

  void completeTrip() {
    final active = state.active;
    if (active == null || active.phase != IntercityTripPhase.inProgress) return;
    _ws.completeIntercity(active.request.bookingId);
  }

  /// Cierra la tarjeta del viaje ya liquidado.
  void dismissCompleted() {
    if (state.active?.phase == IntercityTripPhase.completed) {
      state = state.copyWith(clearActive: true);
    }
  }

  @override
  void dispose() {
    _reqSub?.cancel();
    _cancelSub?.cancel();
    _lifecycleSub?.cancel();
    _errorSub?.cancel();
    super.dispose();
  }
}

final intercityDriverProvider =
    StateNotifierProvider<IntercityDriverNotifier, IntercityDriverState>(
        (ref) {
  return IntercityDriverNotifier(DioClient(), DriverWsService());
});
