import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nexum_driver/shared/services/cola_pruebas.dart';

void main() {
  late DateTime ahora;
  late List<String> enviados;
  late List<int?> respuestas;
  late ColaPruebas cola;
  late AlmacenEnMemoria almacen;

  final foto = Uint8List.fromList([1, 2, 3]);

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    ahora = DateTime(2026, 10, 25, 12);
    enviados = [];
    respuestas = [];
    almacen = AlmacenEnMemoria();
    cola = ColaPruebas(
      almacen: almacen,
      reloj: () => ahora,
      enviar: (p, _) async {
        enviados.add('${p.kind}/${p.id}/${p.phase}');
        return respuestas.isEmpty ? 201 : respuestas.removeAt(0);
      },
    );
  });

  tearDown(() => cola.detener());

  Future<bool> subir({String phase = 'delivery', String id = 'o1'}) =>
      cola.subirOEncolar(
        kind: 'order',
        id: id,
        phase: phase,
        subtype: 'jpeg',
        bytes: foto,
      );

  test('con señal sube a la primera y no deja nada en cola', () async {
    expect(await subir(), isTrue);
    expect(await cola.pendientes(), isEmpty);
  });

  test('sin señal queda en cola y sube cuando le toca', () async {
    respuestas = [null];
    expect(await subir(), isFalse);
    expect(await cola.pendientes(), hasLength(1));

    // Antes de la espera no se reintenta (sin gastar batería en bucle).
    await cola.reintentar();
    expect(enviados, hasLength(1));

    ahora = ahora.add(const Duration(seconds: 31));
    await cola.reintentar();
    expect(enviados, hasLength(2));
    expect(await cola.pendientes(), isEmpty);
  });

  test('un 5xx, un 401 o un 429 se reintentan', () async {
    respuestas = [503];
    await subir();
    for (final codigo in [401, 429, 500]) {
      respuestas = [codigo];
      ahora = ahora.add(const Duration(hours: 1));
      await cola.reintentar();
      expect(await cola.pendientes(), hasLength(1), reason: '$codigo');
    }
  });

  test('lo que el servidor rechaza con razón se descarta (no reintenta nunca)',
      () async {
    respuestas = [null];
    await subir();
    respuestas = [404];
    ahora = ahora.add(const Duration(minutes: 1));
    await cola.reintentar();
    expect(await cola.pendientes(), isEmpty);

    respuestas = [400];
    expect(await subir(id: 'o2'), isFalse);
    expect(await cola.pendientes(), isEmpty);
  });

  test('una foto nueva de la MISMA fase reemplaza a la vieja', () async {
    respuestas = [null, null];
    await subir();
    await subir();
    final p = await cola.pendientes();
    expect(p, hasLength(1));
    expect(await almacen.leer(p.single.uid), isNotNull);
    // La de recogida es otra fase: convive.
    respuestas = [null];
    await subir(phase: 'pickup');
    expect(await cola.pendientes(), hasLength(2));
  });

  test('pasada una semana se descarta', () async {
    respuestas = [null];
    await subir();
    ahora = ahora.add(const Duration(days: 8));
    await cola.reintentar();
    expect(await cola.pendientes(), isEmpty);
    expect(enviados, hasLength(1));
  });

  test('un registro ilegible no se lleva a los demás', () async {
    respuestas = [null];
    await subir();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(clavePruebasPendientes, [
      'no es json',
      ...prefs.getStringList(clavePruebasPendientes)!,
    ]);
    expect(await cola.pendientes(), hasLength(1));
  });

  test('la espera crece y tiene tope', () {
    expect(esperaParaIntento(1), const Duration(seconds: 30));
    expect(esperaParaIntento(2), const Duration(minutes: 1));
    expect(esperaParaIntento(20), const Duration(minutes: 15));
  });

  test('qué códigos son definitivos', () {
    expect(esFalloDefinitivo(null), isFalse);
    expect(esFalloDefinitivo(500), isFalse);
    expect(esFalloDefinitivo(401), isFalse);
    expect(esFalloDefinitivo(404), isTrue);
    expect(esFalloDefinitivo(403), isTrue);
  });
}
