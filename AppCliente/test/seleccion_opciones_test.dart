import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:nexum_client/features/businesses/domain/seleccion_opciones.dart';

Set<String> _tocar(
  Set<String> actual,
  String id, {
  bool unica = true,
  bool obligatoria = false,
  int maximo = 1,
}) =>
    alternarOpcion(
      actual,
      id: id,
      unica: unica,
      obligatoria: obligatoria,
      maximo: maximo,
    );

void main() {
  group('una sola elección, OPCIONAL («Con combo · Opcional»)', () {
    test('tocar la marcada la DESMARCA', () {
      expect(_tocar({'combo'}, 'combo'), isEmpty);
    });

    test('tocar otra cambia la elección', () {
      expect(_tocar({'combo'}, 'doble'), {'doble'});
    });

    test('se dibuja como casilla, porque se puede desmarcar', () {
      expect(pareceRadio(unica: true, obligatoria: false), isFalse);
    });
  });

  group('una sola elección, OBLIGATORIA («Tamaño · elige 1»)', () {
    test('tocar la marcada NO la desmarca: siempre queda una', () {
      expect(_tocar({'grande'}, 'grande', obligatoria: true), {'grande'});
    });

    test('se dibuja como radio', () {
      expect(pareceRadio(unica: true, obligatoria: true), isTrue);
    });
  });

  group('varias («Adicionales · hasta 2»)', () {
    test('marca y desmarca, sin pasar del tope', () {
      var s = _tocar({}, 'queso', unica: false, maximo: 2);
      s = _tocar(s, 'huevo', unica: false, maximo: 2);
      s = _tocar(s, 'tocineta', unica: false, maximo: 2);
      expect(s, {'queso', 'huevo'});
      expect(_tocar(s, 'queso', unica: false, maximo: 2), {'huevo'});
    });
  });

  test('no modifica el conjunto que recibe', () {
    final antes = {'combo'};
    _tocar(antes, 'combo');
    expect(antes, {'combo'});
  });

  test('la hoja del producto usa esta regla (no una copia propia)', () {
    final s = File(
      'lib/features/businesses/presentation/widgets/product_options_sheet.dart',
    ).readAsStringSync();
    expect(s, contains('alternarOpcion('));
    expect(s, contains('pareceRadio('));
  });
}
