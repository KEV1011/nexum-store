import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/core/session/reanudar.dart';

ServicioAbierto _viaje(String id, DateTime creado) =>
    ServicioAbierto(id: id, tipo: TipoServicioAbierto.viaje, creado: creado);

ServicioAbierto _pedido(String id, DateTime creado) =>
    ServicioAbierto(id: id, tipo: TipoServicioAbierto.pedido, creado: creado);

void main() {
  final ahora = DateTime(2026, 9, 10, 12);

  group('rutaDeReanudacion', () {
    test('sin nada abierto no mueve a nadie del inicio', () {
      expect(rutaDeReanudacion([]), isNull);
    });

    test('un viaje abierto lleva a su seguimiento', () {
      expect(
        rutaDeReanudacion([_viaje('t1', ahora)]),
        '/transport/tracking/t1',
      );
    });

    test('un pedido abierto lleva a su seguimiento', () {
      expect(rutaDeReanudacion([_pedido('o1', ahora)]), '/order/o1');
    });

    test('con varios abiertos manda el más reciente', () {
      final ruta = rutaDeReanudacion([
        _pedido('o1', ahora.subtract(const Duration(minutes: 30))),
        _viaje('t1', ahora.subtract(const Duration(minutes: 2))),
      ]);
      expect(ruta, '/transport/tracking/t1');
    });

    test('el más reciente manda aunque sea el pedido', () {
      final ruta = rutaDeReanudacion([
        _viaje('t1', ahora.subtract(const Duration(hours: 1))),
        _pedido('o1', ahora),
      ]);
      expect(ruta, '/order/o1');
    });

    test('en empate exacto gana el viaje: hay alguien esperando en la calle',
        () {
      final ruta = rutaDeReanudacion([
        _pedido('o1', ahora),
        _viaje('t1', ahora),
      ]);
      expect(ruta, '/transport/tracking/t1');
    });

    test('no altera la lista que recibe', () {
      final lista = [
        _pedido('o1', ahora.subtract(const Duration(hours: 1))),
        _viaje('t1', ahora),
      ];
      rutaDeReanudacion(lista);
      expect(lista.first.id, 'o1');
    });
  });
}
