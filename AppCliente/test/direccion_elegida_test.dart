// La dirección que elige la persona es la que queda.
//
// Reporte del dueño: «la dirección, cuando se escoge del mapa o se escribe,
// arroja la que la app quiere». Tres causas, y esta prueba fija la regla que
// las une: un punto elegido NO se pierde por completar el texto.
//
// 1. Del mapa salía la calle más cercana que da Google («Pje. la Curia #6») y
//    no se podía corregir: cualquier tecla borraba el punto, así que había que
//    aceptar esa dirección o perder la ubicación marcada.
// 2. De la lista, el texto que quedaba era el que Google devolvía al
//    resolverla, no el que la persona tocó.
// 3. «Mis direcciones» comparaba el texto con el elegido y tiraba el pin en
//    cuanto se le añadía «casa 3».

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/shared/widgets/address_autocomplete_field.dart';

void main() {
  group('marcado en el MAPA', () {
    test('reemplazar el texto de Google por la dirección real conserva el pin',
        () {
      expect(
        puntoSobreviveEdicion(
          origen: OrigenPunto.mapa,
          elegido: 'Pje. la Curia #6, Pamplona, Norte de Santander',
          escrito: 'Calle 4 # 6-12, barrio El Carmen',
        ),
        isTrue,
      );
    });

    test('vaciar el campo sí lo suelta: empieza otra dirección', () {
      expect(
        puntoSobreviveEdicion(
          origen: OrigenPunto.mapa,
          elegido: 'Pje. la Curia #6',
          escrito: '   ',
        ),
        isFalse,
      );
    });
  });

  group('elegido de la LISTA', () {
    test('completar con casa o apto conserva el punto', () {
      expect(
        puntoSobreviveEdicion(
          origen: OrigenPunto.sugerencia,
          elegido: 'Calle 9 # 5-20, Pamplona',
          escrito: 'Calle 9 # 5-20, Pamplona, apto 201',
        ),
        isTrue,
      );
    });

    test('escribir OTRA dirección encima lo suelta', () {
      // El punto salió de ese texto: con otra dirección mandaría al
      // repartidor al sitio equivocado.
      expect(
        puntoSobreviveEdicion(
          origen: OrigenPunto.sugerencia,
          elegido: 'Calle 9 # 5-20, Pamplona',
          escrito: 'Carrera 6 # 4-20',
        ),
        isFalse,
      );
    });
  });

  test('sin punto elegido, escribir no inventa ninguno', () {
    expect(
      puntoSobreviveEdicion(
        origen: OrigenPunto.ninguno,
        elegido: '',
        escrito: 'Calle 4 # 6-12',
      ),
      isFalse,
    );
  });

  group('sobre el fuente', () {
    test('de la lista queda el texto que la persona TOCÓ', () {
      final src = File('lib/shared/widgets/address_autocomplete_field.dart')
          .readAsStringSync();
      expect(src, contains('suggestion.description'));
      expect(src, isNot(contains('details?.address ?? suggestion.description')));
    });

    test('el mapa deja corregir el texto y no confirma con el de otro punto',
        () {
      final src =
          File('lib/shared/widgets/map_location_picker.dart').readAsStringSync();
      expect(src, contains('TextField('));
      expect(src, contains('n != _consulta'));
      expect(src, contains('if (_pendiente && !_editado) await _resolverDireccion()'));
    });

    test('«Mis direcciones» no tira el pin comparando textos', () {
      final src = File(
        'lib/features/addresses/presentation/screens/addresses_screen.dart',
      ).readAsStringSync();
      expect(src, isNot(contains('_place?.address == address')));
    });
  });
}
