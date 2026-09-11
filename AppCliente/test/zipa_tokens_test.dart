import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';

/// Luminancia relativa según WCAG 2.1.
double _luminancia(Color c) {
  double canal(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
}

/// Razón de contraste entre dos colores. 4.5 es el mínimo para texto normal.
double contraste(Color a, Color b) {
  final la = _luminancia(a);
  final lb = _luminancia(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

void main() {
  // El contraste es de las cosas que se degradan en silencio: alguien aclara un
  // gris «porque se ve más elegante» y el texto de los metadatos deja de leerse
  // sin que nadie lo note hasta que un usuario se queja. Estas comprobaciones
  // son aritmética pura, así que no dependen de que alguien mire la pantalla.
  //
  // El caso que las motiva es real: el terciario que había daba 2,41:1 sobre el
  // fondo de la app, y es el gris de «categoría · tiempo · envío».
  const minimo = 4.5;

  group('todo texto se lee sobre su superficie', () {
    final fondos = {
      'fondo de la app': ZipaTokens.fondo,
      'superficie': ZipaTokens.superficie,
      'superficie hundida': ZipaTokens.superficieHundida,
    };
    final textos = {
      'principal': ZipaTokens.textoPrincipal,
      'secundario': ZipaTokens.textoSecundario,
      'terciario': ZipaTokens.textoTerciario,
    };

    for (final f in fondos.entries) {
      for (final t in textos.entries) {
        test('${t.key} sobre ${f.key} — claro', () {
          final r = contraste(t.value.claro, f.value.claro);
          expect(r, greaterThanOrEqualTo(minimo),
              reason: '${r.toStringAsFixed(2)}:1, hace falta $minimo:1');
        });
        test('${t.key} sobre ${f.key} — oscuro', () {
          final r = contraste(t.value.oscuro, f.value.oscuro);
          expect(r, greaterThanOrEqualTo(minimo),
              reason: '${r.toStringAsFixed(2)}:1, hace falta $minimo:1');
        });
      }
    }
  });

  group('los tintes de categoría se leen', () {
    final tintes = {
      'movilidad': ZipaTokens.movilidad,
      'restaurantes': ZipaTokens.restaurantes,
      'envíos': ZipaTokens.envios,
      'intermunicipal': ZipaTokens.intermunicipal,
      'abierto': ZipaTokens.abierto,
      'cerrado': ZipaTokens.cerrado,
    };

    for (final e in tintes.entries) {
      test('${e.key}: el glifo se lee sobre su propio fondo', () {
        for (final oscuro in [false, true]) {
          final fondo = oscuro ? e.value.fondo.oscuro : e.value.fondo.claro;
          final glifo = oscuro ? e.value.glifo.oscuro : e.value.glifo.claro;
          final r = contraste(glifo, fondo);
          expect(r, greaterThanOrEqualTo(minimo),
              reason: '${e.key} en ${oscuro ? "oscuro" : "claro"}: '
                  '${r.toStringAsFixed(2)}:1');
        }
      });

      test('${e.key}: el glifo NO es blanco puro sobre el tinte', () {
        // Un tinte es claro por definición; encima, el blanco desaparece. El
        // par obliga a que el glifo sea de la familia del fondo.
        expect(e.value.glifo.claro, isNot(const Color(0xFFFFFFFF)));
      });
    }
  });

  group('el verde de marca', () {
    test('NO se usa como texto sin más: sobre blanco no se lee', () {
      // Esta es la comprobación que documenta por qué existe `marcaTexto`.
      final r = contraste(ZipaTokens.marca, const Color(0xFFFFFFFF));
      expect(r, lessThan(minimo),
          reason: 'Si esto pasara a cumplir, `marcaTexto` sobra.');
    });

    test('la variante de texto sí se lee, en los dos temas', () {
      expect(
        contraste(ZipaTokens.marcaTexto.claro, ZipaTokens.superficie.claro),
        greaterThanOrEqualTo(minimo),
      );
      expect(
        contraste(ZipaTokens.marcaTexto.oscuro, ZipaTokens.superficie.oscuro),
        greaterThanOrEqualTo(minimo),
      );
    });
  });

  group('resolución por tema', () {
    testWidgets('un token devuelve el valor del tema en curso', (tester) async {
      late Color enClaro;
      late Color enOscuro;
      Widget sonda(ThemeData tema, void Function(Color) guardar) => MaterialApp(
            theme: tema,
            home: Builder(builder: (context) {
              guardar(ZipaTokens.fondo.de(context));
              return const SizedBox();
            }),
          );

      await tester.pumpWidget(sonda(ThemeData.light(), (c) => enClaro = c));
      await tester.pumpWidget(sonda(ThemeData.dark(), (c) => enOscuro = c));

      expect(enClaro, ZipaTokens.fondo.claro);
      expect(enOscuro, ZipaTokens.fondo.oscuro);
    });
  });
}
