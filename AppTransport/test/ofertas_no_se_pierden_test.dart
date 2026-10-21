/// Las ofertas no se pierden cuando el socket tarda en conectar.
///
/// El panel decía «recibiría la oferta» (en línea, GPS de hace un segundo, a
/// medio kilómetro) y al repartidor no le salía nada. Había dos caminos por
/// los que el home dejaba de escuchar mientras el servidor lo daba en línea:
///
/// 1. Si el PRIMER intento de conexión fallaba, `_connectWs` salía con un
///    `return` antes de arrancar el GPS y de suscribirse a las ofertas. El
///    socket se reconectaba solo y nadie escuchaba.
/// 2. Al volver al home, solo se restauraba «en línea» si el socket estaba
///    conectado en ese instante — no si se estaba reconectando.
///
/// Son reglas sobre el flujo del widget, que no se puede montar aquí sin el
/// socket real; por eso se vigila el fuente.
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final home = File(
    'lib/features/driver_status/presentation/screens/home_screen.dart',
  ).readAsStringSync();

  test('un primer intento fallido no corta la escucha de ofertas', () {
    final inicio = home.indexOf('if (!connected) {');
    expect(inicio, greaterThan(0), reason: 'no se encontró el manejo del fallo');
    final cierre = home.indexOf('\n    }\n', inicio);
    final bloque = home.substring(inicio, cierre);
    expect(bloque.contains('return'), isFalse,
        reason: 'con un return aquí el GPS y las suscripciones no arrancan');
  });

  test('al volver al home cuenta el socket que se está reconectando', () {
    expect(home.contains('ws.quiereConexion'), isTrue);
  });

  test('cada conexión cancela las escuchas anteriores', () {
    final conectar = home.indexOf('Future<void> _connectWs() async {');
    final escucha = home.indexOf('_wsOrderSub = ', conectar);
    final cancela = home.indexOf('_cancelarEscuchas();', conectar);
    expect(cancela, greaterThan(conectar));
    expect(cancela, lessThan(escucha));
  });
}
