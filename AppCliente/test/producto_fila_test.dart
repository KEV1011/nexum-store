/// La fila de un plato en la carta del comercio.
///
/// Dos defectos que reportaron los probadores, y los dos se ven en cuanto se
/// abre un local de verdad:
///
/// 1. **No había dónde tocar para VER el plato.** El único control era
///    «Agregar», que suena a «va al carrito sin preguntar», así que la hoja de
///    detalle —con la foto, los ingredientes y los tamaños— quedaba escondida
///    detrás de una acción de compra. La miniatura abría la galería solo si
///    había más de una foto: con una sola, tampoco.
/// 2. **El precio de la lista mentía** cuando el plato se vende por tamaños.
///    La misma picada vale 39.000 pequeña y 80.000 grande y no se puede pedir
///    sin elegir: enseñar «$39.000» a secas es prometer un precio que la caja
///    no respeta.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/businesses/domain/entities/business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/product_tile.dart';

ProductOptionEntity opcion(String nombre, double delta) =>
    ProductOptionEntity(id: nombre, name: nombre, priceDelta: delta);

ProductEntity plato({
  String nombre = 'Choripapa',
  String descripcion = '',
  List<OptionGroupEntity> grupos = const [],
}) =>
    ProductEntity(
      id: 'p1',
      name: nombre,
      description: descripcion,
      price: 39000,
      optionGroups: grupos,
    );

/// El caso real: la picada por tamaños, que no se puede pedir sin elegir uno.
final porTamano = OptionGroupEntity(
  id: 'g1',
  name: 'Tamaño',
  required: true,
  options: [opcion('Pequeña', 0), opcion('Mediana', 7000), opcion('Grande', 41000)],
);

/// Adiciones: el precio de la lista SÍ se puede pagar tal cual.
final adiciones = OptionGroupEntity(
  id: 'g2',
  name: 'Adiciones',
  maxSelect: 3,
  options: [opcion('Queso', 3000)],
);

void main() {
  group('cuándo el precio de la lista NO es el que se paga', () {
    test('una variante obligatoria que cuesta más: «Desde»', () {
      expect(plato(grupos: [porTamano]).precioDesde, isTrue);
    });

    test('un grupo OPCIONAL no lo cambia', () {
      // Quien no añade nada paga el precio de la lista: poner «Desde» ahí
      // haría dudar de un precio que es exacto.
      expect(plato(grupos: [adiciones]).precioDesde, isFalse);
    });

    test('un grupo obligatorio sin recargo tampoco', () {
      // «Elige la salsa» es obligatorio y todas cuestan igual.
      final salsa = OptionGroupEntity(
        id: 'g3',
        name: 'Salsa',
        required: true,
        options: [opcion('Rosada', 0), opcion('Piña', 0)],
      );
      expect(plato(grupos: [salsa]).precioDesde, isFalse);
    });

    test('un plato sin opciones, nunca', () {
      expect(plato().precioDesde, isFalse);
    });

    test('basta UN grupo obligatorio con recargo entre varios', () {
      expect(plato(grupos: [adiciones, porTamano]).precioDesde, isTrue);
    });
  });

  group('la fila se puede abrir', () {
    Future<int> toquesAlAbrir(WidgetTester tester, ProductEntity p) async {
      var veces = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProductTile(
              product: p,
              quantity: 0,
              onAdd: () => veces++,
              onRemove: () {},
            ),
          ),
        ),
      );
      await tester.tap(find.text(p.name));
      await tester.pump();
      return veces;
    }

    testWidgets('tocando el NOMBRE del plato, no solo el botón',
        (tester) async {
      // La comprobación que justifica el fichero: antes esto no hacía nada.
      expect(await toquesAlAbrir(tester, plato()), 1);
    });

    testWidgets('también en un plato sin foto ni opciones', (tester) async {
      // Es el caso más común hoy: el local acaba de cargar su carta y aún no
      // subió fotos. Si solo se pudiera abrir lo que tiene galería, casi nada
      // sería tocable.
      expect(await toquesAlAbrir(tester, plato(nombre: 'Picada BETO')), 1);
    });
  });

  group('un nombre larguísimo no rompe la fila', () {
    testWidgets('se corta a dos líneas', (tester) async {
      // Las cartas leídas de una foto traen los ingredientes dentro del
      // nombre. Sin tope ocupaban cinco renglones, empujaban el precio fuera
      // de la vista y todas las filas se veían iguales.
      const largo = 'Choricarne (Papa, carne a la plancha, chorizo, queso, '
          'lechuga, maíz y salsas)';
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProductTile(
              product: plato(nombre: largo),
              quantity: 0,
              onAdd: () {},
              onRemove: () {},
            ),
          ),
        ),
      );
      expect(tester.widget<Text>(find.text(largo)).maxLines, 2);
      expect(tester.takeException(), isNull, reason: 'sin desbordes');
    });

    testWidgets('sin descripción no se deja el hueco', (tester) async {
      // Un renglón en blanco bajo el nombre se lee como algo que no cargó.
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProductTile(
              product: plato(),
              quantity: 0,
              onAdd: () {},
              onRemove: () {},
            ),
          ),
        ),
      );
      expect(find.text(''), findsNothing);
    });
  });
}
