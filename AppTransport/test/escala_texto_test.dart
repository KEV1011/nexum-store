import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/core/ui/escala_texto.dart';

/// Monta el árbol con el escalado del sistema en [delSistema] y devuelve el
/// que acaba viendo la pantalla.
Future<double> _escalaVista(WidgetTester tester, double delSistema) async {
  late double vista;
  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(delSistema)),
      child: EscalaTexto.acotar(
        Builder(
          builder: (context) {
            vista = MediaQuery.textScalerOf(context).scale(10) / 10;
            return const SizedBox();
          },
        ),
      ),
    ),
  );
  return vista;
}

void main() {
  testWidgets('la letra normal del teléfono pasa intacta', (tester) async {
    expect(await _escalaVista(tester, 1), closeTo(1, 0.001));
  });

  testWidgets('el ajuste "más grande" de Android se respeta entero',
      (tester) async {
    // 1,3 es el tope del menú normal de tamaño de letra: quien lo sube por ahí
    // no debe notar que la app le recorta nada.
    expect(await _escalaVista(tester, 1.3), closeTo(1.3, 0.001));
  });

  testWidgets('el escalado extremo se acota para que nada se desborde',
      (tester) async {
    expect(await _escalaVista(tester, 2), closeTo(EscalaTexto.maximo, 0.001));
  });

  testWidgets('una letra diminuta se sube hasta el mínimo legible',
      (tester) async {
    expect(await _escalaVista(tester, 0.5), closeTo(EscalaTexto.minimo, 0.001));
  });
}
