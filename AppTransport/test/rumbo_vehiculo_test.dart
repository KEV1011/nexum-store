import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

import 'package:nexum_driver/core/utils/rumbo_vehiculo.dart';

// Pamplona. 1 m al norte ≈ 1/110540 grados de latitud.
const _base = LatLng(7.3754, -72.6486);
LatLng _norte(LatLng p, double m) => LatLng(p.latitude + m / 110540, p.longitude);
LatLng _este(LatLng p, double m) =>
    LatLng(p.latitude, p.longitude + m / (111320 * 0.99172));

void main() {
  group('rumbo que no tiembla', () {
    test('parado (deriva de 3 m) no da rumbo', () {
      expect(rumboSiAvanzo(_base, _norte(_base, 3)), isNull);
    });

    test('avanzando hacia el este da 90°', () {
      expect(rumboSiAvanzo(_base, _este(_base, 30)), closeTo(90, 1));
    });

    test('a paso lento los metros se ACUMULAN contra el ancla', () {
      // Cinco lecturas de 2 m: ningún par supera el umbral, pero el total sí.
      final r = RumboEstable(); // el arranque es 0 (norte)
      var p = _base;
      r.mover(p);
      for (var i = 0; i < 5; i++) {
        p = _este(p, 2);
        r.mover(p);
      }
      expect(r.rumbo, closeTo(90, 2));
    });

    test('la deriva en un semáforo no lo hace girar', () {
      final r = RumboEstable()..fijar(90, _base);
      for (final p in [_norte(_base, 2), _norte(_base, -3), _este(_base, -2)]) {
        expect(r.mover(p), 90);
      }
    });

    test('el heading del GPS solo se cree en movimiento', () {
      expect(rumboDelGps(heading: 120, velocidadMs: 0.4), isNull);
      expect(rumboDelGps(heading: 0, velocidadMs: 8), isNull);
      expect(rumboDelGps(heading: 120, velocidadMs: 8), 120);
    });
  });

  group('giro por el lado corto', () {
    test('de 350° a 10° son 20° a la derecha, no una vuelta entera', () {
      expect(rumboContinuo(350, 10), 370);
      expect(rumboContinuo(10, 350), -10);
      expect(rumboContinuo(720, 90), 810);
    });
  });

  group('pegar a la vía', () {
    final ruta = [_base, _este(_base, 110)];

    test('a 10 m de la calle se dibuja SOBRE la calle, con su rumbo', () {
      final p = _norte(_este(_base, 50), 10);
      final r = pegarARuta(p, ruta)!;
      expect(r.punto.latitude, closeTo(_base.latitude, 1e-7));
      expect(r.rumbo, closeTo(90, 1));
    });

    test('desviado (a 60 m) se dibuja donde está', () {
      expect(pegarARuta(_norte(_este(_base, 50), 60), ruta), isNull);
    });

    test('sin ruta no se pega a nada', () {
      expect(pegarARuta(_base, const []), isNull);
      expect(pegarARuta(_base, [_base]), isNull);
    });
  });

  test('el archivo es IDÉNTICO en las dos apps', () {
    const rel = 'lib/core/utils/rumbo_vehiculo.dart';
    final a = File('../AppTransport/$rel');
    final b = File('../AppCliente/$rel');
    if (!a.existsSync() || !b.existsSync()) return; // una sola app en el checkout
    expect(a.readAsStringSync(), b.readAsStringSync());
  });
}
