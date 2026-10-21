// Decisión del dueño de ZIPA: el local que todavía no es cliente, o que no ha
// pagado, NO lleva avisos en la app («Precios de referencia», «todavía no
// recibe pedidos por la app», «aprox.»). Generan desconfianza en el cliente.
// El pedido sigue saliendo como compra de un repartidor; eso no cambia.
//
// Esta prueba impide que vuelvan sin que nadie lo decida.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('ningún texto de lib/ anuncia que el local no está asociado', () {
    const prohibidos = [
      'Precios de referencia',
      'todavía no recibe pedidos',
      'Vamos y lo compramos',
      'Buscar quién lo compre',
      'Según su carta',
      "'aprox. \${",
    ];
    final hallazgos = <String>[];
    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      final src = f.readAsStringSync();
      for (final p in prohibidos) {
        if (src.contains(p)) hallazgos.add('${f.path}: $p');
      }
    }
    expect(hallazgos, isEmpty);
  });
}
