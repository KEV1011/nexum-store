/// La hora del reloj a la que llega el carro, no los minutos que faltan.
///
/// «Llegas aprox. a las 23:39» es lo que la persona le reenvía a quien la
/// espera: los minutos sueltos («12 min») obligan a quien lo lee a hacer la
/// suma, y además cambian de significado según cuándo se lean. Los minutos se
/// siguen enseñando donde ayudan —«tu conductor llega en 3 min»—; la hora va
/// donde el viaje ya tiene un final.
library;

import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';

/// `ahora + minutos`, como `HH:mm` de 24 horas.
///
/// 24 horas a propósito: el «10:14 p. m.» con el que salía otro aviso de la app
/// ocupa el doble y se lee peor de reojo, que es como se mira esto.
String horaAproximada(DateTime ahora, int minutos) {
  final t = ahora.add(Duration(minutes: minutos < 0 ? 0 : minutos));
  return '${t.hour.toString().padLeft(2, '0')}:'
      '${t.minute.toString().padLeft(2, '0')}';
}

/// El renglón de llegada para el estado del viaje, o `null` si no aplica.
///
/// Sin minutos válidos (cero o menos) no se inventa una hora: «llegas a las
/// 23:39» cuando no se sabe es peor que no decir nada.
String? textoLlegada(TransportStatus estado, int etaMin, DateTime ahora) {
  if (etaMin <= 0) return null;
  final hora = horaAproximada(ahora, etaMin);
  return switch (estado) {
    TransportStatus.inProgress => 'Llegas aprox. a las $hora',
    TransportStatus.accepted ||
    TransportStatus.arriving =>
      'Te recoge aprox. a las $hora',
    _ => null,
  };
}
