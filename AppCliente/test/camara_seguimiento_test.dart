import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/transport/domain/camara_seguimiento.dart';

void main() {
  group('encuadrePara', () {
    test('lejos: enseña el trayecto completo, no persigue al vehículo', () {
      expect(encuadrePara(5000).seguirVehiculo, isFalse);
      expect(encuadrePara(kSeguirDesdeM + 1).seguirVehiculo, isFalse);
    });

    test('dentro del umbral: la cámara sigue al vehículo', () {
      expect(encuadrePara(kSeguirDesdeM).seguirVehiculo, isTrue);
      expect(encuadrePara(10).seguirVehiculo, isTrue);
    });

    test('cuanto más cerca, más zoom (nunca al revés)', () {
      // La propiedad que importa: acercarse jamás puede alejar la cámara. Un
      // umbral mal ordenado saldría aquí y no en el teléfono del pasajero.
      const distancias = [1400.0, 900.0, 601.0, 400.0, 251.0, 200.0, 81.0, 40.0, 0.0];
      var anterior = 0.0;
      for (final d in distancias) {
        final z = encuadrePara(d).zoom;
        expect(z, greaterThanOrEqualTo(anterior),
            reason: 'a $d m el zoom bajó de $anterior a $z');
        anterior = z;
      }
    });

    test('en la puerta, el zoom es el más cerrado', () {
      expect(encuadrePara(10).zoom, greaterThan(encuadrePara(500).zoom));
      expect(encuadrePara(10).zoom, 18.5);
    });

    test('un dato roto no acerca la cámara a ciegas', () {
      // Ante NaN o negativos se enseña el conjunto: equivocarse hacia "de más
      // lejos" es inofensivo; hacia "en la puerta" enseñaría una manzana
      // cualquiera como si el carro estuviera llegando.
      expect(encuadrePara(double.nan).seguirVehiculo, isFalse);
      expect(encuadrePara(-1).seguirVehiculo, isFalse);
      expect(encuadrePara(double.infinity).seguirVehiculo, isFalse);
    });
  });

  group('metrosEntre', () {
    test('el mismo punto son cero metros', () {
      expect(metrosEntre(7.3754, -72.6486, 7.3754, -72.6486), closeTo(0, 0.001));
    });

    test('0,01° de latitud son ~1113 m', () {
      expect(metrosEntre(7.3754, -72.6486, 7.3854, -72.6486), closeTo(1113, 3));
    });

    test('es simétrica', () {
      final ida = metrosEntre(7.37, -72.64, 7.39, -72.66);
      final vuelta = metrosEntre(7.39, -72.66, 7.37, -72.64);
      expect(ida, closeTo(vuelta, 0.001));
    });
  });
}
