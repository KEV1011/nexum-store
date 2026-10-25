import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:nexum_driver/shared/models/trip_model.dart';

void main() {
  group('la fecha del servidor se lee en la hora del teléfono', () {
    test('un ISO en UTC queda LOCAL', () {
      // 01:30 UTC del 25 = 20:30 del 24 en Colombia. Leída en UTC, el viaje
      // nocturno caía en el día siguiente y «Mis ganancias» decía $0 hoy.
      final f = fechaDelServidor('2026-10-25T01:30:00.000Z');
      expect(f.isUtc, isFalse);
      expect(f, DateTime.utc(2026, 10, 25, 1, 30).toLocal());
    });

    test('sin fecha legible no revienta', () {
      expect(fechaDelServidor(null).isUtc, isFalse);
      expect(fechaDelServidor('no-es-fecha').isUtc, isFalse);
      expect(fechaDelServidor(42).isUtc, isFalse);
    });

    test('la caché también se lee en hora local', () {
      final s = File('lib/shared/models/trip_model.dart').readAsStringSync();
      expect(s, contains("DateTime.parse(json['finished_at'] as String).toLocal()"));
    });
  });

  test('las ganancias de hoy salen de UNA sola fuente', () {
    // El contador en memoria nacía en cero en cada arranque y sumaba aunque el
    // servidor no hubiera liquidado: el inicio decía «$4.250 · 1 viaje» y Mis
    // ganancias «$0». Estas pantallas leen ahora el historial del servidor.
    for (final ruta in [
      'lib/features/driver_status/presentation/screens/home_screen.dart',
      'lib/features/profile/presentation/screens/profile_screen.dart',
      'lib/features/active_trip/presentation/screens/trip_summary_screen.dart',
    ]) {
      final s = File(ruta).readAsStringSync();
      expect(s, isNot(contains('.dailyEarnings')), reason: ruta);
      expect(s, isNot(contains('.dailyTrips')), reason: ruta);
      expect(s, contains('gananciasDeHoyProvider'), reason: ruta);
    }
  });
}
