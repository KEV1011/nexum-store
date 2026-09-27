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

  group('a qué columna corresponde el dedo', () {
    // El arrastre es lo que se pedía —mantener y deslizar, como WhatsApp— y
    // esta cuenta es la que decide dónde queda la lupa bajo el dedo y qué se
    // selecciona al soltar. Equivocarla no da error: la lupa va detrás del
    // dedo con desfase, o se selecciona el ítem de al lado.
    test('el centro de cada columna devuelve su índice exacto', () {
      const ancho = 400.0;
      const n = 4; // columnas de 100 px: centros en 50, 150, 250, 350
      expect(columnaDesdeX(50, ancho, n), closeTo(0, 1e-9));
      expect(columnaDesdeX(150, ancho, n), closeTo(1, 1e-9));
      expect(columnaDesdeX(250, ancho, n), closeTo(2, 1e-9));
      expect(columnaDesdeX(350, ancho, n), closeTo(3, 1e-9));
    });

    test('entre dos centros da el valor intermedio', () {
      expect(columnaDesdeX(100, 400, 4), closeTo(0.5, 1e-9));
    });

    test('ES la inversa de dónde se pinta la lupa', () {
      // Si estas dos cuentas se separan, la lupa se pinta en un sitio y se
      // selecciona otro. Se comprueba el viaje de ida y vuelta.
      const ancho = 400.0;
      const n = 4;
      for (final col in [0.0, 1.0, 2.0, 3.0, 1.5]) {
        final x = alineacionDeColumna(col, n);
        // Centro en píxeles según `Align`: izquierda + mitad del ancho.
        const anchoLupa = ancho / n;
        final izquierda = ((x + 1) / 2) * (ancho - anchoLupa);
        final centro = izquierda + anchoLupa / 2;
        expect(columnaDesdeX(centro, ancho, n), closeTo(col, 1e-9));
      }
    });

    test('pasarse por los bordes NO saca la lupa de la barra', () {
      // Un dedo que se va por el lado de la pantalla dejaría la lupa fuera del
      // recorte, o mandaría a seleccionar una columna que no existe.
      expect(columnaDesdeX(-500, 400, 4), 0);
      expect(columnaDesdeX(9999, 400, 4), 3);
    });

    test('al soltar, redondear cae en la columna más cercana', () {
      // Es lo que decide la selección: el dedo tapa el ítem y se suelta donde
      // se puede, así que manda el centro más próximo y no el píxel exacto.
      expect(columnaDesdeX(149, 400, 4).round(), 1);
      expect(columnaDesdeX(199, 400, 4).round(), 1);
      expect(columnaDesdeX(201, 400, 4).round(), 2);
    });

    test('con una sola columna o sin ancho no se divide por cero', () {
      expect(columnaDesdeX(123, 400, 1), 0);
      expect(columnaDesdeX(123, 0, 4), 0);
    });
  });

  test('la campana usa seno y no una recta', () {
    // Una interpolación lineal daría 0,5 en el cuarto del recorrido; el seno
    // da más, que es lo que hace que el arranque se sienta rápido.
    final aUnCuarto = (estironDeViaje(0.25, 3) - 1) / 0.22;
    expect(aUnCuarto, closeTo(math.sin(math.pi * 0.25), 1e-9));
    expect(aUnCuarto, greaterThan(0.5));
  });
}
