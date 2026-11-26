// El pin del mapa: que la PUNTA caiga en la coordenada.
//
// Los marcadores usan `Alignment.topCenter`, que deja la coordenada en el
// centro del borde de ABAJO del cuadro del pin. Con la gota del glifo
// `Icons.location_on` la punta quedaba a 22/24 del alto: el local, la
// bandera del destino y las paradas flotaban ~8 px sobre su punto, y en el
// selector de ubicación se guardaba un punto que el pin no señalaba. Esto no
// avisa: el pin se ve bien, solo está en otro sitio.

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexum_client/shared/widgets/map_pin.dart';

void main() {
  test('la punta de la gota está en el centro del borde de abajo', () {
    final caja = MapPin.gota().getBounds();
    expect(caja.bottom, closeTo(MapPin.markerHeight, 0.01));
    expect(caja.center.dx, closeTo(MapPin.markerWidth / 2, 0.01));
    expect(
      MapPin.punta,
      const Offset(MapPin.markerWidth / 2, MapPin.markerHeight),
    );
    // Y la gota no se sale del cuadro por los lados ni por arriba.
    expect(caja.left, greaterThanOrEqualTo(0));
    expect(caja.right, lessThanOrEqualTo(MapPin.markerWidth));
    expect(caja.top, greaterThanOrEqualTo(0));
  });

  testWidgets('pintado, lo más bajo del color del pin llega al borde de abajo',
      (tester) async {
    final clave = GlobalKey();
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: Center(
          child: RepaintBoundary(
            key: clave,
            child: const MapPin(color: Color(0xFFFF0000), numero: '1'),
          ),
        ),
      ),
    );

    final limite =
        clave.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    late final ByteData datos;
    late final int ancho;
    late final int alto;
    await tester.runAsync(() async {
      final imagen = await limite.toImage();
      ancho = imagen.width;
      alto = imagen.height;
      datos = (await imagen.toByteData())!;
    });

    // La fila más baja con rojo del pin (no la sombra, que es negra).
    var filaMasBaja = -1;
    final columnas = <int>[];
    for (var y = alto - 1; y >= 0 && filaMasBaja < 0; y--) {
      for (var x = 0; x < ancho; x++) {
        final i = (y * ancho + x) * 4;
        final r = datos.getUint8(i);
        final g = datos.getUint8(i + 1);
        if (r > 120 && g < 80) {
          filaMasBaja = y;
          columnas.add(x);
        }
      }
    }
    expect(alto, MapPin.markerHeight.round());
    expect(
      filaMasBaja,
      greaterThanOrEqualTo(alto - 3),
      reason: 'la punta debe tocar el borde de abajo, no flotar encima',
    );
    final centro = columnas.reduce((a, b) => a + b) / columnas.length;
    expect(centro, closeTo(MapPin.markerWidth / 2, 1.5));
  });
}
