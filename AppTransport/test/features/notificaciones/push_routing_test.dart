import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/shared/services/push_routing.dart';

/// Una entrada mal puesta en esta tabla manda al conductor al sitio equivocado
/// justo cuando la notificación le pedía hacer algo, y con la mano en el
/// volante. Por eso se prueba.
void main() {
  group('a dónde lleva cada notificación', () {
    test('una solicitud lleva al home, que es donde se pinta la oferta', () {
      for (final t in [
        'trip_request', 'errand_request', 'order_request', 'intercity_request',
      ]) {
        expect(rutaDeNotificacion({'type': t}), AppRoutes.home, reason: t);
      }
    });

    test('los documentos llevan a resolverlos', () {
      // Es lo único que puede dejarlo sin trabajar: el kill-switch documental
      // lo saca del despacho. Llevarlo al home sería dejarlo adivinando.
      expect(rutaDeNotificacion({'type': 'document'}), AppRoutes.verification);
      expect(
        rutaDeNotificacion({'type': 'compliance_update'}),
        AppRoutes.verification,
      );
    });

    test('una cancelación lleva al home, NO al viaje activo', () {
      // El viaje ya no existe; `/active-trip` lo devolvería solo con una
      // pantalla vacía y parecería que la app se rompió.
      expect(rutaDeNotificacion({'type': 'trip_cancelled'}), AppRoutes.home);
    });

    test('los fletes llevan a sus fletes y el pago a la billetera', () {
      expect(
        rutaDeNotificacion({'type': 'freight_new'}),
        AppRoutes.driverFreights,
      );
      expect(rutaDeNotificacion({'type': 'payout'}), AppRoutes.wallet);
    });

    test('lo que no lleva a ningún sitio devuelve null, no el home', () {
      // Sacar al conductor de lo que estaba haciendo por un aviso que no le
      // pide nada es peor que no navegar.
      expect(rutaDeNotificacion({'type': 'safety_alert'}), isNull);
      expect(rutaDeNotificacion({'type': 'tipo_que_no_existe'}), isNull);
    });

    test('sin tipo no revienta', () {
      // El `data` viene de fuera; una notificación mal formada no puede tumbar
      // el arranque de la app.
      expect(rutaDeNotificacion(<String, dynamic>{}), isNull);
      expect(rutaDeNotificacion({'type': ''}), isNull);
      expect(rutaDeNotificacion({'type': 42}), isNull);
      expect(rutaDeNotificacion({'type': null}), isNull);
    });
  });
}
