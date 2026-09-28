import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'tarjeta_servicio.dart';

Widget _montar(Widget tarjeta) => MaterialApp(
      home: Scaffold(
        // Ancho de una columna de la rejilla de dos, que es como vive.
        body: Center(child: SizedBox(width: 170, child: tarjeta)),
      ),
    );

void main() {
  testWidgets('sin ilustración se pinta el glifo del catálogo', (tester) async {
    await tester.pumpWidget(_montar(
      TarjetaServicio(
        icono: ZipaIconName.movilidad,
        tinte: ZipaTokens.movilidad,
        titulo: 'Movilidad',
        subtitulo: 'Taxi, moto, carro',
        onTap: () {},
      ),
    ));
    await tester.pump();

    expect(find.byType(ZipaIcon), findsOneWidget);
  });

  testWidgets('la puerta se puede tocar', (tester) async {
    var tocada = 0;

    await tester.pumpWidget(_montar(
      TarjetaServicio(
        icono: ZipaIconName.envios,
        tinte: ZipaTokens.envios,
        titulo: 'Envíos',
        subtitulo: 'Paquetes y mandados',
        onTap: () => tocada++,
      ),
    ));
    await tester.tap(find.text('Envíos'));
    await tester.pumpAndSettle();

    expect(tocada, 1);
  });

  // ── Las ilustraciones que el código pide tienen que EXISTIR ────────────────
  //
  // Este es el fallo que no avisa: si la ruta está mal escrita o el archivo no
  // está, `Image.asset` dispara su `errorBuilder` y la puerta cae al glifo
  // monocromo. No hay excepción, no hay log, y en pantalla parece una decisión
  // de diseño — una puerta con icono de un solo tono al lado de tres a color.
  //
  // Y guarda además el error que de verdad se cometió: dar por hecho que no
  // había ilustración para Restaurantes e Intermunicipal, dibujar dos glifos a
  // mano, y tapar con ellos los iconos propios de la marca, que llevaban todo
  // el tiempo en `assets/`. Si mañana alguien vuelve a quitar un
  // `ilustracion:`, esta prueba lo dice.
  group('las ilustraciones de las puertas', () {
    /// Cada `ilustracion:` que aparece en `lib/`, con el archivo que pide.
    List<({String archivo, int linea, String origen})> rutasPedidas() {
      final encontradas = <({String archivo, int linea, String origen})>[];
      final expr = RegExp(r"""ilustracion:\s*'([^']+)'""");
      for (final f in Directory('lib').listSync(recursive: true)) {
        if (f is! File || !f.path.endsWith('.dart')) continue;
        final lineas = f.readAsLinesSync();
        for (var i = 0; i < lineas.length; i++) {
          final m = expr.firstMatch(lineas[i]);
          if (m != null) {
            encontradas.add((archivo: m.group(1)!, linea: i + 1, origen: f.path));
          }
        }
      }
      return encontradas;
    }

    test('se piden las cuatro de la home', () {
      // Menos de cuatro significa que alguien volvió a cambiar una ilustración
      // por otra cosa. El widget lo dice claro: o todas, o ninguna — una a
      // color al lado de un glifo monocromo canta.
      expect(rutasPedidas().length, greaterThanOrEqualTo(4),
          reason: 'faltan ilustraciones en las puertas de la home');
    });

    test('todas existen en disco', () {
      for (final r in rutasPedidas()) {
        expect(File(r.archivo).existsSync(), isTrue,
            reason: '${r.origen}:${r.linea} pide "${r.archivo}" y no está en el repo; '
                'la puerta caería al glifo monocromo sin avisar');
      }
    });

    test('y su carpeta está declarada en el pubspec', () {
      // Existir en disco no basta: un asset sin declarar no se empaqueta, así
      // que funciona en el repo y falla en el teléfono, que es la peor forma
      // de fallar.
      final pubspec = File('pubspec.yaml').readAsStringSync();
      for (final r in rutasPedidas()) {
        final carpeta = '${r.archivo.substring(0, r.archivo.lastIndexOf('/'))}/';
        expect(pubspec.contains('- $carpeta'), isTrue,
            reason: '"$carpeta" no está declarada en pubspec.yaml: '
                '"${r.archivo}" no se empaquetaría en el APK');
      }
    });
  });
}
