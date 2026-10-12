/// El historial de pedidos guardado en el teléfono.
///
/// POR QUÉ EXISTE. Esta caché la escribe una versión de la app y la lee la
/// SIGUIENTE. El día que el parser pase a exigir un campo que la versión
/// anterior no guardaba, todo el que tenga historial lo pierde al actualizar
/// — y no hay forma de enterarse: la app abre, el historial sale vacío y
/// parece que el usuario nunca pidió nada.
///
/// Ya pasó con el estado del pedido: un valor que esta versión no conocía
/// hacía lanzar al `firstWhere` y el `catch` descartaba la lista ENTERA. Se
/// arregló con un `orElse`, pero eso solo cubría el estado; cualquier otro
/// campo seguía teniendo el mismo poder sobre todo el historial.
///
/// La prueba que de verdad importa es la segunda: con un pedido ilegible entre
/// tres, se devuelven los otros DOS.
library;

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/orders/data/datasources/orders_datasource.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Un pedido con lo mínimo que `fromJson` exige.
Map<String, dynamic> pedido(String id) => {
      'id': id,
      'orderRef': 'NX-$id',
      'businessName': 'Asadero',
      'businessAddress': 'Calle 5',
      'deliveryAddress': 'Carrera 4',
      'status': 'delivered',
      'lines': <Map<String, dynamic>>[],
      'subtotal': 21000,
      'deliveryFee': 3000,
      'createdAt': '2026-10-11T15:00:00.000Z',
    };

Future<List<String>> idsGuardados(List<dynamic> cache) async {
  SharedPreferences.setMockInitialValues({
    AppConstants.ordersStorageKey: jsonEncode(cache),
  });
  final leidos = await OrdersDataSource().fetchOrderHistory();
  return leidos.map((o) => o.id).toList();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('leer el historial del teléfono', () {
    test('devuelve los pedidos que sí se pueden leer', () async {
      expect(await idsGuardados([pedido('a'), pedido('b')]), ['a', 'b']);
    });

    test('UN pedido ilegible no se lleva por delante el historial', () async {
      // El caso que de verdad ocurre: la caché viene de una versión anterior
      // y a un pedido le falta un campo que ahora se exige.
      final roto = pedido('malo')..remove('subtotal');
      final ids = await idsGuardados([pedido('a'), roto, pedido('b')]);
      expect(ids, ['a', 'b'], reason: 'se pierde el ilegible, no los demás');
    });

    test('un estado que esta versión no conoce no rompe nada', () async {
      // Lo cubre el `orElse` del parser; se fija aquí para que no se quite.
      final futuro = pedido('nuevo')..['status'] = 'un_estado_del_futuro';
      expect(await idsGuardados([futuro]), ['nuevo']);
    });

    test('una entrada que ni siquiera es un objeto se salta', () async {
      expect(await idsGuardados([pedido('a'), 'basura', 42]), ['a']);
    });

    test('el JSON entero corrupto deja la lista vacía, sin reventar', () async {
      SharedPreferences.setMockInitialValues({
        AppConstants.ordersStorageKey: 'esto no es json',
      });
      expect(await OrdersDataSource().fetchOrderHistory(), isEmpty);
    });

    test('sin caché, lista vacía', () async {
      SharedPreferences.setMockInitialValues({});
      expect(await OrdersDataSource().fetchOrderHistory(), isEmpty);
    });

    test('los pedidos semilla de versiones viejas siguen purgados', () async {
      final ids = await idsGuardados([pedido('ord-9001'), pedido('real')]);
      expect(ids, ['real']);
    });
  });
}
