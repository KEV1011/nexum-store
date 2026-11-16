/// «Recogido» y «entregado» de un pedido o un mandado esperan al servidor.
///
/// Viajaban solo por el socket, que no acusa recibo: con la conexión caída el
/// mensaje se descartaba en silencio y la app enseñaba el resumen igual. El
/// servidor no liquidaba el domicilio, el cliente seguía viendo «en camino» y
/// el repartidor quedaba «en viaje» — fuera del despacho — sin enterarse.
///
/// Aquí se fija qué significa cada respuesta del servidor (pura, sin red) y,
/// sobre el fuente, que la pantalla no vuelva a mandar esos dos pasos a
/// ciegas.
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/shared/services/trip_completion.dart';

void main() {
  group('qué hacer con lo que contestó el servidor', () {
    test('sin respuesta se insiste', () {
      expect(leerRechazoDeEstado(null, null), RechazoDeEstado.reintentar);
    });

    test('un servidor caído o reiniciando se insiste, no se da por rechazado',
        () {
      for (final s in [500, 502, 503, 504, 408, 429]) {
        expect(leerRechazoDeEstado(s, '<html>Bad Gateway</html>'),
            RechazoDeEstado.reintentar,
            reason: 'status $s');
      }
    });

    test('el 404 del servidor que aún no tiene la ruta: se usa el socket', () {
      expect(
        leerRechazoDeEstado(
            404, {'success': false, 'error': 'Route not found'}),
        RechazoDeEstado.rutaAusente,
      );
    });

    test('el 404 de «ese pedido no es tuyo» NO es un servidor viejo', () {
      // Si se confundieran, un pedido ajeno caería al socket y la pantalla
      // seguiría adelante como si se hubiera entregado.
      expect(
        leerRechazoDeEstado(404, {
          'success': false,
          'error': 'Ese pedido no existe o no está asignado a ti',
        }),
        RechazoDeEstado.definitivo,
      );
    });

    test('409: el cliente lo canceló', () {
      expect(
        leerRechazoDeEstado(409, {'error': 'Este pedido fue cancelado.'}),
        RechazoDeEstado.cancelado,
      );
    });

    test('400 marcado como PIN: se vuelve a pedir el código', () {
      expect(
        leerRechazoDeEstado(
            400, {'error': 'El PIN no coincide', 'code': 'custody_pin'}),
        RechazoDeEstado.pin,
      );
    });

    test('un 400 sin esa marca no reabre el diálogo del PIN', () {
      expect(
        leerRechazoDeEstado(400, {'error': 'El estado debe ser uno de: …'}),
        RechazoDeEstado.definitivo,
      );
    });

    test('403 y 401 son definitivos', () {
      expect(leerRechazoDeEstado(403, {'error': 'no es tuyo'}),
          RechazoDeEstado.definitivo);
      expect(leerRechazoDeEstado(401, null), RechazoDeEstado.definitivo);
    });

    test('un cuerpo que no es un mapa no tumba la lectura', () {
      expect(leerRechazoDeEstado(404, 'Not Found'), RechazoDeEstado.definitivo);
      expect(leerRechazoDeEstado(400, [1, 2]), RechazoDeEstado.definitivo);
    });

    test('se enseña el motivo del servidor, y si no hay, uno propio', () {
      expect(motivoDelRechazo({'error': 'El PIN de entrega no coincide.'}, 'x'),
          'El PIN de entrega no coincide.');
      expect(motivoDelRechazo({'error': '  '}, 'por defecto'), 'por defecto');
      expect(motivoDelRechazo({'error': 42}, 'por defecto'), 'por defecto');
      expect(motivoDelRechazo(null, 'por defecto'), 'por defecto');
    });
  });

  group('la pantalla del viaje activo', () {
    final pantalla = File(
      'lib/features/active_trip/presentation/screens/active_trip_screen.dart',
    ).readAsStringSync();

    /// El cuerpo de un método, desde su firma hasta la siguiente a su nivel.
    String cuerpoDe(String firma) {
      final inicio = pantalla.indexOf(firma);
      expect(inicio, greaterThan(0), reason: 'no se encontró $firma');
      final fin = pantalla.indexOf('\n  }\n', inicio);
      return pantalla.substring(inicio, fin);
    }

    test('recoger y entregar pasan por la confirmación del servidor', () {
      for (final firma in [
        'Future<void> _handlePickupConfirm() async {',
        'Future<void> _handleFinishTrip() async {',
      ]) {
        final cuerpo = cuerpoDe(firma);
        expect(cuerpo.contains('_confirmarPaso('), isTrue, reason: firma);
        // El socket a ciegas solo queda dentro de `_confirmarPaso`, como
        // respaldo para un servidor que aún no tiene la ruta.
        expect(cuerpo.contains('sendOrderStatus('), isFalse, reason: firma);
        expect(cuerpo.contains('sendErrandStatus('), isFalse, reason: firma);
      }
    });

    test('la pantalla no avanza antes de que el servidor confirme', () {
      final recoger = cuerpoDe('Future<void> _handlePickupConfirm() async {');
      expect(
        recoger.indexOf('_confirmarPaso('),
        lessThan(recoger.indexOf('confirmPickupAndStart(')),
        reason: 'primero el servidor, después el estado local',
      );
      final entregar = cuerpoDe('Future<void> _handleFinishTrip() async {');
      expect(
        entregar.indexOf('_confirmarPaso('),
        lessThan(entregar.indexOf('.finishTrip()')),
        reason: 'sin confirmación no se cierra ni se enseña el resumen',
      );
    });

    test('el socket solo se usa si el servidor no tiene la ruta', () {
      final paso = cuerpoDe('Future<bool> _confirmarPaso({');
      expect(paso.contains('if (!confirmado) {'), isTrue);
      expect(paso.contains('e.cancelado'), isTrue,
          reason: 'un servicio cancelado cierra la pantalla');
      expect(paso.contains('errorText: e.mensaje'), isTrue,
          reason: 'un PIN rechazado se vuelve a pedir con su motivo');
    });
  });
}
