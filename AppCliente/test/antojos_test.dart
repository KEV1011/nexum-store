// «¿Qué se te antoja?» y buscar por plato: las reglas que hacen que la home
// no mienta sobre lo que hay. Ver `lib/features/businesses/domain/antojos.dart`.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/businesses/domain/antojos.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'fila_antojos.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

ProductEntity plato(
  String nombre, {
  String seccion = 'General',
  String descripcion = '',
  double precio = 10000,
  bool alPagar = false,
}) =>
    ProductEntity(
      id: '$nombre-$seccion',
      name: nombre,
      description: descripcion,
      price: precio,
      category: seccion,
      suggestAsAddon: alPagar,
    );

BusinessEntity local(
  String nombre,
  List<ProductEntity> platos, {
  bool abierto = true,
  double? nota,
}) =>
    BusinessEntity(
      id: nombre,
      name: nombre,
      category: BusinessCategory.restaurant,
      rating: nota,
      etaMinutes: 30,
      deliveryFee: 3000,
      address: 'Calle 5 # 3-40',
      products: platos,
      isOpen: abierto,
    );

String? clave(ProductEntity p) => antojoDeProducto(p)?.clave;

void main() {
  group('a qué antojo pertenece un plato', () {
    test('el tipo de plato manda sobre el ingrediente', () {
      // «Hamburguesa de pollo» es una hamburguesa: por eso los platos van
      // antes que los ingredientes sueltos en el catálogo.
      expect(clave(plato('Hamburguesa de pollo')), 'hamburguesas');
      expect(clave(plato('Arepa con pollo y queso')), 'arepas');
      expect(clave(plato('Pollo broaster')), 'pollo');
    });

    test('el pollo es EL plato o va dentro de otro', () {
      // El plato es el pollo…
      expect(clave(plato('Pollo asado entero')), 'pollo');
      expect(clave(plato('1/2 pollo broaster')), 'pollo');
      expect(clave(plato('Alitas BBQ x6')), 'pollo');
      expect(clave(plato('Pechuga a la plancha')), 'pollo');
      // …o es un ingrediente de otra cosa.
      expect(clave(plato('Empanada de pollo')), 'empanadas');
      expect(clave(plato('Ajiaco con pollo')), 'almuerzos');
      expect(clave(plato('Arroz con pollo')), 'almuerzos');
      expect(clave(plato('Sopa de pollo')), 'almuerzos');
      // La parrilla sigue siendo parrilla.
      expect(clave(plato('Costillas BBQ')), 'asados');
      expect(clave(plato('Picada con pollo')), 'asados');
    });

    test('un combo se clasifica por lo que trae', () {
      expect(
        clave(plato('Combo 1', seccion: 'Combos',
            descripcion: 'Hamburguesa sencilla + papas + gaseosa')),
        'hamburguesas',
      );
      // Un plato cualquiera NO se clasifica por su descripción: el «pan» de
      // los ingredientes no convierte una hamburguesa de la casa en panadería.
      expect(
        clave(plato('La Bestia', seccion: 'Especiales',
            descripcion: 'Carne, queso, pan brioche')),
        isNull,
      );
    });

    test('sin tildes, sin mayúsculas y con plural', () {
      expect(clave(plato('SALCHIPAPÁS ESPECIALES')), 'salchipapas');
      expect(clave(plato('Tacos al pastor')), 'mexicana');
      expect(clave(plato('Sándwich cubano')), 'sandwiches');
      expect(clave(plato('Perros calientes')), 'perros');
    });

    test('palabra entera: «pan» no es «panela» ni «pancho»', () {
      expect(clave(plato('Aguapanela')), isNull);
      expect(clave(plato('Panela con queso')), isNull);
      expect(clave(plato('Pan de bono')), 'panaderia');
    });

    test('un nombre de fantasía se clasifica por su SECCIÓN', () {
      expect(clave(plato('La Bestia', seccion: 'HAMBURGUESAS')),
          'hamburguesas');
      // El nombre manda sobre la sección cuando dice algo.
      expect(clave(plato('Perro sencillo', seccion: 'Comidas rápidas')),
          'perros');
    });

    test('lo que se ofrece al pagar no clasifica al local', () {
      expect(clave(plato('Malteada de fresa', alPagar: true)), isNull);
    });

    test('un plato que no es de ningún antojo no se inventa uno', () {
      expect(clave(plato('Gaseosa 400 ml', seccion: 'Bebidas')), isNull);
    });
  });

  group('qué antojos se enseñan', () {
    test('solo con al menos DOS locales', () {
      final r = antojosPresentes([
        local('Betos', [plato('Hamburguesa sencilla'), plato('Sushi roll')]),
        local('Piero', [plato('Hamburguesa doble')]),
      ]);
      expect(r.map((a) => a.clave), ['hamburguesas']);
      expect(kMinLocalesPorAntojo, 2);
    });

    test('un local con diez hamburguesas cuenta como UNO', () {
      final r = antojosPresentes([
        local('Betos', [
          for (var i = 0; i < 10; i++) plato('Hamburguesa $i'),
        ]),
      ]);
      expect(r, isEmpty);
    });

    test('del más ofrecido al menos, y en empate el orden del catálogo', () {
      final r = antojosPresentes([
        local('A', [plato('Pizza'), plato('Perro'), plato('Hamburguesa')]),
        local('B', [plato('Pizza'), plato('Perro'), plato('Hamburguesa')]),
        local('C', [plato('Pizza')]),
      ]);
      expect(r.map((a) => a.clave), ['pizza', 'hamburguesas', 'perros']);
    });
  });

  group('buscar por plato', () {
    final betos = local('Betos', [
      plato('La Bestia', seccion: 'Hamburguesas'),
      plato('Arepa rellena', descripcion: 'Carne desmechada, queso'),
      plato('Coca-Cola', alPagar: true),
    ]);

    test('encuentra el local aunque su nombre no lo diga', () {
      final c = buscarEnComercio(betos, 'hamburguesa');
      expect(c.porNombre, isFalse);
      expect(c.platos.map((p) => p.name), ['La Bestia']);
    });

    test('lee los ingredientes y no le importan las tildes', () {
      expect(
        buscarEnComercio(betos, 'desmechadá').platos.map((p) => p.name),
        ['Arepa rellena'],
      );
    });

    test('nombrar el antojo trae sus platos aunque se llamen distinto', () {
      expect(
        buscarEnComercio(betos, 'Hamburguesas').platos.map((p) => p.name),
        ['La Bestia'],
      );
    });

    test('el nombre del local cuenta aparte', () {
      expect(buscarEnComercio(betos, 'BETOS').porNombre, isTrue);
    });

    test('con una sola letra no se busca entre platos', () {
      expect(buscarEnComercio(betos, 'a').algo, isFalse);
    });

    test('lo que se ofrece al pagar no sale como resultado', () {
      expect(buscarEnComercio(betos, 'coca').platos, isEmpty);
    });

    test('perdona una errata en lo que se escribe', () {
      expect(buscarEnComercio(betos, 'amburguesa').platos.map((p) => p.name),
          ['La Bestia']);
      expect(buscarEnComercio(betos, 'rellana').platos.map((p) => p.name),
          ['Arepa rellena']);
    });

    test('pero no confunde palabras cortas que son otras', () {
      final panaderia = local('Pan', [plato('Bollo limpio')]);
      expect(buscarEnComercio(panaderia, 'pollo').platos, isEmpty);
    });

    test('«pan» ya no encuentra empanadas', () {
      final l = local('Mixto', [plato('Empanada de carne'), plato('Pan de bono')]);
      expect(buscarEnComercio(l, 'pan').platos.map((p) => p.name),
          ['Pan de bono']);
    });

    test('mientras se escribe, el principio de la palabra ya cuenta', () {
      expect(buscarEnComercio(betos, 'desmech').platos.map((p) => p.name),
          ['Arepa rellena']);
    });

    test('el pollo que ES el plato sale antes que el que va dentro', () {
      final asadero = local('Asadero', [
        plato('Empanada de pollo'),
        plato('Arroz con pollo'),
        plato('Pollo asado entero'),
      ]);
      expect(
        buscarEnComercio(asadero, 'pollo').platos.map((p) => p.name),
        ['Pollo asado entero', 'Empanada de pollo', 'Arroz con pollo'],
      );
    });
  });

  group('ordenar los resultados', () {
    MapEntry<BusinessEntity, List<ProductEntity>> fila(
      String n,
      double? precio, {
      bool abierto = true,
      double? nota,
    }) {
      final platos = precio == null ? <ProductEntity>[] : [plato('P', precio: precio)];
      return MapEntry(local(n, platos, abierto: abierto, nota: nota), platos);
    }

    List<String> nombres(List<MapEntry<BusinessEntity, List<ProductEntity>>> l) =>
        [for (final e in l) e.key.name];

    test('abiertos SIEMPRE primero, también por precio', () {
      final r = ordenarResultados(
        [fila('Cerrado barato', 5000, abierto: false), fila('Abierto', 9000)],
        OrdenResultados.masBarato,
      );
      expect(nombres(r), ['Abierto', 'Cerrado barato']);
    });

    test('más barato compara el plato más barato de cada local', () {
      final r = ordenarResultados(
        [fila('Caro', 20000), fila('Sin platos', null), fila('Barato', 8000)],
        OrdenResultados.masBarato,
      );
      // Sin platos que comparar va al final, no al principio.
      expect(nombres(r), ['Barato', 'Caro', 'Sin platos']);
    });

    test('mejor calificado deja al final al que nadie ha calificado', () {
      final r = ordenarResultados(
        [fila('Nuevo', 1, nota: null), fila('Bueno', 1, nota: 4.2),
         fila('Mejor', 1, nota: 4.8)],
        OrdenResultados.mejorCalificado,
      );
      expect(nombres(r), ['Mejor', 'Bueno', 'Nuevo']);
    });

    test('recomendados conserva el orden de llegada', () {
      final r = ordenarResultados(
        [fila('Uno', 9), fila('Dos', 1), fila('Tres', 5)],
        OrdenResultados.recomendados,
      );
      expect(nombres(r), ['Uno', 'Dos', 'Tres']);
    });
  });

  group('las ilustraciones', () {
    // `Image.asset` con una ruta mala no lanza: cae al hueco del errorBuilder
    // y la tarjeta se queda sin dibujo sin que nadie lo note.
    test('cada antojo tiene su render en las tres densidades', () {
      for (final a in kAntojos) {
        for (final d in ['', '2.0x/', '3.0x/']) {
          final ruta = 'assets/antojos/$d${a.clave}.png';
          expect(File(ruta).existsSync(), isTrue, reason: 'Falta $ruta');
        }
      }
    });

    test('la carpeta está declarada en el pubspec', () {
      final pubspec = File('pubspec.yaml').readAsStringSync();
      expect(pubspec, contains('- assets/antojos/'));
      expect(pubspec, contains('- assets/antojos/2.0x/'));
      expect(pubspec, contains('- assets/antojos/3.0x/'));
    });

    test('no sobra ningún render sin antojo', () {
      final claves = {for (final a in kAntojos) '${a.clave}.png'};
      final archivos = Directory('assets/antojos')
          .listSync()
          .whereType<File>()
          .map((f) => f.uri.pathSegments.last);
      for (final f in archivos) {
        expect(claves, contains(f), reason: '$f no es de ningún antojo');
      }
    });

    test('las claves son únicas', () {
      final claves = kAntojos.map((a) => a.clave).toList();
      expect(claves.toSet().length, claves.length);
    });
  });

  testWidgets('ningún nombre de antojo se corta con «…»', (tester) async {
    // La captura del usuario: «Hamburgue…». La tarjeta mide 88 y el nombre
    // se encoge para caber en vez de cortarse.
    for (final a in kAntojos) {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                height: 108,
                child: TarjetaAntojo(antojo: a, elegido: true, onTap: () {}),
              ),
            ),
          ),
        ),
      );
      final texto = tester.widget<Text>(find.text(a.nombre));
      expect(texto.overflow, isNot(TextOverflow.ellipsis), reason: a.nombre);
      expect(
        find.ancestor(of: find.text(a.nombre), matching: find.byType(FittedBox)),
        findsOneWidget,
        reason: a.nombre,
      );
      expect(tester.takeException(), isNull, reason: a.nombre);
    }
  });
}
