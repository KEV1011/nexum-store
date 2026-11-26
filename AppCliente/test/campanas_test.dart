import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/core/utils/lista_json.dart';
import 'package:nexum_client/features/campanas/data/campanas_api.dart';
import 'package:nexum_client/features/campanas/presentation/'
    'banner_campana.dart';

Campana _burger({String? color = '#E53935', String? icon = 'hamburguesas'}) =>
    Campana.fromJson({
      'id': 'c1',
      'title': 'Burger Show',
      'subtitle': 'Hamburguesas especiales',
      'desde': '2026-11-27',
      'hasta': '2026-12-03',
      'icon': icon,
      'color': color,
      'productos': 12,
    });

void main() {
  test('las fechas se dicen como las dice la gente', () {
    expect(fechasDeCampana(_burger()), 'Del 27 nov al 3 dic');
    final unDia = Campana.fromJson({
      'id': 'x', 'title': 'Día del perro', 'desde': '2026-12-10', 'hasta': '2026-12-10',
    });
    expect(fechasDeCampana(unDia), 'Solo el 10 dic');
  });

  test('un color mal escrito cae al de por defecto en vez de reventar', () {
    expect(colorDeCampana('#E53935'), const Color(0xFFE53935));
    expect(colorDeCampana('rojo'), kColorCampanaPorDefecto);
    expect(colorDeCampana(null), kColorCampanaPorDefecto);
  });

  test('el dibujo de la campaña existe en disco; uno desconocido no se pinta', () {
    final ruta = ilustracionDeCampana('hamburguesas');
    expect(ruta, isNotNull);
    expect(File(ruta!).existsSync(), isTrue);
    expect(ilustracionDeCampana('no-existe'), isNull);
    expect(ilustracionDeCampana(null), isNull);
  });

  test('una campaña ilegible no tumba la lista de las demás', () {
    final lista = listaDeJson(
      [
        {'id': 'c1', 'title': 'Burger Show', 'desde': '2026-11-27', 'hasta': '2026-12-03'},
        {'title': 'sin id'},
      ],
      Campana.fromJson,
    );
    expect(lista.map((c) => c.id), ['c1']);
  });

  test('el producto de la campaña se lee con el lector de la carta', () {
    final item = ItemCampana.fromJson({
      'product': {
        'id': 'p1', 'name': 'La Monstruo', 'price': 22000, 'compareAtPrice': 28000,
        'descuentoPct': 21, 'category': 'Hamburguesas',
      },
      'business': {'id': 'b1', 'name': 'Beto Burger', 'isOpen': true},
    });
    expect(item.product.price, 22000);
    expect(item.product.compareAtPrice, 28000);
    expect(item.businessName, 'Beto Burger');
    expect(item.abierto, isTrue);
  });

  testWidgets('el anuncio dice qué es, cuándo y cuántos productos hay', (t) async {
    var tocado = false;
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BannerCampana(campana: _burger(), onTap: () => tocado = true),
        ),
      ),
    );
    expect(find.text('Burger Show'), findsOneWidget);
    expect(find.text('Del 27 nov al 3 dic'), findsOneWidget);
    expect(find.textContaining('12 productos'), findsOneWidget);
    await t.tap(find.text('Burger Show'));
    expect(tocado, isTrue);
  });
}
