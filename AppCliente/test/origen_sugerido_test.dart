import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/shared/providers/origen_sugerido_provider.dart';

/// El punto de recogida que llega en el canje del enlace de WhatsApp.
///
/// Se prueba aparte porque es JSON de la red leído en el camino por el que el
/// pasajero ENTRA a la app: si el parseo lanza, no falla el punto de recogida
/// —falla la entrada entera, y la persona se queda fuera por culpa de un dato
/// que era opcional.
void main() {
  group('leer el origen del canje', () {
    test('un punto completo se lee con su etiqueta', () {
      final o = OrigenSugerido.fromJson({
        'lat': 7.3754,
        'lng': -72.6486,
        'etiqueta': 'Parque Águeda',
      });
      expect(o, isNotNull);
      expect(o!.lat, 7.3754);
      expect(o.lng, -72.6486);
      expect(o.etiqueta, 'Parque Águeda');
    });

    test('sin etiqueta el punto sigue valiendo', () {
      // Es el caso NORMAL: WhatsApp casi nunca adjunta nombre ni dirección.
      final o = OrigenSugerido.fromJson({'lat': 7.37, 'lng': -72.64});
      expect(o?.etiqueta, isNull);
      expect(o?.lat, 7.37);
    });

    test('una etiqueta en blanco no se guarda como texto vacío', () {
      expect(OrigenSugerido.fromJson({'lat': 1.0, 'lng': 2.0, 'etiqueta': '   '})?.etiqueta,
          isNull);
    });

    test('enteros de JSON se leen como decimales', () {
      // El JSON puede traer `7` en vez de `7.0`; un `as double` reventaría.
      final o = OrigenSugerido.fromJson({'lat': 7, 'lng': -72});
      expect(o?.lat, 7.0);
      expect(o?.lng, -72.0);
    });

    test('lo que falta o viene a medias devuelve null, nunca lanza', () {
      // Media coordenada no es un sitio. Y un backend anterior a esta función
      // sencillamente no manda el campo.
      expect(OrigenSugerido.fromJson(null), isNull);
      expect(OrigenSugerido.fromJson({}), isNull);
      expect(OrigenSugerido.fromJson({'lat': 7.37}), isNull);
      expect(OrigenSugerido.fromJson({'lng': -72.64}), isNull);
      expect(OrigenSugerido.fromJson('7.37,-72.64'), isNull);
      expect(OrigenSugerido.fromJson({'lat': 'siete', 'lng': 'menos setenta'}), isNull);
      expect(OrigenSugerido.fromJson({'lat': 7.37, 'lng': null}), isNull);
    });

    test('una etiqueta que no es texto no tira el punto a la basura', () {
      // `as String?` habría lanzado aquí, y se perdería una recogida válida por
      // culpa del campo menos importante de los tres.
      final o = OrigenSugerido.fromJson({'lat': 7.37, 'lng': -72.64, 'etiqueta': 42});
      expect(o, isNotNull);
      expect(o!.etiqueta, isNull);
    });

    test('(0, 0) no es un punto: es el dato que falta', () {
      // El Golfo de Guinea. Pintarle esa recogida al pasajero sería mandar al
      // conductor a mitad del Atlántico con el viaje ya pedido.
      expect(OrigenSugerido.fromJson({'lat': 0, 'lng': 0}), isNull);
      // Pero un cero SOLO es legítimo: el ecuador y Greenwich existen.
      expect(OrigenSugerido.fromJson({'lat': 0, 'lng': -72.64}), isNotNull);
    });
  });
}
