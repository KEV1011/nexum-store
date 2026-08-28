/// El viaje que el conductor ya aceptó y hará **en cuanto termine el actual**.
///
/// Es toda la memoria que necesitan los viajes encadenados. El despacho le
/// ofrece el siguiente servicio cuando va llegando a dejar a su pasajero —como
/// Uber y DiDi— y al aceptarlo NO puede entrar en él: todavía lleva a alguien
/// dentro. Se guarda aquí y la pantalla de resumen, al cerrar el viaje que
/// acaba, ofrece entrar directo en vez de mandarlo al inicio.
///
/// Uno, no una lista, y es a propósito: el backend tampoco encadena más de uno
/// (ver la guarda `NOT EXISTS` del despacho). Prometer dos viajes a la vez es
/// dejar a alguien tirado.
///
/// Vive en memoria y se pierde si la app se cierra. Es correcto: el viaje sigue
/// asignado a él en el servidor, y al reabrir la app lo recupera por el camino
/// de siempre — el de un viaje aceptado cualquiera.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';

class SiguienteViajeNotifier extends StateNotifier<TripRequestEntity?> {
  SiguienteViajeNotifier() : super(null);

  /// Lo guarda tras aceptarlo. Si ya había uno (no debería: el servidor no
  /// encadena dos), gana el que ya estaba: es el que lleva más esperando.
  void encolar(TripRequestEntity viaje) {
    if (state != null) return;
    state = viaje;
  }

  /// Lo saca de la cola y lo devuelve, para entrar en él.
  TripRequestEntity? tomar() {
    final v = state;
    state = null;
    return v;
  }

  void limpiar() => state = null;
}

final siguienteViajeProvider =
    StateNotifierProvider<SiguienteViajeNotifier, TripRequestEntity?>(
  (ref) => SiguienteViajeNotifier(),
);
