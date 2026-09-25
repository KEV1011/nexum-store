import 'dart:io';
import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/shared/widgets/lupa_vidrio.dart';

/// La lupa de la barra inferior se rompe de dos formas que NADIE ve en una
/// revisión de código y que en pantalla parecen un fallo del teléfono: queda
/// entre dos ítems, o se sale del recorte de la barra y aparece cortada.
///
/// Las dos son aritmética pura, así que se fijan aquí en vez de dejarlas a un
/// vistazo en un dispositivo.
void main() {
  group('dónde se coloca', () {
    test('la primera columna va pegada a la izquierda y la última a la derecha', () {
      expect(alineacionDeColumna(0, 4), -1);
      expect(alineacionDeColumna(3, 4), 1);
    });

    test('la del medio cae en el centro', () {
      // Con cinco columnas (la barra del conductor: ítem, Conectar, resto) la
      // tercera es el centro exacto.
      expect(alineacionDeColumna(2, 5), 0);
    });

    test('una posición a medio camino cae a medio camino', () {
      final a = alineacionDeColumna(0, 4);
      final b = alineacionDeColumna(1, 4);
      expect(alineacionDeColumna(0.5, 4), closeTo((a + b) / 2, 1e-9));
    });

    test('con una sola columna no se divide por cero', () {
      expect(alineacionDeColumna(0, 1), 0);
      expect(alineacionDeColumna(0, 0), 0);
    });
  });

  group('cuánto se estira al viajar', () {
    test('QUIETA NO SE ESTIRA en ninguno de los dos extremos', () {
      // Es lo que impide que se salga del clip sobre la primera o la última
      // columna, donde el margen de 6 px no daría para un 22 % más de ancho.
      expect(estironDeViaje(0, 3), 1);
      expect(estironDeViaje(1, 3), 1);
    });

    test('el estirón es máximo a mitad de camino', () {
      final mitad = estironDeViaje(0.5, 3);
      expect(mitad, greaterThan(estironDeViaje(0.25, 3)));
      expect(mitad, greaterThan(estironDeViaje(0.75, 3)));
      expect(mitad, closeTo(1.22, 1e-9));
    });

    test('un salto corto estira menos que cruzar la barra entera', () {
      expect(estironDeViaje(0.5, 1), lessThan(estironDeViaje(0.5, 3)));
    });

    test('sin salto no hay deformación en ningún instante', () {
      for (var t = 0.0; t <= 1.0; t += 0.1) {
        expect(estironDeViaje(t, 0), 1);
      }
    });

    test('un salto imposible no dispara el estirón por encima del tope', () {
      // Defensivo: si algún día la barra crece, la intensidad sigue acotada y
      // la lupa no se desborda.
      expect(estironDeViaje(0.5, 99), closeTo(1.22, 1e-9));
    });

    test('nunca se encoge ni se invierte', () {
      for (var t = -0.5; t <= 1.5; t += 0.1) {
        final v = estironDeViaje(t, 3);
        expect(v, greaterThanOrEqualTo(1));
        expect(v, lessThanOrEqualTo(1.22 + 1e-9));
      }
    });

    test('la campana es simétrica', () {
      for (var t = 0.0; t <= 0.5; t += 0.1) {
        expect(estironDeViaje(t, 2), closeTo(estironDeViaje(1 - t, 2), 1e-9));
      }
    });
  });

  group('el ancho estirado cabe en su columna', () {
    // La lupa ocupa el ancho de una columna menos 6 px de margen por lado. Si
    // el estirón se comiera ese margen justo al llegar, se vería chocar con el
    // borde de la barra. Se comprueba con la barra más apretada que existe hoy
    // (cinco columnas en una pantalla pequeña).
    test('en el peor caso el estirón ya se ha deshecho al llegar', () {
      const anchoBarra = 320.0;
      const columnas = 5;
      const margen = 6.0;
      final anchoColumna = anchoBarra / columnas;
      final anchoLupa = anchoColumna - 2 * margen;

      // Al llegar (t = 1) la lupa mide exactamente su ancho: cabe con margen.
      expect(anchoLupa * estironDeViaje(1, 4), lessThanOrEqualTo(anchoColumna));

      // Y en el punto de máximo estirón está a mitad de camino, o sea a media
      // columna del borde: el desbordamiento no puede alcanzarlo.
      final maximo = anchoLupa * estironDeViaje(0.5, 4);
      final holguraViajando = anchoColumna / 2;
      expect((maximo - anchoLupa) / 2, lessThan(holguraViajando));
    });
  });

  test('las dos apps llevan EXACTAMENTE la misma lupa', () {
    // No hay paquete compartido entre las dos apps, así que el widget está
    // duplicado. Dos copias de una animación divergen en cuanto alguien toca
    // una —le pasó al formateador de moneda del portal, que acabó en
    // diecisiete copias y dos formatos distintos— y la barra es lo primero que
    // se ve al abrir cualquiera de las dos apps: moverse distinto se nota al
    // pasar de una a otra.
    //
    // Se compara el fuente entero módulo el nombre del paquete. Si esta prueba
    // cae, la respuesta no es editarla: es copiar el fichero al otro lado.
    // El mismo fichero de prueba corre en las dos apps, así que la otra copia
    // se busca a los dos lados y los nombres de paquete se normalizan: así no
    // hay una versión del test por app, que es otra pareja que divergiría.
    const rel = 'lib/shared/widgets/lupa_vidrio.dart';
    final aqui = File(rel);
    final alla = [File('../AppTransport/$rel'), File('../AppCliente/$rel')]
        .firstWhere(
      (f) => f.existsSync() && f.absolute.path != aqui.absolute.path,
      orElse: () => File('no-existe'),
    );
    expect(aqui.existsSync(), isTrue);
    expect(alla.existsSync(), isTrue, reason: 'falta la copia de la otra app');

    String normaliza(File f) =>
        f.readAsStringSync().replaceAll('nexum_driver', 'nexum_client');
    expect(
      normaliza(alla),
      normaliza(aqui),
      reason: 'las dos lupas se separaron: copia el fichero al otro lado',
    );
  });

  test('la campana usa seno y no una recta', () {
    // Una interpolación lineal daría 0,5 en el cuarto del recorrido; el seno
    // da más, que es lo que hace que el arranque se sienta rápido.
    final aUnCuarto = (estironDeViaje(0.25, 3) - 1) / 0.22;
    expect(aUnCuarto, closeTo(math.sin(math.pi * 0.25), 1e-9));
    expect(aUnCuarto, greaterThan(0.5));
  });
}
