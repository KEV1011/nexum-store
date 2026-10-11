/// El PIN de entrega no se puede perder en una actualización en vivo.
///
/// ES EL BUG QUE YA OCURRIÓ DOS VECES, en las dos superficies. El PIN llega
/// UNA sola vez —al crear el pedido o el envío— y las actualizaciones que
/// vienen después NO lo traen, ni deben: son el mismo DTO que ve el
/// repartidor, y meterle el PIN sería dárselo a quien tiene que pedirlo.
///
/// Si al aplicar esa actualización se asigna el PIN sin conservar el que ya
/// había, queda en null: el repartidor pide un número que el cliente no ve y
/// **la entrega no se puede cerrar**. No hay error en pantalla, no hay nada en
/// los registros; simplemente deja de poderse terminar el servicio.
///
/// Los dos sitios están arreglados hoy. Esto es lo que impide que alguien
/// limpie el `??` creyendo que sobra — y se vigila sobre el fuente porque los
/// métodos que lo aplican son privados y llegan por un evento del socket, así
/// que ninguna prueba de comportamiento razonable los alcanza. Mismo criterio
/// que el resto de guardas de este repo que cazan lo que no avisa.
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Las líneas que asignan `deliveryPin` leyéndolo de una actualización.
///
/// La CREACIÓN del servicio también asigna el PIN y ahí no hay nada previo que
/// conservar, así que solo se miran las que leen de un `payload`/`data` que
/// llega después.
List<String> asignacionesDesdeActualizacion(String fuente) => fuente
    .split('\n')
    .where((l) => l.contains('deliveryPin:'))
    .where((l) => l.contains("payload['deliveryPin']") || l.contains("data['deliveryPin']"))
    .map((l) => l.trim())
    .toList();

void main() {
  final providers = {
    'pedidos': 'lib/features/orders/presentation/providers/orders_provider.dart',
    'viajes y envíos':
        'lib/features/transport/presentation/providers/transport_provider.dart',
  };

  group('el PIN sobrevive a las actualizaciones en vivo', () {
    providers.forEach((nombre, ruta) {
      test('en $nombre', () {
        final fuente = File(ruta).readAsStringSync();
        final lineas = asignacionesDesdeActualizacion(fuente);
        expect(
          lineas,
          isNotEmpty,
          reason: 'si esta ruta dejó de aplicar actualizaciones, revisar esta '
              'prueba antes de borrarla: puede que el PIN viaje por otro sitio',
        );
        for (final l in lineas) {
          expect(
            l.contains('??'),
            isTrue,
            reason: 'En $ruta esta línea pisa el PIN con lo que traiga la '
                'actualización, y las actualizaciones NO lo traen: queda en '
                'null y la entrega no se puede cerrar.\n  $l',
          );
        }
      });
    });

    test('la guarda caza el defecto que se quiere evitar', () {
      // Se comprueba a sí misma: así, el día que alguien cambie el parser,
      // sabrá si esta prueba sigue mirando lo que cree.
      const malo = "        deliveryPin: payload['deliveryPin'] as String?,";
      const bueno =
          "        deliveryPin: payload['deliveryPin'] as String? ?? o.deliveryPin,";
      expect(asignacionesDesdeActualizacion(malo).single.contains('??'), isFalse);
      expect(asignacionesDesdeActualizacion(bueno).single.contains('??'), isTrue);
    });
  });
}
