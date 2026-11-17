import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/features/pooled/domain/orden_recogidas.dart';

PuntoRecogida _p(String id, double lat, double lng) =>
    PuntoRecogida(bookingId: id, nombre: id, lat: lat, lng: lng);

void main() {
  test('pasa primero por el más cercano, no por el primero que reservó', () {
    final orden = ordenarRecogidas(7.3700, -72.6500, [
      _p('lejos', 7.3900, -72.6500),
      _p('cerca', 7.3710, -72.6500),
      _p('medio', 7.3800, -72.6500),
    ]);
    expect(orden.map((p) => p.bookingId), ['cerca', 'medio', 'lejos']);
  });

  test('sigue desde el último recogido, no desde el origen', () {
    // Desde el origen, B está más cerca que C; pero desde A, C está al lado.
    final orden = ordenarRecogidas(0.0, 0.0, [
      _p('A', 0.010, 0.0),
      _p('B', -0.011, 0.0),
      _p('C', 0.012, 0.0),
    ]);
    expect(orden.map((p) => p.bookingId), ['A', 'C', 'B']);
  });

  test('vacío y un solo punto no se rompen', () {
    expect(ordenarRecogidas(1, 1, []), isEmpty);
    expect(ordenarRecogidas(1, 1, [_p('x', 2, 2)]).single.bookingId, 'x');
  });

  test('no pierde ni repite pasajeros', () {
    final ps = [for (var i = 0; i < 4; i++) _p('p$i', 7.37 + i / 1000, -72.64)];
    final orden = ordenarRecogidas(7.40, -72.64, ps);
    expect(orden.map((p) => p.bookingId).toSet(), ps.map((p) => p.bookingId).toSet());
    expect(orden.length, ps.length);
  });
}
