// Los índices de las pestañas eran enteros escritos a mano en tres pantallas.
// Un entero siempre compila, así que reordenar la barra mandaba a la gente a
// la pestaña equivocada sin que nada avisara — y pasó justo al sacar Movilidad
// de la barra: el `2` que la abría pasó a ser Favoritos.
//
// Esta prueba LEE el código fuente, que es la única forma de comprobar una
// regla sobre cómo se escribe.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/shell/presentation/providers/'
    'shell_provider.dart';

void main() {
  test('nadie fija la pestaña con un número suelto', () {
    final infractores = <String>[];
    final suelto = RegExp(r'shellTabProvider\.notifier\)\.state\s*=\s*\d');

    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      final lineas = f.readAsLinesSync();
      for (var i = 0; i < lineas.length; i++) {
        final l = lineas[i];
        if (l.trimLeft().startsWith('//')) continue;
        if (suelto.hasMatch(l)) infractores.add('${f.path}:${i + 1}  ${l.trim()}');
      }
    }
    expect(
      infractores,
      isEmpty,
      reason: 'Usa kTabInicio, kTabPedidos, kTabFavoritos, kTabCuenta o '
          'kTabMovilidad:\n${infractores.join('\n')}',
    );
  });

  test('los índices son distintos y consecutivos desde cero', () {
    // Si dos coincidieran, dos pestañas abrirían la misma pantalla; si
    // saltaran un número, `IndexedStack` se saldría de rango al tocarla.
    const indices = [
      kTabInicio,
      kTabPedidos,
      kTabFavoritos,
      kTabCuenta,
      kTabMovilidad,
    ];
    expect(indices.toSet().length, indices.length, reason: 'Hay índices repetidos.');
    for (var i = 0; i < indices.length; i++) {
      expect(indices[i], i, reason: 'El índice $i no corresponde.');
    }
  });

  test('Movilidad es el último: no tiene botón en la barra', () {
    // La barra pinta los cuatro primeros. Si Movilidad dejara de ser el
    // último, un botón abriría la pantalla equivocada.
    expect(kTabMovilidad, greaterThan(kTabCuenta));
  });

  test('la pila del shell tiene una pantalla por índice', () {
    // `IndexedStack` revienta en tiempo de EJECUCIÓN si el índice se sale de
    // la lista, y solo cuando alguien toca esa pestaña. Contar aquí las
    // pantallas declaradas evita descubrirlo en el teléfono de un usuario.
    final fuente = File(
      'lib/features/shell/presentation/screens/home_shell.dart',
    ).readAsStringSync();
    final bloque = RegExp(
      r'static const _pantallas = \[(.*?)\];',
      dotAll: true,
    ).firstMatch(fuente);
    expect(bloque, isNotNull, reason: 'No se encontró la lista de pantallas.');
    final cuantas = RegExp(r'\(\),').allMatches(bloque!.group(1)!).length;
    expect(cuantas, kTabMovilidad + 1);
  });
}
