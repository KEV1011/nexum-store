/// El defecto que más veces ha aparecido en este repositorio, en un sitio.
///
/// Siempre con la misma forma: `(data as List).map(Algo.fromJson).toList()`.
/// Un elemento que el parseador no pueda leer hace lanzar al `map`, y entonces
/// no se pierde ese elemento — se pierde la lista completa y con ella la
/// pantalla. Ya pasó con el historial de pedidos, con la caché de viajes, con
/// las ganancias del conductor y con el catálogo de comercios, y el disparador
/// realista no es un servidor roto: es un dato escrito por una versión
/// anterior, o un parseador que pasa a exigir un campo que antes no existía.
///
/// Las dos apps llevan el mismo fichero (no hay paquete compartido) y la
/// última prueba vigila que no se separen.
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/core/utils/lista_json.dart';

/// Un parseador como los de verdad: casteos duros sobre campos obligatorios.
class Cosa {
  const Cosa(this.id, this.precio);

  factory Cosa.fromJson(Map<String, dynamic> j) =>
      Cosa(j['id'] as String, (j['precio'] as num).toDouble());

  final String id;
  final double precio;
}

List<String> ids(Object? raw) =>
    listaDeJson(raw, Cosa.fromJson).map((c) => c.id).toList();

void main() {
  group('lista que llega de fuera', () {
    test('se convierte entera cuando está bien', () {
      expect(
        ids(<Object>[
          <String, dynamic>{'id': 'a', 'precio': 1},
          <String, dynamic>{'id': 'b', 'precio': 2},
        ]),
        ['a', 'b'],
      );
    });

    test('UN elemento ilegible se pierde él solo', () {
      // La comprobación que justifica el fichero.
      expect(
        ids(<Object>[
          <String, dynamic>{'id': 'a', 'precio': 1},
          <String, dynamic>{'id': 'malo'}, // sin precio: el parseador lanza
          <String, dynamic>{'id': 'b', 'precio': 2},
        ]),
        ['a', 'b'],
      );
    });

    test('un elemento con el tipo equivocado tampoco se lleva a los demás',
        () {
      expect(
        ids(<Object>[
          <String, dynamic>{'id': 'a', 'precio': 1},
          <String, dynamic>{'id': 7, 'precio': 1},
        ]),
        ['a'],
      );
    });

    test('lo que no es un objeto se salta', () {
      expect(
        ids(<Object>[
          'no es un objeto',
          <String, dynamic>{'id': 'a', 'precio': 1},
          <Object>[],
        ]),
        ['a'],
      );
    });

    test('todos ilegibles devuelve vacío, no lanza', () {
      expect(ids(<Object>[<String, dynamic>{}, 'x']), isEmpty);
    });

    test('lo que no es una lista devuelve vacío', () {
      // Pasa de verdad: `data` puede venir null, o ser un objeto cuando el
      // endpoint cambió de forma. Lanzar aquí sería el mismo defecto.
      expect(ids(null), isEmpty);
      expect(ids(<String, dynamic>{'id': 'a', 'precio': 1}), isEmpty);
      expect(ids('[]'), isEmpty);
    });

    test('una lista vacía es una lista vacía', () {
      expect(ids(<Object>[]), isEmpty);
    });

    test('la lista devuelta es del tipo pedido y se puede modificar', () {
      // Devolver `const []` haría estallar a quien le añada algo después.
      final l = listaDeJson(<Object>[], Cosa.fromJson)..add(const Cosa('x', 1));
      expect(l, isA<List<Cosa>>());
      expect(l.single.id, 'x');
    });

    test('el orden se conserva', () {
      // Hay listas que llegan ordenadas por el servidor (el historial, más
      // reciente primero) y reordenarlas aquí cambiaría lo que se enseña.
      expect(
        ids(<Object>[
          <String, dynamic>{'id': 'c', 'precio': 3},
          <String, dynamic>{'id': 'a', 'precio': 1},
        ]),
        ['c', 'a'],
      );
    });
  });

  test('las dos apps llevan EXACTAMENTE el mismo fichero', () {
    // No hay paquete compartido, así que está duplicado. Se comparan byte a
    // byte porque no importa nada del paquete propio. Si esta prueba cae, la
    // respuesta no es editarla: es copiar el fichero al otro lado. El mismo
    // test corre en las dos apps y busca la otra copia a los dos lados.
    const rel = 'lib/core/utils/lista_json.dart';
    final aqui = File(rel);
    final alla = [File('../AppTransport/$rel'), File('../AppCliente/$rel')]
        .firstWhere(
      (f) => f.existsSync() && f.absolute.path != aqui.absolute.path,
      orElse: () => File('no-existe'),
    );
    expect(aqui.existsSync(), isTrue);
    expect(alla.existsSync(), isTrue, reason: 'falta la copia de la otra app');
    expect(
      alla.readAsStringSync(),
      aqui.readAsStringSync(),
      reason: 'las dos copias se separaron: copia el fichero al otro lado',
    );
  });
}
