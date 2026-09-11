import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';

/// Los archivos rediseñados, donde la regla del punto de entrada único aplica.
///
/// La lista es explícita y no un barrido de `lib/`: el resto de la app tiene
/// cientos de iconos de antes, y una prueba que falla desde el primer día no
/// la arregla nadie, la desactivan. Al migrar una pantalla, se añade aquí.
const _archivosRediseñados = [
  'lib/features/businesses/presentation/screens/businesses_screen.dart',
  'lib/features/shell/presentation/screens/home_shell.dart',
  'lib/shared/widgets/estados_zipa.dart',
  'lib/features/businesses/presentation/widgets/fila_comercio.dart',
  'lib/features/businesses/presentation/widgets/tarjeta_servicio.dart',
  'lib/features/businesses/presentation/widgets/sello_confianza.dart',
];

void main() {
  group('catálogo de iconos', () {
    test('todo nombre del catálogo tiene su glifo', () {
      // Sin esto, un nombre nuevo sin entrada revienta en pantalla con un
      // `Null check operator used on a null value` en vez de aquí.
      for (final n in ZipaIconName.values) {
        expect(glifosParaPruebas[n], isNotNull, reason: 'falta el glifo de $n');
      }
    });

    test('no sobran entradas en el mapa', () {
      expect(glifosParaPruebas.length, ZipaIconName.values.length);
    });

    test('solo hay dos tamaños, y son 20 y 16', () {
      expect(ZipaIconSize.values.map((s) => s.px).toList(), [20.0, 16.0]);
    });

    testWidgets('se pinta en el tamaño del enum, no en otro', (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: Column(children: [
            ZipaIcon(ZipaIconName.inicio),
            ZipaIcon(ZipaIconName.chevron, size: ZipaIconSize.inline),
          ]),
        ),
      ));
      final iconos = tester.widgetList<Icon>(find.byType(Icon)).toList();
      expect(iconos[0].size, 20.0);
      expect(iconos[1].size, 16.0);
    });
  });

  group('reglas sobre el código fuente', () {
    // Estas leen los archivos. Es la única forma de comprobar una regla que
    // habla de cómo se ESCRIBE el código, no de lo que hace al ejecutarse.

    test('los archivos rediseñados no instancian iconos por su cuenta', () {
      final infractores = <String>[];
      for (final ruta in _archivosRediseñados) {
        final f = File(ruta);
        if (!f.existsSync()) continue; // aún no creado por su tarea
        final lineas = f.readAsLinesSync();
        for (var i = 0; i < lineas.length; i++) {
          final l = lineas[i];
          if (l.trimLeft().startsWith('//')) continue;
          if (l.contains('Icons.')) infractores.add('$ruta:${i + 1}  ${l.trim()}');
        }
      }
      expect(
        infractores,
        isEmpty,
        reason: 'Usa ZipaIcon:\n${infractores.join('\n')}',
      );
    });

    test('NINGÚN emoji se renderiza en la interfaz', () {
      // El emoji lo dibuja el sistema operativo: se ve distinto en cada
      // teléfono y no pertenece a la marca. Los comentarios se saltan — ahí
      // documentan lo que se quitó.
      final emoji = RegExp(
        r'[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]',
        unicode: true,
      );
      final infractores = <String>[];
      for (final f in Directory('lib').listSync(recursive: true)) {
        if (f is! File || !f.path.endsWith('.dart')) continue;
        final lineas = f.readAsLinesSync();
        for (var i = 0; i < lineas.length; i++) {
          final l = lineas[i];
          if (l.trimLeft().startsWith('//') || l.trimLeft().startsWith('///')) {
            continue;
          }
          if (emoji.hasMatch(l)) infractores.add('${f.path}:${i + 1}  ${l.trim()}');
        }
      }
      expect(
        infractores,
        isEmpty,
        reason: 'Sustitúyelos por ZipaIcon:\n${infractores.join('\n')}',
      );
    });
  });
}
