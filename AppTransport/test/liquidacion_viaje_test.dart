/// Lo que el conductor ve que ganó al cerrar un viaje.
///
/// Es la cifra que el servidor LIQUIDÓ, no una que la app recalcule — ese
/// error ya se cometió dos veces en este repo (el resumen del viaje y la
/// pantalla de ganancias derivaban la comisión con una tasa escrita dentro) y
/// la regla quedó: comisión = bruto − neto, los dos del servidor.
///
/// Esta parte no habla con la red ni con el socket, así que se puede fijar
/// entera: lo único que hace es leer el JSON de la liquidación. Y es donde
/// duele equivocarse, porque lo que sale de aquí es el dinero que el conductor
/// cree haber ganado.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/shared/services/trip_completion.dart';

void main() {
  group('la liquidación que manda el servidor', () {
    test('se lee tal cual', () {
      final l = LiquidacionViaje.desdeJson({
        'finalFare': 21000.0,
        'netEarning': 17850.0,
        'commission': 3150.0,
      });
      expect(l, isNotNull);
      expect(l!.finalFare, 21000);
      expect(l.netEarning, 17850);
      expect(l.commission, 3150);
    });

    test('acepta enteros, que es como viajan en JSON', () {
      // El servidor manda `21000`, no `21000.0`: un `as double` habría
      // lanzado en producción y no en una prueba escrita con decimales.
      final l = LiquidacionViaje.desdeJson({
        'finalFare': 21000,
        'netEarning': 17850,
        'commission': 3150,
      });
      expect(l?.finalFare, 21000);
      expect(l?.netEarning, 17850);
    });

    test('SIN tarifa final no hay liquidación: no se inventa un cero', () {
      // La regla que sostiene el resto: un «$0 ganado» se lee como que el
      // viaje no pagó, y eso es peor que no enseñar nada. Sin el dato, la
      // pantalla cae a su estimación y lo dice.
      expect(LiquidacionViaje.desdeJson({'netEarning': 17850}), isNull);
      expect(LiquidacionViaje.desdeJson({'finalFare': null}), isNull);
    });

    test('neto y comisión ausentes valen cero, la tarifa manda', () {
      // Aquí sí es correcto el cero: la tarifa está, así que el viaje se
      // liquidó; lo que falta es el desglose.
      final l = LiquidacionViaje.desdeJson({'finalFare': 9000});
      expect(l?.finalFare, 9000);
      expect(l?.netEarning, 0);
      expect(l?.commission, 0);
    });

    test('lo que no es un objeto devuelve null en vez de reventar', () {
      // Llega de un mensaje del socket: si lanzara, no se perdería la cifra,
      // se perdería el cierre del viaje.
      expect(LiquidacionViaje.desdeJson(null), isNull);
      expect(LiquidacionViaje.desdeJson('21000'), isNull);
      expect(LiquidacionViaje.desdeJson(<String>['21000']), isNull);
      expect(LiquidacionViaje.desdeJson(21000), isNull);
    });

    test('un campo con el tipo equivocado no tumba el resto', () {
      // El servidor manda texto por error en el desglose: la tarifa sigue
      // valiendo y el desglose cae a cero.
      final l = LiquidacionViaje.desdeJson({
        'finalFare': 12000,
        'netEarning': 'diez mil',
      });
      expect(l?.finalFare, 12000);
      expect(l?.netEarning, 0);
    });
  });
}
