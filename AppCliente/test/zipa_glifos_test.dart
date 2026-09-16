import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/app/theme/zipa_glifos.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';

/// Lo que vigila este archivo no es «el dibujo es bonito» —eso no lo puede
/// decir una máquina y para eso está `tools/previsualizar-glifos.py`— sino las
/// dos formas concretas en que estos glifos se rompen sin que nadie se entere:
///
/// 1. Un número mal tecleado saca una pieza fuera de la rejilla de 24, y ahí no
///    se ve nada: el glifo aparece incompleto y parece un problema de la
///    pantalla, no del dibujo.
/// 2. Un hueco deja de ser hueco. Las ventanas y los bujes están recortados con
///    `PathOperation.difference`; si alguien los suma en vez de restarlos, o
///    cambia el orden en la buseta, el glifo sigue compilando y sigue
///    pintándose — macizo. En un icono pequeño eso es exactamente lo que
///    convierte un taxi en una mancha.
void main() {
  group('trazado de los glifos', () {
    test('ninguno sale de la rejilla de 24', () {
      for (final g in ZipaGlifo.values) {
        final b = trazadoDe(g).getBounds();
        expect(b.isEmpty, isFalse, reason: '$g no dibuja nada');
        expect(b.left, greaterThanOrEqualTo(-0.01), reason: '$g se sale por la izquierda');
        expect(b.top, greaterThanOrEqualTo(-0.01), reason: '$g se sale por arriba');
        expect(b.right, lessThanOrEqualTo(24.01), reason: '$g se sale por la derecha');
        expect(b.bottom, lessThanOrEqualTo(24.01), reason: '$g se sale por abajo');
      }
    });

    test('la tinta va centrada en la rejilla', () {
      // Un dibujo que ocupa de y=4 a y=15 se ve caído aunque el lienzo esté
      // centrado, y al lado de los iconos de Material se nota enseguida.
      for (final g in ZipaGlifo.values) {
        final b = trazadoDe(g).getBounds();
        expect(b.center.dx, closeTo(12, 1.0), reason: '$g descentrado en horizontal');
        expect(b.center.dy, closeTo(12, 1.5), reason: '$g descentrado en vertical');
      }
    });

    test('los huecos son huecos de verdad', () {
      // Los puntos salieron del modelo de Pillow y se comprobaron ahí antes de
      // escribirlos aquí: son dos implementaciones distintas de los mismos
      // números, así que si las dos coinciden, coinciden por el dibujo.
      const dentro = <ZipaGlifo, List<Offset>>{
        ZipaGlifo.movilidad: [Offset(12, 14)], // la carrocería
        ZipaGlifo.restaurantes: [Offset(12, 12), Offset(12, 17.4)], // campana y bandeja
        ZipaGlifo.envios: [Offset(12, 7.4), Offset(12, 16.8)], // tapa y cuerpo
        ZipaGlifo.intermunicipal: [Offset(9.65, 9.5), Offset(12, 5.8)], // montante y techo
      };
      const fuera = <ZipaGlifo, List<Offset>>{
        ZipaGlifo.movilidad: [Offset(10, 9.5), Offset(7, 17)], // ventana y buje
        ZipaGlifo.restaurantes: [Offset(12, 3)], // el aire de arriba
        ZipaGlifo.envios: [Offset(12, 14.05)], // el tirador
        ZipaGlifo.intermunicipal: [Offset(6.5, 9.5), Offset(17, 17.6)], // ventana y buje
      };

      for (final g in ZipaGlifo.values) {
        final p = trazadoDe(g);
        for (final o in dentro[g]!) {
          expect(p.contains(o), isTrue, reason: '$g debería tener tinta en $o');
        }
        for (final o in fuera[g]!) {
          expect(p.contains(o), isFalse, reason: '$g debería tener hueco en $o');
        }
      }
    });

    test('el trazado se reutiliza en vez de rehacerse', () {
      // `Path.combine` recorta de verdad; rehacerlo en cada fotograma de la
      // barra de navegación sería trabajo tirado.
      expect(identical(trazadoDe(ZipaGlifo.envios), trazadoDe(ZipaGlifo.envios)), isTrue);
    });
  });

  group('cómo llegan a la pantalla', () {
    testWidgets('los cuatro servicios se pintan, no salen de Material', (tester) async {
      for (final n in pintadosParaPruebas.keys) {
        await tester.pumpWidget(MaterialApp(home: Scaffold(body: ZipaIcon(n))));
        // Descendiente de ZipaIcon, no `byType` a secas: un MaterialApp trae
        // sus propios CustomPaint y la prueba pasaría aunque el icono no
        // pintara nada.
        expect(
          find.descendant(
            of: find.byType(ZipaIcon),
            matching: find.byType(CustomPaint),
          ),
          findsWidgets,
          reason: '$n debería pintarse',
        );
        expect(
          find.descendant(of: find.byType(ZipaIcon), matching: find.byType(Icon)),
          findsNothing,
          reason: '$n no debería caer en el icono de Material',
        );
      }
    });

    testWidgets('el glifo propio respeta el tamaño del catálogo', (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: Column(children: [
            ZipaIcon(ZipaIconName.movilidad),
            ZipaIcon(ZipaIconName.envios, size: ZipaIconSize.inline),
          ]),
        ),
      ));
      expect(tester.getSize(find.byType(ZipaIcon).at(0)), const Size(20, 20));
      expect(tester.getSize(find.byType(ZipaIcon).at(1)), const Size(16, 16));
    });

    test('todo glifo propio conserva su respaldo de Material', () {
      // Es la red: si mañana se retira un dibujo, el icono no desaparece de la
      // pantalla, vuelve al de catálogo.
      for (final n in pintadosParaPruebas.keys) {
        expect(glifosParaPruebas[n], isNotNull, reason: '$n se quedaría sin nada que pintar');
      }
    });
  });
}
