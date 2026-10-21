// El dibujo de un plato sin foto: que cada plato lleve el SUYO y no el de su
// antojo grueso (la mojarra con un camarón, la picada con un filete crudo).
// Ver `lib/features/businesses/domain/iconos_plato.dart`.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/domain/iconos_plato.dart';

ProductEntity plato(String nombre, {String seccion = 'General'}) =>
    ProductEntity(
      id: nombre,
      name: nombre,
      description: '',
      price: 10000,
      category: seccion,
    );

String? dibujo(String nombre, {String seccion = 'General'}) {
  final a = iconoDePlato(plato(nombre, seccion: seccion));
  if (a == null) return null;
  return a.split('/').last.replaceAll('.png', '');
}

void main() {
  group('cada plato con lo suyo', () {
    // Una tabla con cartas reales de aquí. Si alguna cambia, que sea a
    // propósito: es lo que ve el cliente en la fila del plato.
    const casos = {
      'Hamburguesa de pollo': 'hamburguesas',
      'Arroz con camarones': 'arroz',
      'Arroz chino especial': 'arroz_chino',
      'Mojarra frita': 'pescado',
      'Filete de pescado': 'pescado',
      'Filete de pollo': 'pollo',
      'Camarones al ajillo': 'mariscos',
      'Picada para dos': 'costilla',
      'Picada de frutas': 'frutas',
      'Ensalada de frutas': 'frutas',
      'Ensalada césar': 'ensaladas',
      'Churrasco 300 g': 'asados',
      'Chicharrón': 'chicharron',
      'Sancocho de gallina': 'sopa',
      'Bandeja paisa': 'arroz',
      'Jugo de mango': 'jugo',
      'Limonada de coco': 'jugo',
      'Malteada de fresa': 'gaseosa',
      'Fresas con crema': 'fresas',
      'Torta de chocolate': 'postres',
      'Chocolate caliente': 'cafe',
      'Brownie con helado': 'chocolate',
      'Copa de vino': 'vino',
      'Cerveza Club Colombia': 'cerveza',
      'Papas a la francesa': 'salchipapas',
      'Papa criolla': 'papa',
      'Arepa de choclo': 'arepas',
      'Tamal tolimense': 'tamal',
      'Buñuelos': 'bunuelo',
      'Perro caliente sencillo': 'perros',
      'Café con leche': 'cafe',
      'Huevos pericos': 'desayunos',
      'Pandebono': 'panaderia',
      'Pan de bono': 'panaderia',
    };
    casos.forEach((nombre, esperado) {
      test(nombre, () => expect(dibujo(nombre), esperado));
    });
  });

  test('el nombre manda; la sección solo si el nombre no dice nada', () {
    expect(dibujo('La Bestia', seccion: 'HAMBURGUESAS'), 'hamburguesas');
    expect(dibujo('Gaseosa', seccion: 'HAMBURGUESAS'), 'gaseosa');
  });

  test('un ingrediente en el nombre no le gana al plato de la sección', () {
    expect(dibujo('Cuatro quesos', seccion: 'PIZZAS'), 'pizza');
    expect(dibujo('Pollo con champiñones', seccion: 'PIZZAS'), 'pizza');
    expect(dibujo('Doble carne', seccion: 'HAMBURGUESAS'), 'hamburguesas');
    // Sin sección que diga un plato, el ingrediente es lo mejor que hay.
    expect(dibujo('Pollo asado', seccion: 'ASADOS'), 'pollo');
    expect(dibujo('Cuatro quesos'), 'queso');
  });

  test('una sección de bebidas da el vaso', () {
    expect(dibujo('Postobón manzana', seccion: 'BEBIDAS'), 'gaseosa');
  });

  test('palabra entera: «pan» no casa «panela» ni «panzerotti»', () {
    expect(dibujo('Panzerotti'), isNull);
  });

  test('lo que no se reconoce no lleva dibujo inventado', () {
    expect(dibujo('Especial de la casa'), isNull);
    expect(dibujo('Combo 2'), isNull);
  });

  test('lo que se ofrece al pagar no lleva dibujo', () {
    const p = ProductEntity(
      id: 'x',
      name: 'Gaseosa 400 ml',
      description: '',
      price: 3500,
      suggestAsAddon: true,
    );
    expect(iconoDePlato(p), isNull);
  });

  group('los archivos', () {
    test('cada dibujo existe en las tres densidades', () {
      for (final i in kIconosPlato) {
        final partes = i.asset.split('/');
        final carpeta = partes.sublist(0, partes.length - 1).join('/');
        final archivo = partes.last;
        for (final d in ['', '2.0x/', '3.0x/']) {
          expect(
            File('$carpeta/$d$archivo').existsSync(),
            isTrue,
            reason: '$carpeta/$d$archivo',
          );
        }
      }
    });

    test('la carpeta está declarada en el pubspec', () {
      // Un asset sin declarar funciona en el repo y falla en el teléfono.
      final pubspec = File('pubspec.yaml').readAsStringSync();
      for (final d in ['', '2.0x/', '3.0x/']) {
        expect(pubspec, contains('- assets/platos/$d\n'));
      }
    });

    test('no sobra ningún archivo en assets/platos', () {
      final usados = kIconosPlato
          .map((i) => i.asset)
          .where((a) => a.startsWith('assets/platos/'))
          .map((a) => a.split('/').last)
          .toSet();
      final enDisco = Directory('assets/platos')
          .listSync()
          .whereType<File>()
          .map((f) => f.uri.pathSegments.last)
          .toSet();
      expect(enDisco, usados);
    });
  });
}
