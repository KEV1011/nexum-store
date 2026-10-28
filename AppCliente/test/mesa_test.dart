import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/mesa/domain/carrito_mesa.dart';
import 'package:nexum_client/features/mesa/domain/enlace_mesa.dart';
import 'package:nexum_client/features/mesa/domain/pedido_mesa.dart';

void main() {
  group('el QR de la mesa', () {
    test('lee código, mesa y para llevar del enlace completo', () {
      final e = leerEnlaceMesa('https://nexum-store.vercel.app/carta/AB12cd?mesa=4')!;
      expect(e.codigo, 'AB12cd');
      expect(e.mesa, '4');
      expect(e.paraLlevar, isFalse);
      expect(e.ruta, '/carta/AB12cd?mesa=4');

      final l = leerEnlaceMesa('https://nexum-store.onrender.com/carta/XYZ9?llevar=1')!;
      expect(l.paraLlevar, isTrue);
      expect(l.mesa, isNull);
      expect(l.ruta, '/carta/XYZ9?llevar=1');
    });

    test('acepta la ruta sola, que es como la recibe la app del enlace', () {
      expect(leerEnlaceMesa('/carta/ABCD?mesa=Terraza 2')!.mesa, 'Terraza 2');
    });

    test('NO abre un QR de otro dominio ni sin https', () {
      expect(leerEnlaceMesa('https://zipa-falso.com/carta/ABCD?mesa=1'), isNull);
      expect(leerEnlaceMesa('http://nexum-store.vercel.app/carta/ABCD'), isNull);
      expect(leerEnlaceMesa('https://nexum-store.vercel.app.evil.co/carta/ABCD'), isNull);
    });

    test('NO abre lo que no es la carta pública', () {
      // El enlace del DUEÑO nunca se trata como carta.
      expect(leerEnlaceMesa('https://nexum-store.vercel.app/negocio/tok123'), isNull);
      expect(leerEnlaceMesa('https://nexum-store.vercel.app/carta/A'), isNull);
      expect(leerEnlaceMesa('https://nexum-store.vercel.app/carta/AB-CD'), isNull);
      expect(leerEnlaceMesa('texto cualquiera'), isNull);
      expect(leerEnlaceMesa(''), isNull);
    });

    test('una mesa absurda se ignora y se elige en la app', () {
      final larga = 'x' * 41;
      final e = leerEnlaceMesa('/carta/ABCD?mesa=$larga')!;
      expect(e.mesa, isNull);
    });

    test('los dominios del escáner son los del App Link del manifiesto', () {
      // Si no coinciden, o el escáner abre un QR que el teléfono no manda a la
      // app, o al revés.
      final manifiesto =
          File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
      final hosts = RegExp(r'android:host="([^"]+)"')
          .allMatches(manifiesto)
          .map((m) => m.group(1)!)
          .toSet();
      expect(hosts, kDominiosCarta);
      expect(manifiesto, contains('android:pathPrefix="/carta/"'));
      expect(manifiesto, contains('android.permission.CAMERA'));
    });
  });

  group('el carrito de la mesa', () {
    LineaMesa linea(String id, {int n = 1, List<String> op = const [], String? nota}) =>
        LineaMesa(
          productId: id,
          nombre: id,
          precioUnitario: 10000,
          cantidad: n,
          opcionIds: op,
          nota: nota,
        );

    test('el mismo plato con las mismas opciones suma', () {
      var l = agregarLinea(const [], linea('p1', op: ['a', 'b']));
      l = agregarLinea(l, linea('p1', n: 2, op: ['b', 'a']));
      expect(l, hasLength(1));
      expect(l.single.cantidad, 3);
    });

    test('otra opción o otra nota es otra línea', () {
      var l = agregarLinea(const [], linea('p1', op: ['a']));
      l = agregarLinea(l, linea('p1', op: ['b']));
      l = agregarLinea(l, linea('p1', op: ['a'], nota: 'sin cebolla'));
      expect(l, hasLength(3));
      expect(cantidadDe(l, 'p1'), 3);
    });

    test('no pasa del tope por línea', () {
      final l = agregarLinea([linea('p1', n: 29)], linea('p1', n: 5));
      expect(l.single.cantidad, kMaxPorLinea);
    });

    test('quitar baja una unidad y borra la línea en cero', () {
      var l = [linea('p1', n: 2)];
      l = quitarUno(l, 'p1');
      expect(l.single.cantidad, 1);
      l = quitarUno(l, 'p1');
      expect(l, isEmpty);
      expect(quitarUno(l, 'nada'), isEmpty);
    });

    test('lo que viaja al servidor no lleva precio', () {
      final j = linea('p1', n: 2, op: ['a'], nota: '  bien cocida ').toJson();
      expect(j, {
        'productId': 'p1',
        'quantity': 2,
        'optionIds': ['a'],
        'notes': 'bien cocida',
      });
      expect(totalEstimado([linea('p1', n: 2), linea('p2')]), 30000);
    });
  });

  group('el pedido de la mesa', () {
    test('lee el DTO del servidor', () {
      final p = PedidoMesa.fromJson({
        'id': 'o1',
        'orderRef': '4821',
        'tableLabel': '4',
        'businessName': 'BETOS',
        'status': 'preparing',
        'total': 32000,
        'prepMinutes': 15,
        'codigo': 'ABCD',
        'items': [
          {'productName': 'Picada', 'quantity': 2},
        ],
        'timeline': [
          {'titulo': 'Recibido', 'estado': 'cumplido', 'at': '2026-10-27T20:00:00Z'},
          {'titulo': 'En la cocina', 'estado': 'actual', 'at': null},
        ],
      });
      expect(p.estadoTexto, 'Preparándose');
      expect(p.paraLlevar, isFalse);
      expect(p.platos, ['2 × Picada']);
      expect(p.pasos.first.hecho, isTrue);
      expect(p.pasos.last.actual, isTrue);
      expect(p.pasos.last.at, isNull);
      expect(p.codigo, 'ABCD');
    });

    test('sin mesa es para llevar, y servido se dice «Entregado»', () {
      final p = PedidoMesa.fromJson({
        'id': 'o2',
        'tableLabel': '',
        'status': 'delivered',
        'total': 1000,
      });
      expect(p.paraLlevar, isTrue);
      expect(p.terminado, isTrue);
      expect(p.estadoTexto, 'Entregado');
    });
  });
}
