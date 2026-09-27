import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'tarjeta_servicio.dart';

/// Painter que solo anota con qué superficie lo llamaron.
///
/// Es la única forma de cazar esto: un `CustomPaint` sin hijo y sin `size`
/// mide CERO cuando le llegan restricciones flojas, y eso no falla, no avisa y
/// no se ve en el árbol de widgets — simplemente no pinta. En pantalla quedaba
/// el cuadro de color vacío, que parece un icono que no cargó.
class _PainterEspia extends CustomPainter {
  _PainterEspia(this.visto);

  /// Lista de un elemento donde se deja la medida: un campo mutable dentro del
  /// painter no sirve porque el widget se reconstruye.
  final List<Size> visto;

  @override
  void paint(Canvas canvas, Size size) {
    visto.add(size);
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFF000000));
  }

  @override
  bool shouldRepaint(covariant _PainterEspia old) => false;
}

Widget _montar(Widget tarjeta) => MaterialApp(
      home: Scaffold(
        // Ancho de una columna de la rejilla de dos, que es como vive.
        body: Center(child: SizedBox(width: 170, child: tarjeta)),
      ),
    );

void main() {
  testWidgets('un dibujo recibe superficie de verdad, no cero', (tester) async {
    final visto = <Size>[];

    await tester.pumpWidget(_montar(
      TarjetaServicio(
        icono: ZipaIconName.restaurantes,
        tinte: ZipaTokens.restaurantes,
        titulo: 'Restaurantes',
        subtitulo: 'Comida a domicilio',
        onTap: () {},
        dibujo: CustomPaint(painter: _PainterEspia(visto)),
      ),
    ));
    await tester.pump();

    expect(visto, isNotEmpty, reason: 'el painter nunca llegó a pintarse');
    // El cuadro son 54 px con 4 de margen: 46 de lado. Se comprueba contra un
    // mínimo holgado para no atarse al número exacto, pero muy por encima de
    // cero, que es lo que daba el fallo.
    expect(visto.last.width, greaterThan(30));
    expect(visto.last.height, greaterThan(30));
  });

  testWidgets('sin dibujo ni ilustración se pinta el glifo del catálogo',
      (tester) async {
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
}
