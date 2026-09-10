import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/shared/services/navegacion_externa.dart';

/// Montar mal una de estas URL no da un error: da un navegador llevando al
/// conductor a OTRO sitio, y eso solo se descubre en la calle.
void main() {
  const pamplona = Destino(lat: 7.3754, lng: -72.6486, etiqueta: 'Calle 5 #3-40');

  group('la URL lleva al punto correcto', () {
    test('Waze recibe la coordenada y arranca navegando', () {
      final urls = urlsDeNavegacion(AppDeMapas.waze, pamplona, esAndroid: true);
      expect(urls.first, 'waze://?ll=7.375400,-72.648600&navigate=yes');
      // `navigate=yes` es lo que hace que arranque en vez de solo mostrar el
      // punto; sin eso el conductor tendría que tocar «Ir» él mismo.
      expect(urls.first, contains('navigate=yes'));
    });

    test('Google Maps en Android arranca la navegación sin pantalla intermedia', () {
      final urls = urlsDeNavegacion(AppDeMapas.googleMaps, pamplona, esAndroid: true);
      expect(urls.first, startsWith('google.navigation:q=7.375400,-72.648600'));
      expect(urls.first, contains('mode=d'));
    });

    test('en iOS se usa el esquema de iOS, no el intent de Android', () {
      final urls = urlsDeNavegacion(AppDeMapas.googleMaps, pamplona, esAndroid: false);
      expect(urls.first, startsWith('comgooglemaps://'));
      expect(urls.first, isNot(contains('google.navigation')));
    });
  });

  group('lo que hace que no falle en silencio', () {
    test('SIEMPRE hay una salida web detrás', () {
      // Es la red de seguridad: sin la app instalada, el conductor ve el mapa
      // en el navegador en vez de que no pase nada.
      for (final app in AppDeMapas.values) {
        for (final android in [true, false]) {
          final urls = urlsDeNavegacion(app, pamplona, esAndroid: android);
          expect(urls.length, greaterThanOrEqualTo(2), reason: '$app android=$android');
          expect(urls.last, startsWith('https://'), reason: '$app android=$android');
        }
      }
    });

    test('el punto decimal es un PUNTO, no la coma de es-CO', () {
      // Con «7,3754» la coordenada se partiría en dos parámetros y el
      // conductor acabaría en cualquier parte.
      final urls = urlsDeNavegacion(AppDeMapas.waze, pamplona, esAndroid: true);
      expect(urls.first, isNot(contains('7,37')));
      expect(urls.first, contains('7.3754'));
    });

    test('un destino sin coordenadas NO ofrece navegación', () {
      // (0,0) es el Golfo de Guinea: aparece cuando faltaba el dato, y mandar
      // allí al conductor es peor que no ofrecer el botón.
      expect(const Destino(lat: 0, lng: 0).esValido, isFalse);
      expect(urlsDeNavegacion(AppDeMapas.waze, const Destino(lat: 0, lng: 0), esAndroid: true),
          isEmpty);
      expect(const Destino(lat: double.nan, lng: -72.6).esValido, isFalse);
      expect(const Destino(lat: 91, lng: -72.6).esValido, isFalse);
      expect(pamplona.esValido, isTrue);
    });

    test('una etiqueta con espacios o acentos no rompe la URL', () {
      final urls = urlsDeNavegacion(
        AppDeMapas.sistema,
        const Destino(lat: 7.3754, lng: -72.6486, etiqueta: 'Parque Águeda Gallardo'),
        esAndroid: true,
      );
      expect(urls.first, isNot(contains(' ')));
      expect(urls.first, contains('%20'));
    });
  });
}
