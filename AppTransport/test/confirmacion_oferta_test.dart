/// «Aceptar» no entra al servicio hasta que el servidor diga que sí.
///
/// La app entraba al viaje al tocar el botón, sin leer la respuesta. Si el
/// servidor decía que no, el conductor se quedaba con un servicio fantasma:
/// camino de una recogida que no era suya, sin un aviso.
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/shared/services/confirmacion_oferta.dart';

void main() {
  group('qué significa cada respuesta del servidor', () {
    test('los tres «sí», uno por tipo de servicio', () {
      expect(
        leerRespuestaDeAceptacion(
          {'type': 'trip_accepted', 'trip': {'id': 't1'}},
          {'trip:t1'},
        )?.confirmada,
        isTrue,
      );
      expect(
        leerRespuestaDeAceptacion(
          {'type': 'errand_update', 'errandId': 'e1', 'errand': <String, dynamic>{}},
          {'errand:e1'},
        )?.confirmada,
        isTrue,
      );
      expect(
        leerRespuestaDeAceptacion(
          {'type': 'order_accept_ok', 'orderId': 'o1'},
          {'order:o1'},
        )?.confirmada,
        isTrue,
      );
    });

    test('el «no» del servidor trae su motivo y se atribuye por id', () {
      final r = leerRespuestaDeAceptacion(
        {'type': 'offer_gone', 'kind': 'order', 'id': 'o1', 'message': 'La tomó otro.'},
        {'order:o1', 'trip:t9'},
      );
      expect(r?.clave, 'order:o1');
      expect(r?.motivo, 'La tomó otro.');
    });

    test('un «no» sin texto no se queda mudo', () {
      final r = leerRespuestaDeAceptacion(
        {'type': 'offer_gone', 'kind': 'trip', 'id': 't1'},
        {'trip:t1'},
      );
      expect(r?.motivo, kOfertaYaNoDisponible);
    });

    test('el error de texto del servidor anterior cuenta si solo hay una esperando', () {
      for (final texto in [
        'Trip abc is no longer available',
        'Errand abc is no longer available',
        'El pedido ya no está disponible',
        'Already handling an errand',
      ]) {
        final r = leerRespuestaDeAceptacion(
          {'type': 'error', 'message': texto},
          {'errand:e1'},
        );
        expect(r?.clave, 'errand:e1', reason: texto);
        expect(r?.confirmada, isFalse, reason: texto);
      }
    });

    test('con DOS esperando, un error sin id no tumba ninguna', () {
      // No se sabe a cuál se refiere: adivinar anularía la que sí entró.
      expect(
        leerRespuestaDeAceptacion(
          {'type': 'error', 'message': 'Trip abc is no longer available'},
          {'trip:t1', 'order:o1'},
        ),
        isNull,
      );
    });

    test('un error que no es un rechazo no cancela la aceptación', () {
      expect(
        leerRespuestaDeAceptacion(
          {'type': 'error', 'message': 'lat and lng required as numbers'},
          {'trip:t1'},
        ),
        isNull,
      );
    });

    test('la respuesta de OTRO servicio no confirma este', () {
      expect(
        leerRespuestaDeAceptacion(
          {'type': 'order_accept_ok', 'orderId': 'o2'},
          {'order:o1'},
        ),
        isNull,
      );
      // Un `errand_update` de un mandado que no se está aceptando (el avance
      // de uno en curso) no es un «sí» a nada.
      expect(
        leerRespuestaDeAceptacion(
          {'type': 'errand_update', 'errandId': 'e7'},
          {'trip:t1'},
        ),
        isNull,
      );
    });

    test('sin nada esperando, ningún mensaje responde a nada', () {
      expect(
        leerRespuestaDeAceptacion({'type': 'order_accept_ok', 'orderId': 'o1'}, {}),
        isNull,
      );
    });

    test('un mensaje malformado no lanza', () {
      for (final m in <Map<String, dynamic>>[
        {'type': 'trip_accepted'},
        {'type': 'trip_accepted', 'trip': 'x'},
        {'type': 'offer_gone', 'kind': 3, 'id': 'a'},
        {'type': 'error'},
        {'type': 'order_accept_ok', 'orderId': 5},
        <String, dynamic>{},
      ]) {
        expect(leerRespuestaDeAceptacion(m, {'trip:t1'}), isNull);
      }
    });
  });

  // Reglas sobre el flujo de las pantallas, que no se pueden montar aquí sin
  // el socket real: se vigila el fuente, como en `ofertas_no_se_pierden_test`.
  group('las pantallas esperan la confirmación', () {
    final home = File(
      'lib/features/driver_status/presentation/screens/home_screen.dart',
    ).readAsStringSync();
    final viaje = File(
      'lib/features/active_trip/presentation/screens/active_trip_screen.dart',
    ).readAsStringSync();
    final socket = File(
      'lib/shared/services/driver_ws_service.dart',
    ).readAsStringSync();

    String cuerpoDe(String fuente, String firma) {
      final i = fuente.indexOf(firma);
      expect(i, greaterThan(0), reason: 'no se encontró $firma');
      final fin = fuente.indexOf('\n  }\n', i);
      return fuente.substring(i, fin);
    }

    test('el inicio no entra al viaje antes de que el servidor confirme', () {
      final aceptar = cuerpoDe(home, 'Future<void> _acceptTrip(');
      final espera = aceptar.indexOf('aceptarOferta(');
      final entra = aceptar.indexOf('beginTrip(');
      expect(espera, greaterThan(0));
      expect(entra, greaterThan(espera),
          reason: 'beginTrip tiene que ir DESPUÉS de esperar la respuesta');
      expect(aceptar.contains('if (motivo != null)'), isTrue);
      // Ni un envío suelto que se salte la espera.
      expect(aceptar.contains('sendAccept'), isFalse);
    });

    test('el viaje encadenado no se encola antes de que el servidor confirme', () {
      final aceptar = cuerpoDe(viaje, 'Future<void> _aceptarEncadenado(');
      final espera = aceptar.indexOf('aceptarOferta(');
      final encola = aceptar.indexOf('.encolar(');
      expect(espera, greaterThan(0));
      expect(encola, greaterThan(espera));
      expect(aceptar.contains('sendAccept'), isFalse);
    });

    test('el viaje activo escucha la cancelación de los TRES servicios', () {
      // Solo escuchaba la de pedidos: en un viaje o un mandado cancelado, el
      // conductor seguía hacia la recogida sin enterarse.
      expect(viaje.contains('orderCancellations.listen'), isTrue);
      expect(viaje.contains('errandCancellations.listen'), isTrue);
      expect(viaje.contains('tripCancellations.listen'), isTrue);
    });

    test('la oferta que llega con otra pantalla encima se avisa', () {
      final llega = cuerpoDe(home, 'void _onTripRequest(');
      expect(llega.contains('_avisarSiElInicioEstaTapado()'), isTrue);
    });

    test('el socket se vigila con un latido propio', () {
      // Sin él, un socket muerto por un cambio de red sigue «conectado».
      expect(socket.contains("_send({'type': 'ping'})"), isTrue);
      expect(socket.contains('_arrancarLatido();'), isTrue);
      final limpiar = cuerpoDe(socket, 'void _cleanup() {');
      expect(limpiar.contains('_latido?.cancel()'), isTrue,
          reason: 'un latido que sobrevive al socket cerraría el siguiente');
    });
  });
}
