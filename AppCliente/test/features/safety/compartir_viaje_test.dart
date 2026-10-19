import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/safety/presentation/widgets/compartir_viaje.dart';

void main() {
  test('el texto lleva el enlace completo', () {
    const url = 'https://portal.zipa.test/viaje/abc.def.ghi';
    expect(textoParaCompartir(url), contains(url));
  });

  // El token del enlace lleva puntos y guiones, y el texto lleva espacios y
  // tildes: si no se codifica, WhatsApp recibe el mensaje partido.
  test('el enlace de WhatsApp codifica el texto entero', () {
    final uri = enlaceWhatsapp('Sigue mi viaje: https://x.test/viaje/a.b-c?d=1&e=2');
    expect(uri.host, 'wa.me');
    expect(uri.queryParameters['text'],
        'Sigue mi viaje: https://x.test/viaje/a.b-c?d=1&e=2');
    expect(uri.toString(), isNot(contains(' ')));
  });
}
