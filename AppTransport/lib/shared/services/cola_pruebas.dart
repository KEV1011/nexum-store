/// Cola de pruebas de entrega que no se pudieron subir.
///
/// POR QUÉ EXISTE. La foto de recogida, la de entrega y la firma se subían una
/// sola vez, en segundo plano, y si fallaba (sin señal en un sótano, en una
/// carretera, el servidor despertando) el error se tragaba: la prueba quedaba
/// solo en el teléfono y el cliente y el negocio nunca la veían. Y justo la
/// entrega es el momento con peor señal.
///
/// LA REGLA. Lo que falla por la RED o por el SERVIDOR (sin respuesta, 5xx,
/// 408, 429, 401) se guarda y se reintenta con espera creciente; lo que el
/// servidor RECHAZA con razón (400, 403, 404…: el servicio no es tuyo, el
/// archivo no es una imagen) se descarta, porque reintentarlo para siempre no
/// lo va a arreglar y llenaría el teléfono.
///
/// Los BYTES se copian al guardar: la foto de image_picker vive en una carpeta
/// temporal que el sistema puede limpiar antes del reintento. En la web no hay
/// disco: la cola vive en memoria mientras la pestaña esté abierta.
///
/// Reintentar es seguro: el servidor guarda cada fase en su columna
/// (`pickupPhotoUrl`, `deliveryPhotoUrl`, firma), así que subir dos veces la
/// misma foto sobreescribe, no duplica.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io' as io;
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Clave de la cola. Es de la CUENTA (`datos_de_cuenta.dart`): al cerrar
/// sesión se borra, igual que el historial.
const clavePruebasPendientes = 'nexum_pruebas_pendientes_v1';

/// Una prueba esperando a subir.
class PruebaPendiente {
  const PruebaPendiente({
    required this.uid,
    required this.kind,
    required this.id,
    required this.phase,
    required this.subtype,
    required this.creadaEn,
    this.signedBy,
    this.intentos = 0,
    this.proximoIntento,
  });

  /// Nombre del archivo de bytes (único por prueba).
  final String uid;

  /// `'trip' | 'order' | 'errand'`.
  final String kind;
  final String id;

  /// `'pickup' | 'delivery' | 'signature'`.
  final String phase;

  /// `'jpeg' | 'png' | 'webp'`.
  final String subtype;
  final String? signedBy;
  final DateTime creadaEn;
  final int intentos;
  final DateTime? proximoIntento;

  PruebaPendiente conIntentoFallido(DateTime ahora) => PruebaPendiente(
        uid: uid,
        kind: kind,
        id: id,
        phase: phase,
        subtype: subtype,
        creadaEn: creadaEn,
        signedBy: signedBy,
        intentos: intentos + 1,
        proximoIntento: ahora.add(esperaParaIntento(intentos + 1)),
      );

  Map<String, dynamic> toJson() => {
        'uid': uid,
        'kind': kind,
        'id': id,
        'phase': phase,
        'subtype': subtype,
        if (signedBy != null) 'signedBy': signedBy,
        'creadaEn': creadaEn.toIso8601String(),
        'intentos': intentos,
        if (proximoIntento != null)
          'proximoIntento': proximoIntento!.toIso8601String(),
      };

  /// Null si el registro no se puede leer (lo escribió otra versión, se
  /// corrompió): se descarta ese y los demás siguen.
  static PruebaPendiente? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final uid = raw['uid'], kind = raw['kind'], id = raw['id'];
    final phase = raw['phase'], subtype = raw['subtype'];
    final creada = raw['creadaEn'];
    if (uid is! String ||
        kind is! String ||
        id is! String ||
        phase is! String ||
        subtype is! String ||
        creada is! String) {
      return null;
    }
    final creadaEn = DateTime.tryParse(creada);
    if (creadaEn == null) return null;
    final prox = raw['proximoIntento'];
    final signedBy = raw['signedBy'];
    final intentos = raw['intentos'];
    return PruebaPendiente(
      uid: uid,
      kind: kind,
      id: id,
      phase: phase,
      subtype: subtype,
      creadaEn: creadaEn,
      signedBy: signedBy is String ? signedBy : null,
      intentos: intentos is int ? intentos : 0,
      proximoIntento: prox is String ? DateTime.tryParse(prox) : null,
    );
  }
}

/// Si una respuesta del servidor significa «no lo intentes más».
///
/// `null` es que no hubo respuesta (sin red): se reintenta. 401 se reintenta
/// porque la sesión se renueva al volver a entrar (y si se cierra, la cola se
/// borra con los datos de la cuenta). 408 y 429 son «ahora no», no «nunca».
bool esFalloDefinitivo(int? status) {
  if (status == null) return false;
  if (status == 401 || status == 408 || status == 429) return false;
  return status >= 400 && status < 500;
}

/// Espera antes del intento número [n] (1 = el primer reintento): 30 s, 1 min,
/// 2 min… hasta 15 min. Sin tope, una prueba que lleva un día fallando se
/// intentaría cada medio minuto gastando batería y datos.
Duration esperaParaIntento(int n) {
  final segundos = 30 * math.pow(2, math.max(0, n - 1)).toInt();
  return Duration(seconds: math.min(segundos, 15 * 60));
}

/// Pasado este tiempo la prueba se descarta: el servicio ya está cerrado y
/// liquidado, y una foto de hace una semana no la va a mirar nadie.
const vidaMaximaPrueba = Duration(days: 7);

/// Dónde se guardan los bytes. Se inyecta para poder probar la cola sin disco.
abstract class AlmacenBytes {
  Future<void> guardar(String uid, Uint8List bytes);
  Future<Uint8List?> leer(String uid);
  Future<void> borrar(String uid);

  /// Borra los archivos que ya no están en la cola (quedan huérfanos al
  /// cerrar sesión, que borra la cola pero no la carpeta).
  Future<void> limpiarExcepto(Set<String> vivos);
}

class AlmacenEnMemoria implements AlmacenBytes {
  final Map<String, Uint8List> _datos = {};

  @override
  Future<void> guardar(String uid, Uint8List bytes) async =>
      _datos[uid] = bytes;

  @override
  Future<Uint8List?> leer(String uid) async => _datos[uid];

  @override
  Future<void> borrar(String uid) async => _datos.remove(uid);

  @override
  Future<void> limpiarExcepto(Set<String> vivos) async =>
      _datos.removeWhere((k, _) => !vivos.contains(k));
}

class _AlmacenEnDisco implements AlmacenBytes {
  Future<io.Directory> _carpeta() async {
    final base = await getApplicationDocumentsDirectory();
    final d = io.Directory('${base.path}/pruebas_pendientes');
    if (!d.existsSync()) await d.create(recursive: true);
    return d;
  }

  Future<io.File> _archivo(String uid) async =>
      io.File('${(await _carpeta()).path}/$uid');

  @override
  Future<void> guardar(String uid, Uint8List bytes) async =>
      (await _archivo(uid)).writeAsBytes(bytes, flush: true);

  @override
  Future<Uint8List?> leer(String uid) async {
    final f = await _archivo(uid);
    return f.existsSync() ? f.readAsBytes() : null;
  }

  @override
  Future<void> borrar(String uid) async {
    final f = await _archivo(uid);
    if (f.existsSync()) await f.delete();
  }

  @override
  Future<void> limpiarExcepto(Set<String> vivos) async {
    final d = await _carpeta();
    for (final e in d.listSync().whereType<io.File>()) {
      final nombre = e.uri.pathSegments.last;
      if (!vivos.contains(nombre)) await e.delete();
    }
  }
}

/// Envía una prueba. Devuelve el código HTTP, o null si no hubo respuesta.
typedef EnviarPrueba = Future<int?> Function(
  PruebaPendiente prueba,
  Uint8List bytes,
);

class ColaPruebas {
  ColaPruebas({
    required EnviarPrueba enviar,
    AlmacenBytes? almacen,
    DateTime Function()? reloj,
  })  : _enviar = enviar,
        _almacen = almacen ?? (kIsWeb ? AlmacenEnMemoria() : _AlmacenEnDisco()),
        _reloj = reloj ?? DateTime.now;

  final EnviarPrueba _enviar;
  final AlmacenBytes _almacen;
  final DateTime Function() _reloj;

  bool _enCurso = false;
  Timer? _timer;
  int _secuencia = 0;

  Future<List<PruebaPendiente>> pendientes() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getStringList(clavePruebasPendientes) ?? const <String>[];
    final out = <PruebaPendiente>[];
    for (final s in raw) {
      try {
        final pr = PruebaPendiente.fromJson(json.decode(s));
        if (pr != null) out.add(pr);
      } catch (_) {
        // Un registro ilegible no se lleva por delante a los demás.
      }
    }
    return out;
  }

  Future<void> _guardarLista(List<PruebaPendiente> lista) async {
    final p = await SharedPreferences.getInstance();
    if (lista.isEmpty) {
      await p.remove(clavePruebasPendientes);
    } else {
      await p.setStringList(
        clavePruebasPendientes,
        lista.map((e) => json.encode(e.toJson())).toList(),
      );
    }
  }

  /// Intenta subir YA; si falla por la red, la deja en la cola.
  ///
  /// Devuelve `true` si quedó subida.
  Future<bool> subirOEncolar({
    required String kind,
    required String id,
    required String phase,
    required String subtype,
    required Uint8List bytes,
    String? signedBy,
  }) async {
    final ahora = _reloj();
    final prueba = PruebaPendiente(
      uid: '${ahora.microsecondsSinceEpoch}-${_secuencia++}-$phase',
      kind: kind,
      id: id,
      phase: phase,
      subtype: subtype,
      signedBy: signedBy,
      creadaEn: ahora,
    );
    int? status;
    try {
      status = await _enviar(prueba, bytes);
    } catch (_) {
      status = null;
    }
    if (status != null && status >= 200 && status < 300) {
      // Hay red: buen momento para vaciar lo que estaba esperando.
      unawaited(reintentar());
      return true;
    }
    if (esFalloDefinitivo(status)) return false;

    // Una prueba más nueva de la MISMA fase del MISMO servicio reemplaza a la
    // vieja: subir las dos solo dejaría la última (el servidor sobreescribe).
    final lista = await pendientes();
    final repetidas = lista
        .where((e) => e.kind == kind && e.id == id && e.phase == phase)
        .toList();
    for (final r in repetidas) {
      await _almacen.borrar(r.uid);
    }
    lista.removeWhere((e) => repetidas.contains(e));
    await _almacen.guardar(prueba.uid, bytes);
    lista.add(prueba.conIntentoFallido(ahora));
    await _guardarLista(lista);
    _programar();
    return false;
  }

  /// Sube lo que ya toca. Seguro de llamar a menudo: si ya hay una pasada en
  /// curso, no arranca otra (dos pasadas a la vez subirían cada foto dos
  /// veces y pelearían por la lista).
  Future<void> reintentar() async {
    if (_enCurso) return;
    _enCurso = true;
    try {
      final ahora = _reloj();
      final lista = await pendientes();
      final quedan = <PruebaPendiente>[];
      for (final pr in lista) {
        if (ahora.difference(pr.creadaEn) > vidaMaximaPrueba) {
          await _almacen.borrar(pr.uid);
          continue;
        }
        final toca = pr.proximoIntento == null ||
            !ahora.isBefore(pr.proximoIntento!);
        if (!toca) {
          quedan.add(pr);
          continue;
        }
        final bytes = await _almacen.leer(pr.uid);
        if (bytes == null) continue; // el archivo ya no está: nada que subir
        int? status;
        try {
          status = await _enviar(pr, bytes);
        } catch (_) {
          status = null;
        }
        final ok = status != null && status >= 200 && status < 300;
        if (ok || esFalloDefinitivo(status)) {
          await _almacen.borrar(pr.uid);
        } else {
          quedan.add(pr.conIntentoFallido(ahora));
        }
      }
      // La lista se relee: durante la pasada pudo encolarse otra prueba.
      final actual = await pendientes();
      final vistos = lista.map((e) => e.uid).toSet();
      final nuevas = actual.where((e) => !vistos.contains(e.uid));
      await _guardarLista([...quedan, ...nuevas]);
    } finally {
      _enCurso = false;
    }
    _programar();
  }

  /// Arranque de la app: limpia archivos huérfanos y reintenta.
  Future<void> iniciar() async {
    try {
      final vivos = (await pendientes()).map((e) => e.uid).toSet();
      await _almacen.limpiarExcepto(vivos);
    } catch (_) {
      // Limpiar es higiene; si falla, la cola sigue funcionando.
    }
    await reintentar();
  }

  /// Revisa cada 30 s mientras haya algo pendiente; sin nada, se apaga.
  void _programar() {
    _timer ??= Timer.periodic(const Duration(seconds: 30), (_) async {
      final hay = (await pendientes()).isNotEmpty;
      if (!hay) {
        _timer?.cancel();
        _timer = null;
        return;
      }
      await reintentar();
    });
  }

  /// Para las pruebas.
  void detener() {
    _timer?.cancel();
    _timer = null;
  }
}
