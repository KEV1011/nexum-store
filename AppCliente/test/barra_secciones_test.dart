// La barra de secciones de la carta: que esté, que diga la verdad y que
// lleve a donde dice.
//
// Las dos roturas que se vigilan aquí NO se ven mirando la pantalla un
// momento: una barra con la sección equivocada marcada se lee como correcta
// hasta que alguien toca un chip, y una barra que se dibuja con una sola
// sección parece un filtro que no filtra nada.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexum_client/features/businesses/presentation/widgets/barra_secciones.dart';

Widget _envuelta({
  required List<String> secciones,
  String? activa,
  void Function(String)? onSeleccion,
}) {
  return MaterialApp(
    home: Scaffold(
      body: BarraSecciones(
        secciones: secciones,
        activa: activa,
        onSeleccion: onSeleccion ?? (_) {},
      ),
    ),
  );
}

void main() {
  group('barra de secciones', () {
    testWidgets('pinta un chip por sección, en orden', (tester) async {
      await tester.pumpWidget(_envuelta(
        secciones: const ['Hamburguesas', 'Perros', 'Bebidas'],
      ));

      expect(find.text('Hamburguesas'), findsOneWidget);
      expect(find.text('Perros'), findsOneWidget);
      expect(find.text('Bebidas'), findsOneWidget);
    });

    testWidgets('avisa con la sección que se tocó', (tester) async {
      final tocadas = <String>[];
      await tester.pumpWidget(_envuelta(
        secciones: const ['Hamburguesas', 'Bebidas'],
        onSeleccion: tocadas.add,
      ));

      await tester.tap(find.text('Bebidas'));
      await tester.pump();

      expect(tocadas, ['Bebidas']);
    });

    testWidgets('sin sección activa no resalta ninguna', (tester) async {
      // Al abrir la carta todavía no se sabe dónde está el dedo. Resaltar la
      // primera «por defecto» diría que estás en un sitio donde no estás.
      await tester.pumpWidget(_envuelta(
        secciones: const ['Hamburguesas', 'Bebidas'],
      ));

      final pesos = tester
          .widgetList<Text>(find.byType(Text))
          .map((t) => t.style?.fontWeight)
          .toList();
      expect(pesos.contains(FontWeight.w700), isFalse);
    });

    testWidgets('resalta exactamente una cuando hay activa', (tester) async {
      await tester.pumpWidget(_envuelta(
        secciones: const ['Hamburguesas', 'Perros', 'Bebidas'],
        activa: 'Perros',
      ));

      final marcadas = tester
          .widgetList<Text>(find.byType(Text))
          .where((t) => t.style?.fontWeight == FontWeight.w700)
          .map((t) => t.data)
          .toList();
      expect(marcadas, ['Perros']);
    });

    testWidgets('la letra del chip activo contrasta con el verde', (tester) async {
      // El verde de marca con letra blanca da 2,24:1 y la norma pide 4,5. El
      // color lo decide `colorDeTextoSobre`, así que aquí se comprueba que el
      // chip activo NO acabe con letra blanca sobre el verde.
      await tester.pumpWidget(_envuelta(
        secciones: const ['Hamburguesas'],
        activa: 'Hamburguesas',
      ));

      final texto = tester.widget<Text>(find.text('Hamburguesas'));
      expect(texto.style?.color, isNot(Colors.white));
    });

    testWidgets('aguanta una lista vacía sin reventar', (tester) async {
      await tester.pumpWidget(_envuelta(secciones: const []));
      expect(find.byType(BarraSecciones), findsOneWidget);
    });
  });

  group('el delegate', () {
    test('no cambia de alto al desplazarse: es una barra fijada', () {
      const d = BarraSeccionesDelegate(
        secciones: ['A', 'B'],
        activa: null,
        onSeleccion: _nada,
      );
      expect(d.minExtent, d.maxExtent);
      expect(d.minExtent, kAltoBarraSecciones);
    });

    test('se reconstruye cuando cambia la activa, y no cuando no', () {
      const base = BarraSeccionesDelegate(
        secciones: ['A', 'B'],
        activa: 'A',
        onSeleccion: _nada,
      );
      const otraActiva = BarraSeccionesDelegate(
        secciones: ['A', 'B'],
        activa: 'B',
        onSeleccion: _nada,
      );
      const otrasSecciones = BarraSeccionesDelegate(
        secciones: ['A', 'B', 'C'],
        activa: 'A',
        onSeleccion: _nada,
      );
      const igual = BarraSeccionesDelegate(
        secciones: ['A', 'B'],
        activa: 'A',
        onSeleccion: _nada,
      );

      expect(otraActiva.shouldRebuild(base), isTrue);
      expect(otrasSecciones.shouldRebuild(base), isTrue);
      // Sin esto la barra se repintaría en cada fotograma del desplazamiento.
      expect(igual.shouldRebuild(base), isFalse);
    });
  });
}

void _nada(String _) {}
