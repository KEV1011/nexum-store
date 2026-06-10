import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/intercity/domain/entities/intercity_request_entity.dart';
import 'package:nexum_driver/shared/services/ws_service.dart';

class IntercityDriverState {
  const IntercityDriverState({
    this.enabled = false,
    this.isLoading = false,
    this.requests = const [],
  });

  /// Disponibilidad del conductor para recibir solicitudes intermunicipales.
  final bool enabled;
  final bool isLoading;

  /// Ofertas pendientes recibidas por WebSocket.
  final List<IntercityRequestEntity> requests;

  IntercityDriverState copyWith({
    bool? enabled,
    bool? isLoading,
    List<IntercityRequestEntity>? requests,
  }) =>
      IntercityDriverState(
        enabled: enabled ?? this.enabled,
        isLoading: isLoading ?? this.isLoading,
        requests: requests ?? this.requests,
      );
}

class IntercityDriverNotifier extends StateNotifier<IntercityDriverState> {
  IntercityDriverNotifier(this._client, this._ws)
      : super(const IntercityDriverState()) {
    _reqSub = _ws.intercityRequests.listen(_onRequest);
    _cancelSub = _ws.intercityCancellations.listen(_onCancelled);
  }

  final DioClient _client;
  final WsService _ws;

  StreamSubscription<IntercityRequestEntity>? _reqSub;
  StreamSubscription<String>? _cancelSub;

  void _onRequest(IntercityRequestEntity req) {
    // Reemplaza si ya existía (reoferta tras rechazo del cliente).
    final rest =
        state.requests.where((r) => r.bookingId != req.bookingId).toList();
    state = state.copyWith(requests: [req, ...rest]);
  }

  void _onCancelled(String bookingId) {
    state = state.copyWith(
      requests:
          state.requests.where((r) => r.bookingId != bookingId).toList(),
    );
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
    _ws.acceptIntercity(bookingId, counterFare: counterFare);
    _onCancelled(bookingId);
  }

  void reject(String bookingId) {
    _ws.rejectIntercity(bookingId);
    _onCancelled(bookingId);
  }

  @override
  void dispose() {
    _reqSub?.cancel();
    _cancelSub?.cancel();
    super.dispose();
  }
}

final intercityDriverProvider =
    StateNotifierProvider<IntercityDriverNotifier, IntercityDriverState>(
        (ref) {
  return IntercityDriverNotifier(DioClient(), WsService());
});
