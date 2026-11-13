// La hoja inferior y la barra de navegación del teléfono.
//
// En los Android que dibujan de borde a borde (obligatorio desde Android 15)
// los botones del sistema van ENCIMA de la app. Una hoja que llega al borde de
// abajo dejaba su último botón («Enviar a la cocina», «Calificar»,
// «Solicitar») debajo de ellos: en unos teléfonos se veía y en otros no.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexum_client/shared/widgets/hoja_deslizable.dart';

Future<void> _montar(WidgetTester tester, {required EdgeInsets barraSistema, EdgeInsets teclado = EdgeInsets.zero}) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(
    home: MediaQuery(
      data: MediaQueryData(
        size: const Size(360, 640),
        viewPadding: barraSistema,
        padding: barraSistema,
        viewInsets: teclado,
      ),
      child: const Scaffold(
        body: Align(
          alignment: Alignment.bottomCenter,
          child: HojaDeslizable(
            children: [
              Text('¿Cómo estuvo tu pedido?'),
              SizedBox(height: 12),
              SizedBox(height: 48, width: double.infinity, child: Text('Botón final')),
            ],
          ),
        ),
      ),
    ),
  ));
}

void main() {
  testWidgets('el último botón queda POR ENCIMA de la barra del sistema', (tester) async {
    await _montar(tester, barraSistema: const EdgeInsets.only(bottom: 48));
    final abajo = tester.getBottomLeft(find.text('Botón final')).dy;
    expect(abajo, lessThanOrEqualTo(640 - 48));
  });

  testWidgets('con el teclado abierto no suma la barra (ya la tapa el teclado)', (tester) async {
    await _montar(
      tester,
      barraSistema: const EdgeInsets.only(bottom: 48),
      teclado: const EdgeInsets.only(bottom: 300),
    );
    final sinBarra = tester.getBottomLeft(find.text('Botón final')).dy;
    // 640 − teclado − padding de la hoja (20): sin los 48 de la barra encima.
    expect(sinBarra, closeTo(640 - 300 - 20, 1));
  });
}
