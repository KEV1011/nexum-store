import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';

/// El precio es lo primero que mira el conductor antes de aceptar y lo último
/// que mira al terminar. Si está mal escrito, la app parece improvisada aunque
/// el número sea correcto.
///
/// La trampa que estas pruebas fijan: `NumberFormat.currency(locale: 'es_CO')`
/// pone el símbolo DETRÁS («5.200 $») porque el parámetro `symbol` solo cambia
/// el carácter, no su posición. Salió así en producción y nadie lo vio hasta
/// una captura.
void main() {
  group('formato de pesos colombianos', () {
    test('el peso va DELANTE, nunca detrás', () {
      expect(CurrencyFormatter.format(5200), '\$5.200');
      expect(CurrencyFormatter.format(5200).endsWith('\$'), isFalse);
    });

    test('el punto separa los miles', () {
      // En Colombia «15.750» son quince mil setecientos cincuenta.
      expect(CurrencyFormatter.format(15750), '\$15.750');
      expect(CurrencyFormatter.format(1250000), '\$1.250.000');
    });

    test('sin decimales en el formato normal', () {
      // Una tarifa de taxi no lleva centavos: no hay monedas de a peso.
      expect(CurrencyFormatter.format(8700.4), '\$8.700');
      expect(CurrencyFormatter.format(0), '\$0');
    });

    test('con centavos usa la coma decimal', () {
      expect(CurrencyFormatter.formatWithCents(15750.5), '\$15.750,50');
    });

    test('el código va al final', () {
      expect(CurrencyFormatter.formatWithCode(15750), '\$15.750 COP');
    });

    test('leer «\$15.750» devuelve quince mil, no quince', () {
      // El punto es separador de MILES. Tratarlo como decimal convertía
      // quince mil pesos en quince.
      expect(CurrencyFormatter.parse('\$15.750'), 15750);
      expect(CurrencyFormatter.parse('5.200 \$'), 5200);
      expect(CurrencyFormatter.parse('15.750,50'), closeTo(15750.5, 0.001));
    });

    test('lo que no se entiende vale cero, no revienta', () {
      expect(CurrencyFormatter.parse(''), 0);
      expect(CurrencyFormatter.parse('gratis'), 0);
    });
  });
}
