import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/network/dio_client.dart';

/// Preferencias de servicio urbano del conductor: qué tipos de solicitud
/// recibe (viajes / mandados-envíos / pedidos). El matching del backend las
/// respeta al elegir candidatos. Intermunicipal tiene su propio provider
/// (intercityDriverProvider) y NO se duplica aquí.
class ServicePrefsState {
  const ServicePrefsState({
    this.trips = true,
    this.errands = true,
    this.orders = true,
    this.chained = true,
    this.isLoading = false,
  });

  final bool trips;
  final bool errands;
  final bool orders;

  /// Recibir la siguiente solicitud mientras se termina la actual, ya cerca del
  /// destino. Activo por defecto: sin esto el conductor llega a dejar al
  /// pasajero y no ve el servicio que acaba de salir a dos cuadras.
  final bool chained;

  final bool isLoading;

  ServicePrefsState copyWith({
    bool? trips,
    bool? errands,
    bool? orders,
    bool? chained,
    bool? isLoading,
  }) {
    return ServicePrefsState(
      trips: trips ?? this.trips,
      errands: errands ?? this.errands,
      orders: orders ?? this.orders,
      chained: chained ?? this.chained,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class ServicePrefsNotifier extends StateNotifier<ServicePrefsState> {
  ServicePrefsNotifier(this._client) : super(const ServicePrefsState());

  final DioClient _client;

  Future<void> load() async {
    state = state.copyWith(isLoading: true);
    try {
      final res =
          await _client.get<Map<String, dynamic>>('/driver/service-prefs');
      final data = res.data?['data'] as Map<String, dynamic>?;
      state = state.copyWith(
        trips: data?['trips'] as bool? ?? true,
        errands: data?['errands'] as bool? ?? true,
        orders: data?['orders'] as bool? ?? true,
        chained: data?['chained'] as bool? ?? true,
        isLoading: false,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  /// Actualización optimista con rollback. Devuelve un mensaje de error o null.
  Future<String?> set({
    bool? trips,
    bool? errands,
    bool? orders,
    bool? chained,
  }) async {
    final previous = state;
    state = state.copyWith(
      trips: trips, errands: errands, orders: orders, chained: chained,
    );
    try {
      await _client.put<Map<String, dynamic>>(
        '/driver/service-prefs',
        data: {
          if (trips != null) 'trips': trips,
          if (errands != null) 'errands': errands,
          if (orders != null) 'orders': orders,
          if (chained != null) 'chained': chained,
        },
      );
      return null;
    } catch (_) {
      state = previous;
      return 'No se pudo guardar la preferencia.';
    }
  }
}

final servicePrefsProvider =
    StateNotifierProvider<ServicePrefsNotifier, ServicePrefsState>((ref) {
  return ServicePrefsNotifier(DioClient());
});
