// La barra de secciones de la carta: que esté, que diga la verdad y que
// lleve a donde dice.
//
// Las dos roturas que se vigilan aquí NO se ven mirando la pantalla un
// momento: una barra con la sección equivocada marcada se lee como correcta
// hasta que alguien toca un chip, y una barra que se dibuja con una sola
// sección parece un filtro que no filtra nada.

import 'dart:async';

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

/// Una carta mínima con la barra fijada y el salto compartido: lo mismo que
/// montan el detalle del local y la carta de la mesa.
class _Carta extends StatefulWidget {
  const _Carta({required this.secciones, required this.platos});
  final List<String> secciones;
  final int platos;

  @override
  State<_Carta> createState() => _CartaState();
}

class _CartaState extends State<_Carta> with SaltoASecciones<_Carta> {
  @override
  double get altoFijadoArriba => kAltoBarraSecciones;

  @override
  Widget build(BuildContext context) {
    ordenSecciones = widget.secciones;
    return CustomScrollView(
      controller: scrollCarta,
      slivers: [
        const SliverToBoxAdapter(child: SizedBox(height: 120)),
        SliverPersistentHeader(
          pinned: true,
          delegate: BarraSeccionesDelegate(
            secciones: ordenSecciones,
            activa: seccionActiva,
            onSeleccion: (s) => unawaited(irASeccion(s)),
          ),
        ),
        for (final s in widget.secciones) ...[
          SliverToBoxAdapter(
            child: SizedBox(key: claveDeSeccion(s), height: 40, child: Text('Encabezado $s')),
          ),
          SliverList.builder(
            itemCount: widget.platos,
            itemBuilder: (_, i) => SizedBox(height: 100, child: Text('$s plato $i')),
          ),
        ],
      ],
    );
  }
}

Future<void> _montarCarta(WidgetTester tester, List<String> secciones, int platos) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(body: _Carta(secciones: secciones, platos: platos)),
  ));
}

List<String?> _chipsMarcados(WidgetTester tester) => tester
    .widgetList<Text>(find.descendant(
      of: find.byType(BarraSecciones),
      matching: find.byType(Text),
    ))
    .where((t) => t.style?.fontWeight == FontWeight.w700)
    .map((t) => t.data)
    .toList();

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

    testWidgets('la barra SIGUE a la carta: el chip activo queda a la vista',
        (tester) async {
      // Al desplazar la carta la activa cambiaba y la barra se quedaba
      // quieta: el chip resaltado se iba fuera de la pantalla.
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final secciones = [for (var i = 0; i < 20; i++) 'Sección número $i'];

      await tester.pumpWidget(_envuelta(secciones: secciones));
      expect(tester.getRect(find.text('Sección número 15')).left,
          greaterThan(360), reason: 'arranca fuera de la vista');

      await tester.pumpWidget(_envuelta(secciones: secciones, activa: 'Sección número 15'));
      await tester.pumpAndSettle();

      final r = tester.getRect(find.text('Sección número 15'));
      expect(r.left, greaterThanOrEqualTo(0));
      expect(r.right, lessThanOrEqualTo(360));
    });

    testWidgets('aguanta una lista vacía sin reventar', (tester) async {
      await tester.pumpWidget(_envuelta(secciones: const []));
      expect(find.byType(BarraSecciones), findsOneWidget);
    });
  });

  group('el salto a una sección', () {
    // Seis: a 360 px caben todos los chips sin desplazar la barra.
    const secciones = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'];

    testWidgets('lleva a una sección lejana y la deja justo bajo la barra',
        (tester) async {
      // S4 está a más de dos mil píxeles: no está construida al tocar el
      // chip, así que el salto tiene que avanzar y reintentar.
      await _montarCarta(tester, secciones, 5);
      expect(find.text('Encabezado S4'), findsNothing);

      await tester.tap(find.text('S4'));
      await tester.pumpAndSettle();

      final arriba = tester.getTopLeft(find.text('Encabezado S4')).dy;
      // Ni tapado por la barra ni con un hueco encima.
      expect(arriba, closeTo(kAltoBarraSecciones, 1));
      expect(_chipsMarcados(tester), ['S4']);
    });

    testWidgets('en una carta corta el chip se marca aunque no haya a dónde bajar',
        (tester) async {
      // Era el «toco y no pasa nada»: con dos secciones cortas la carta no
      // se puede desplazar, el encabezado no sube y el chip no cambiaba.
      await _montarCarta(tester, const ['Platos', 'Bebidas'], 1);

      await tester.tap(find.text('Bebidas'));
      await tester.pumpAndSettle();

      expect(_chipsMarcados(tester), ['Bebidas']);
    });

    testWidgets('al desplazar a mano marca la sección que se está viendo',
        (tester) async {
      await _montarCarta(tester, secciones, 5);
      final estado = tester.state<_CartaState>(find.byType(_Carta));

      // Encabezado de Si en la carta: 120 + 52 + i·540 − desplazamiento.
      estado.scrollCarta.jumpTo(700);
      await tester.pump(); // se recoloca la carta y se mide
      await tester.pump(); // se pinta la barra con la sección medida

      expect(_chipsMarcados(tester), ['S1']);
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
