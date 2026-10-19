import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/features/auth/presentation/screens/clave_personal_screen.dart';

/// La app avisa con las mismas reglas que aplica el servidor
/// (`backend/src/lib/clave-personal.ts`). Si divergieran, la app dejaría
/// enviar una clave que el servidor rechaza, o bloquearía una buena.
void main() {
  test('las claves que sirven', () {
    for (final c in ['4827', '90315', '271846', ' 4827 ']) {
      expect(motivoClaveLocal(c), isNull, reason: c);
    }
  });

  test('las que no, cada una por su motivo', () {
    for (final c in ['123', '1234567', '12a4', '0000', '777777', '1234', '6543', '8901', '0987']) {
      expect(motivoClaveLocal(c), isNotNull, reason: c);
    }
  });
}
