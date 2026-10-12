/// Las direcciones de entrega del cliente.
///
/// DOS COSAS, y la primera es la que importa: aquí se SEMBRABA una dirección
/// inventada. Todo el que instalaba la app estrenaba una «Casa» en «Calle 6
/// #2-30, Barrio Belén» marcada como predeterminada — una calle que no es la
/// de nadie—, y no se quedaba en la pantalla de direcciones: el chip del
/// inicio la enseñaba como la dirección de la persona y el checkout la usaba
/// como destino del pedido, con el repartidor yendo hasta allá.
///
/// Lo cómico es que el widget del chip ya tenía escrito el motivo exacto por
/// el que eso no se puede hacer («poner un texto de relleno con pinta de
/// dirección hace que alguien pida a un sitio que no es el suyo») mientras el
/// provider lo hacía.
///
/// Y la segunda: `_load()` corre en el constructor sin `await`, así que una
/// dirección ilegible lanzaba un error asíncrono sin dueño y la persona se
/// quedaba sin NINGUNA de las suyas.
library;

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/addresses/domain/entities/address_entity.dart';
import 'package:nexum_client/features/addresses/presentation/providers/addresses_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> direccion(
  String id, {
  String alias = 'Casa',
  bool isDefault = false,
}) =>
    <String, dynamic>{
      'id': id,
      'alias': alias,
      'fullAddress': 'Carrera 4A # 10-53',
      'isDefault': isDefault,
    };

/// Carga el provider con [guardado] en el disco. `null` = instalación nueva.
Future<List<AddressEntity>> cargadas(Object? guardado) async {
  SharedPreferences.setMockInitialValues({
    if (guardado != null)
      'nexum_addresses_v1':
          guardado is String ? guardado : jsonEncode(guardado),
  });
  final n = AddressesNotifier();
  // `_load()` arranca en el constructor y no se puede esperar: se drena la
  // cola de eventos, que es lo que deja resolverse a SharedPreferences.
  await pumpEventQueue();
  final lista = n.state;
  n.dispose();
  return lista;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('una instalación nueva', () {
    test('NO estrena ninguna dirección inventada', () async {
      // La comprobación que justifica el fichero.
      expect(await cargadas(null), isEmpty);
    });

    test('tampoco con el archivo vacío', () async {
      expect(await cargadas(''), isEmpty);
    });
  });

  group('las direcciones guardadas', () {
    test('se leen', () async {
      final d = await cargadas([direccion('a'), direccion('b')]);
      expect(d.map((e) => e.id), ['a', 'b']);
      expect(d.first.fullAddress, 'Carrera 4A # 10-53');
    });

    test('UNA ilegible no se lleva las demás', () async {
      final roto = direccion('malo')..remove('fullAddress');
      final d = await cargadas([direccion('a'), roto, direccion('b')]);
      expect(d.map((e) => e.id), ['a', 'b']);
    });

    test('una entrada que no es un objeto tampoco', () async {
      final d = await cargadas(['no es una dirección', direccion('ok')]);
      expect(d.map((e) => e.id), ['ok']);
    });

    test('un archivo corrupto deja la lista vacía y no revienta', () async {
      // Y NO se sobreescribe: una versión futura que sepa leerlo todavía
      // podría recuperarlo.
      expect(await cargadas('{esto no es json'), isEmpty);
    });

    test('el punto exacto se conserva cuando lo hay', () async {
      // Sin lat/lng el pedido se crea igual pero su mapa no se puede dibujar,
      // así que perderlo en la lectura sería perder el seguimiento.
      final conPunto = direccion('a')
        ..['lat'] = 7.3754
        ..['lng'] = -72.6486;
      final d = await cargadas([conPunto]);
      expect(d.single.lat, 7.3754);
      expect(d.single.lng, -72.6486);
    });
  });
}
