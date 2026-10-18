import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/nombre_plato.dart';

/// El nombre del plato se parte igual aquí que en la carta del QR: las dos
/// reglas se prueban con la MISMA tabla, que vive en el portal.
void main() {
  final casos = (jsonDecode(
    File('../app/carta/nombre-plato-casos.json').readAsStringSync(),
  ) as List)
      .cast<Map<String, dynamic>>();

  test('la tabla compartida existe y no está vacía', () {
    expect(casos, isNotEmpty);
  });

  for (final c in casos) {
    test(c['nombre'] as String, () {
      final r = partirNombrePlato(c['nombre'] as String, c['descripcion'] as String);
      expect(r.titulo, c['titulo']);
      expect(r.detalle, c['detalle']);
    });
  }
}
