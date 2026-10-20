// El carrusel «Para pedir ya» se mueve solo.
//
// Lo que se vigila son las cuatro formas en que un carrusel automático se
// vuelve molesto sin que nadie lo reporte como fallo: que no se mueva (y la
// función no exista), que se mueva con el dedo encima (te quita la tarjeta que
// estabas mirando), que se mueva a quien pidió reducir el movimiento en su
// teléfono, y que se quede trabado en la última tarjeta.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'carrusel_destacados.dart';

BusinessEntity _local(String id, {bool foto = true, bool abierto = true}) =>
    BusinessEntity(
      id: id,
      name: 'Local $id',
      category: BusinessCategory.restaurant,
      rating: null,
      etaMinutes: 25,
      deliveryFee: 3000,
      address: 'Calle 5 # 3-40',
      products: const [],
      isOpen: abierto,
      imageUrl: foto ? '/uploads/$id.jpg' : null,
    );

const _paso = CarruselDestacados.paso;

Future<void> _montar(
  WidgetTester tester,
  List<BusinessEntity> comercios, {
  bool sinMovimiento = false,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: sinMovimiento),
          child: Scaffold(
            body: CarruselDestacados(comercios: comercios, onAbrir: (_) {}),
          ),
        ),
      ),
    ),
  );
}

double _desplazamiento(WidgetTester tester) =>
    tester.state<ScrollableState>(find.byType(Scrollable).first).position.pixels;

/// Un ciclo del reloj más lo que dura la animación del paso.
Future<void> _unCiclo(WidgetTester tester) async {
  await tester.pump(CarruselDestacados.intervalo);
  await tester.pump(const Duration(milliseconds: 1000));
}

void main() {
  group('a dónde avanza', () {
    test('si todo cabe no hay paso', () {
      expect(
        CarruselDestacados.siguienteDesplazamiento(actual: 0, maximo: 0),
        isNull,
      );
    });

    test('avanza una tarjeta entera', () {
      expect(
        CarruselDestacados.siguienteDesplazamiento(actual: 0, maximo: 2000),
        _paso,
      );
    });

    test('dejado a media tarjeta, el paso siguiente lo vuelve a alinear', () {
      // 1,4 tarjetas → la más a la vista es la 1 → va a la 2, no a 2,4.
      expect(
        CarruselDestacados.siguienteDesplazamiento(
          actual: _paso * 1.4,
          maximo: 2000,
        ),
        _paso * 2,
      );
    });

    test('no se pasa del final', () {
      expect(
        CarruselDestacados.siguienteDesplazamiento(
          actual: _paso * 3,
          maximo: _paso * 3.5,
        ),
        _paso * 3.5,
      );
    });

    test('en el final vuelve al principio en vez de quedarse trabado', () {
      expect(
        CarruselDestacados.siguienteDesplazamiento(actual: 900, maximo: 900),
        0,
      );
    });
  });

  group('el indicador', () {
    test('marca la tarjeta más a la vista', () {
      expect(
        CarruselDestacados.indiceVisible(actual: _paso * 2.2, maximo: 2000, total: 8),
        2,
      );
    });

    test('estar al final cuenta como estar en la última', () {
      // La última nunca llega a alinearse al borde: sin esto, el punto de la
      // última tarjeta no se encendería jamás.
      expect(
        CarruselDestacados.indiceVisible(actual: 900, maximo: 900, total: 5),
        4,
      );
    });
  });

  group('si se mueve o no', () {
    test('una sola tarjeta no se mueve', () {
      expect(CarruselDestacados.desborda(total: 1, anchoVisible: 100), isFalse);
    });

    test('tarjetas que caben en el ancho no se mueven', () {
      expect(CarruselDestacados.desborda(total: 2, anchoVisible: 1200), isFalse);
    });

    test('las que no caben, sí', () {
      expect(CarruselDestacados.desborda(total: 3, anchoVisible: 390), isTrue);
    });
  });

  group('en pantalla', () {
    final ocho = [for (var i = 0; i < 8; i++) _local('$i')];

    testWidgets('avanza solo, una tarjeta por ciclo', (tester) async {
      await _montar(tester, ocho);
      expect(_desplazamiento(tester), 0);
      await _unCiclo(tester);
      expect(_desplazamiento(tester), closeTo(_paso, 0.5));
      await _unCiclo(tester);
      expect(_desplazamiento(tester), closeTo(_paso * 2, 0.5));
    });

    testWidgets('con el dedo encima no se mueve, y espera tras soltarlo',
        (tester) async {
      await _montar(tester, ocho);
      final dedo = await tester.startGesture(
        tester.getCenter(find.byType(ListView)),
      );
      await _unCiclo(tester);
      await _unCiclo(tester);
      expect(_desplazamiento(tester), 0);

      await dedo.up();
      // Un ciclo después de soltar todavía está quieto: la pausa es más larga.
      await _unCiclo(tester);
      expect(_desplazamiento(tester), 0);

      // Tras la pausa vuelve a moverse.
      await tester.pump(CarruselDestacados.pausaTrasTocar);
      await _unCiclo(tester);
      expect(_desplazamiento(tester), greaterThan(0));
    });

    testWidgets('quien pidió reducir el movimiento no lo ve moverse',
        (tester) async {
      await _montar(tester, ocho, sinMovimiento: true);
      await _unCiclo(tester);
      await _unCiclo(tester);
      expect(_desplazamiento(tester), 0);
    });

    testWidgets('llega al final y vuelve a empezar', (tester) async {
      await _montar(tester, ocho);
      for (var i = 0; i < 12; i++) {
        await _unCiclo(tester);
      }
      final posicion =
          tester.state<ScrollableState>(find.byType(Scrollable).first).position;
      // Con ocho tarjetas y doce ciclos, tuvo que dar la vuelta al menos una
      // vez: si se trabara en el final, estaría clavado en el máximo.
      expect(posicion.pixels, lessThan(posicion.maxScrollExtent));
    });

    testWidgets('los puntos dicen en cuál va', (tester) async {
      await _montar(tester, ocho);
      double ancho(int i) =>
          tester.getSize(find.byKey(ValueKey('punto-$i'))).width;
      expect(ancho(0), greaterThan(ancho(1)));
      await _unCiclo(tester);
      expect(ancho(1), greaterThan(ancho(0)));
    });

    testWidgets('sin fotos la sección no se dibuja', (tester) async {
      await _montar(tester, [_local('a', foto: false), _local('b', foto: false)]);
      expect(find.text('Para pedir ya'), findsNothing);
    });

    testWidgets('un solo local: ni se mueve ni lleva puntos', (tester) async {
      await _montar(tester, [_local('a')]);
      expect(find.byKey(const ValueKey('punto-0')), findsNothing);
      await _unCiclo(tester);
      expect(_desplazamiento(tester), 0);
    });
  });
}
