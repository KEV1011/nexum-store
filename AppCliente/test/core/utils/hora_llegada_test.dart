import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/core/utils/hora_llegada.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';

void main() {
  group('hora del reloj', () {
    test('suma los minutos y escribe 24 horas', () {
      expect(horaAproximada(DateTime(2026, 10, 19, 23, 27), 12), '23:39');
      expect(horaAproximada(DateTime(2026, 10, 19, 9, 5), 3), '09:08');
    });

    test('cruza la medianoche', () {
      expect(horaAproximada(DateTime(2026, 10, 19, 23, 50), 25), '00:15');
    });
  });

  group('el renglón según el estado', () {
    final ahora = DateTime(2026, 10, 19, 23, 27);

    test('en trayecto: a qué hora llegas', () {
      expect(textoLlegada(TransportStatus.inProgress, 12, ahora),
          'Llegas aprox. a las 23:39');
    });

    test('mientras viene: a qué hora te recoge', () {
      expect(textoLlegada(TransportStatus.arriving, 3, ahora),
          'Te recoge aprox. a las 23:30');
      expect(textoLlegada(TransportStatus.accepted, 3, ahora),
          'Te recoge aprox. a las 23:30');
    });

    test('buscando, reservado o terminado: nada', () {
      for (final e in [
        TransportStatus.searching,
        TransportStatus.scheduled,
        TransportStatus.arrived,
        TransportStatus.completed,
        TransportStatus.cancelled,
      ]) {
        expect(textoLlegada(e, 12, ahora), isNull, reason: e.name);
      }
    });

    test('sin minutos válidos no se inventa una hora', () {
      expect(textoLlegada(TransportStatus.inProgress, 0, ahora), isNull);
    });
  });
}
