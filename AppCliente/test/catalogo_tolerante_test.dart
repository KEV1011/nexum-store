/// El catálogo de comercios, que es la pantalla principal de la app.
///
/// LO QUE SE PROTEGE AQUÍ NO ES UN NEGOCIO, ES LA PANTALLA. `fetchBusinesses`
/// hacía un `map` sobre la lista entera, así que un solo comercio que no se
/// pudiera leer —un campo que esta versión de la app todavía no espera, una
/// fila de la galería sin `url`— lanzaba, el provider caía a su estado de
/// error y la persona se quedaba sin poder pedir a NINGÚN local.
///
/// Perder un comercio es malo. Perder el catálogo completo es que la app no
/// sirve, y encima sin ninguna pista de por qué: la pantalla solo dice que no
/// se pudo cargar.
///
/// Es la cuarta vez que aparece el mismo defecto (historial de pedidos, caché
/// de viajes, ganancias del conductor) y el patrón es siempre el mismo: una
/// lista que viene de fuera, parseada de golpe.
library;

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/businesses/data/datasources/businesses_real_datasource.dart';
import 'package:nexum_client/features/businesses/domain/entities/business_entity.dart';

/// Un Dio que responde `{success, data}` sin salir a la red.
Dio dioQueResponde(Object? data) {
  final dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) => handler.resolve(
        Response<Map<String, dynamic>>(
          requestOptions: options,
          statusCode: 200,
          data: <String, dynamic>{'success': true, 'data': data},
        ),
      ),
    ),
  );
  return dio;
}

/// Un comercio tal como lo manda `/client/businesses`.
Map<String, dynamic> negocio(String id, {List<Object>? productos}) =>
    <String, dynamic>{
      'id': id,
      'name': 'Asadero $id',
      'category': 'restaurant',
      'rating': null,
      'ratingCount': 0,
      'etaMinutes': 30,
      'deliveryFee': 3000,
      'address': 'Calle 5 # 3-40',
      'isOpen': true,
      'products': productos ?? <Object>[],
    };

Map<String, dynamic> producto(String id) => <String, dynamic>{
      'id': id,
      'name': 'Hamburguesa',
      'price': 21000,
    };

Future<List<BusinessEntity>> cargados(List<Object> lista) =>
    BusinessesRealDataSource(dio: dioQueResponde(lista)).fetchBusinesses();

void main() {
  group('la lista de comercios', () {
    test('se leen los que están bien', () async {
      final n = await cargados([negocio('a'), negocio('b')]);
      expect(n.map((b) => b.id), ['a', 'b']);
    });

    test('UN comercio ilegible no deja la app sin catálogo', () async {
      // La comprobación que justifica el fichero.
      final roto = negocio('malo')..remove('deliveryFee');
      final n = await cargados([negocio('a'), roto, negocio('b')]);
      expect(
        n.map((b) => b.id),
        ['a', 'b'],
        reason: 'se pierde el comercio ilegible, no la pantalla',
      );
    });

    test('una entrada que no es un objeto tampoco', () async {
      final n = await cargados(['no es un negocio', negocio('ok')]);
      expect(n.map((b) => b.id), ['ok']);
    });

    test('una categoría que esta versión no conoce NO descarta el comercio',
        () async {
      // Ya estaba resuelto y se fija: una categoría nueva en el servidor no
      // puede dejar sin comercios a las apps instaladas.
      final nueva = negocio('x')..['category'] = 'ferreteria';
      final n = await cargados([nueva]);
      expect(n.single.category, BusinessCategory.other);
    });

    test('un local sin calificaciones no revienta la lista', () async {
      // El defecto que ya ocurrió: `as num` sobre el `rating` nulo de un
      // negocio nuevo. Se queda fijado.
      final n = await cargados([negocio('nuevo')]);
      expect(n.single.rating, isNull);
      expect(n.single.ratingCount, 0);
    });
  });

  group('la carta de un comercio', () {
    test('un producto ilegible no deja al restaurante sin menú', () async {
      // Cuarenta platos no se pueden perder por uno: y un negocio sin carta
      // legible sigue sirviendo para un mandado, así que tampoco se descarta
      // el negocio.
      final malo = producto('p2')..remove('price');
      final n = await cargados([
        negocio('a', productos: [producto('p1'), malo, producto('p3')]),
      ]);
      expect(n.single.products.map((p) => p.id), ['p1', 'p3']);
    });

    test('una foto de la galería sin url se deja fuera, el plato se queda',
        () async {
      final conFotoRota = producto('p1')
        ..['images'] = <Object>[
          <String, dynamic>{'url': 'https://cdn/ok.jpg'},
          <String, dynamic>{'alt': 'sin url'},
        ];
      final n = await cargados([negocio('a', productos: [conFotoRota])]);
      expect(n.single.products.single.images, ['https://cdn/ok.jpg']);
    });
  });

  group('el detalle de UN comercio', () {
    test('se lee', () async {
      final b = await BusinessesRealDataSource(dio: dioQueResponde(negocio('a')))
          .fetchBusinessById('a');
      expect(b.id, 'a');
    });

    test('si ese comercio no se puede leer, FALLA', () async {
      // Aquí no hay nada que salvar: devolver un negocio en blanco sería
      // enseñar un local inventado. La pantalla tiene su estado de error.
      final roto = negocio('a')..remove('name');
      await expectLater(
        BusinessesRealDataSource(dio: dioQueResponde(roto))
            .fetchBusinessById('a'),
        throwsA(isA<TypeError>()),
      );
    });
  });
}
