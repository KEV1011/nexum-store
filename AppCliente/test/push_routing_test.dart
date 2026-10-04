import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/core/services/push_routing.dart';

/// Si esta tabla se equivoca, el pasajero toca «Tu conductor llegó» y aterriza
/// en cualquier parte, con el taxi esperándolo en la puerta.
void main() {
  group('a dónde lleva cada notificación', () {
    test('el viaje en curso lleva al seguimiento, con su id', () {
      const id = 'trip_abc123';
      for (final t in ['trip_accepted', 'trip_arrived', 'trip_in_progress']) {
        expect(
          rutaDeNotificacion({'type': t, 'tripId': id}),
          AppRoutes.transportTrackingPath(id),
          reason: t,
        );
      }
    });

    test('sin tripId cae al home en vez de romper la ruta paramétrica', () {
      // `/transport/tracking/:id` sin id no existe: navegar ahí dejaría al
      // usuario en una pantalla de error por una notificación mal formada.
      expect(rutaDeNotificacion({'type': 'trip_arrived'}), AppRoutes.home);
      expect(
        rutaDeNotificacion({'type': 'trip_arrived', 'tripId': ''}),
        AppRoutes.home,
      );
    });

    test('un viaje terminado NO lleva al seguimiento', () {
      // No tiene nada que enseñar y el mapa saldría congelado.
      for (final t in ['trip_completed', 'trip_cancelled', 'trip_no_driver']) {
        expect(rutaDeNotificacion({'type': t, 'tripId': 'x'}), AppRoutes.home,
            reason: t);
      }
    });

    test('el pedido en curso lleva a su detalle; el entregado, al home', () {
      expect(
        rutaDeNotificacion({'type': 'order_in_transit', 'orderId': 'o1'}),
        AppRoutes.orderPath('o1'),
      );
      expect(
        rutaDeNotificacion({'type': 'order_delivered', 'orderId': 'o1'}),
        AppRoutes.home,
      );
    });

    test('mandados, intermunicipal y fletes van a los suyos', () {
      expect(
        rutaDeNotificacion({'type': 'errand_accepted'}),
        AppRoutes.errandStatus,
      );
      expect(
        rutaDeNotificacion({'type': 'intercity_update'}),
        AppRoutes.intercityStatus,
      );
      expect(
        rutaDeNotificacion({'type': 'freight_completed'}),
        AppRoutes.freight,
      );
    });

    test('el recordatorio de la reserva lleva al seguimiento de SU viaje', () {
      // Ahí se ve la hora reservada, el conductor que la apartó y el punto de
      // recogida: lo que el pasajero quiere comprobar al leer «tu viaje es a
      // las 6:00». Sin tripId se cae al home en vez de romper la ruta.
      expect(
        rutaDeNotificacion({'type': 'reserva_recordatorio', 'tripId': 't1'}),
        AppRoutes.transportTrackingPath('t1'),
      );
      expect(
        rutaDeNotificacion({'type': 'reserva_recordatorio'}),
        AppRoutes.home,
      );
    });

    test('lo desconocido devuelve null y no mueve al usuario', () {
      expect(rutaDeNotificacion({'type': 'promo_del_mes'}), isNull);
      expect(rutaDeNotificacion(<String, dynamic>{}), isNull);
      expect(rutaDeNotificacion({'type': 7}), isNull);
    });
  });
}
