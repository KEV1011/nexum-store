/// Los esqueletos de carga: que tengan la forma del contenido y que LATAN.
///
/// Un esqueleto congelado es peor que un spinner: no se lee como «cargando»
/// sino como contenido gris que no cargó, y nadie reporta eso como un fallo
/// —se asume que la app está rota y se cierra—. Como el latido es una
/// animación, ningún `flutter analyze` ni ninguna prueba de datos lo ve: si
/// alguien quita el controlador o deja el `builder` con un color fijo, todo
/// compila y la pantalla se queda quieta.
///
/// Y la segunda regla: **el ritmo vive en UN solo sitio**. Dos esqueletos
/// latiendo a ritmos distintos en la misma pantalla se leen como un fallo de
/// render, y es exactamente así como se separan las copias — la lección del
/// formateador de moneda, que acabó en diecisiete.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/shared/widgets/estados_zipa.dart';

/// Monta [w] en una pantalla de verdad. **Nunca `pumpAndSettle`**: el latido
/// se repite para siempre y esa espera no terminaría jamás.
Future<void> montar(WidgetTester tester, Widget w) async {
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: w)));
  await tester.pump();
}

/// Cuántas cajas con este tamaño exacto hay pintadas.
int cajasDe(WidgetTester tester, {double? ancho, double? alto}) => tester
    .widgetList<Container>(find.byType(Container))
    .where((c) =>
        c.constraints == BoxConstraints.tightFor(width: ancho, height: alto))
    .length;

/// Todos los colores que hay pintados en este fotograma.
List<Color?> coloresAhora(WidgetTester tester) => tester
    .widgetList<Container>(find.byType(Container))
    .map((c) => c.color ?? (c.decoration as BoxDecoration?)?.color)
    .toList();

void main() {
  group('la silueta tiene la forma del contenido', () {
    testWidgets('las filas se pintan tantas como se piden', (tester) async {
      await montar(tester, const EsqueletoFilas(cuantas: 3));
      // 76 × 64 es la miniatura EXACTA de `FilaComercio`: si la fila real
      // cambia de tamaño y el esqueleto no, el contenido salta al llegar.
      expect(cajasDe(tester, ancho: 76, alto: 64), 3);
    });

    testWidgets('la carta pinta portada y platos', (tester) async {
      await montar(tester, const EsqueletoCarta(platos: 4));
      expect(cajasDe(tester, alto: 180), 1, reason: 'la portada');
      expect(cajasDe(tester, ancho: 64, alto: 64), 4, reason: 'los platos');
    });

    testWidgets('la carta se puede desplazar mientras carga', (tester) async {
      // En una pantalla corta, una columna fija desbordaría y Flutter pintaría
      // la franja amarilla y negra encima del esqueleto.
      await tester.binding.setSurfaceSize(const Size(360, 480));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await montar(tester, const EsqueletoCarta());
      expect(tester.takeException(), isNull);
    });
  });

  group('el esqueleto late', () {
    testWidgets('el color cambia con el tiempo', (tester) async {
      // LA COMPROBACIÓN QUE JUSTIFICA EL FICHERO.
      await montar(tester, const EsqueletoFilas(cuantas: 2));
      final antes = coloresAhora(tester);
      await tester.pump(const Duration(milliseconds: 550));
      expect(
        coloresAhora(tester),
        isNot(equals(antes)),
        reason: 'un esqueleto quieto se lee como contenido roto, no como '
            'cargando',
      );
    });

    testWidgets('la carta también', (tester) async {
      await montar(tester, const EsqueletoCarta(platos: 2));
      final antes = coloresAhora(tester);
      await tester.pump(const Duration(milliseconds: 550));
      expect(coloresAhora(tester), isNot(equals(antes)));
    });

    testWidgets('el latido se apaga al salir de la pantalla', (tester) async {
      // Un controlador sin `dispose` deja el ticker vivo y Flutter lo denuncia
      // al terminar la prueba.
      await montar(tester, const EsqueletoCarta());
      await montar(tester, const SizedBox());
      expect(tester.takeException(), isNull);
    });
  });

  group('un solo ritmo para todos', () {
    final fuente =
        File('lib/shared/widgets/estados_zipa.dart').readAsStringSync();

    test('solo UNA clase del fichero tiene su propio ticker', () {
      // Dos esqueletos con su propio controlador laten desfasados en la misma
      // pantalla, y eso se ve como un fallo de render. Se cuenta el mixin y
      // no `AnimationController`, que aparece dos veces por declaración (el
      // tipo y el constructor) — contar el texto a ojo daba un número falso.
      expect(
        RegExp('SingleTickerProviderStateMixin').allMatches(fuente).length,
        1,
        reason: 'el ritmo se comparte con LatidoEsqueleto, no se duplica',
      );
    });

    test('las formas lo usan en vez de animarse solas', () {
      for (final forma in ['EsqueletoFilas', 'EsqueletoCarta']) {
        final i = fuente.indexOf('class $forma');
        expect(i, greaterThan(-1), reason: '$forma ya no existe');
        // Hasta la clase siguiente, o el final si es la última.
        final sig = fuente.indexOf('\nclass ', i + 1);
        final cuerpo = fuente.substring(i, sig == -1 ? fuente.length : sig);
        expect(
          cuerpo.contains('LatidoEsqueleto'),
          isTrue,
          reason: '$forma late por su cuenta: se desincronizará del resto',
        );
      }
    });
  });

  group('las pantallas con forma conocida no vuelven al spinner', () {
    // Lista EXPLÍCITA y no una regla general: un spinner es lo correcto en un
    // botón que envía, en una hoja de acción y en un documento legal, que es
    // texto libre sin forma previsible. Marcar esos usos buenos haría que
    // alguien desactivara la prueba.
    const pantallas = {
      'el detalle del comercio (la carta)':
          'lib/features/businesses/presentation/screens/business_detail_screen.dart',
      'la búsqueda de salidas':
          'lib/features/pooled/presentation/screens/pooled_search_screen.dart',
      'mis reservas':
          'lib/features/pooled/presentation/screens/pooled_bookings_screen.dart',
      'mis viajes':
          'lib/features/transport/presentation/screens/trip_history_screen.dart',
    };

    pantallas.forEach((nombre, ruta) {
      test('$nombre abre con esqueleto', () {
        final s = File(ruta).readAsStringSync();
        expect(
          s.contains('Center(child: CircularProgressIndicator'),
          isFalse,
          reason: 'volvió el spinner centrado en $ruta',
        );
        expect(s.contains('Esqueleto'), isTrue);
      });
    });
  });
}
