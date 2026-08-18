import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:path_provider/path_provider.dart';

/// Guarda las teselas del mapa en el disco del teléfono.
///
/// El proveedor que trae flutter_map de fábrica solo se apoya en la caché de
/// imágenes en memoria de Flutter, que se vacía al salir de la pantalla. Cada
/// vez que se abría un mapa se volvían a descargar las 15-25 teselas de la
/// vista, aunque fueran exactamente las mismas de hace un minuto, y aunque el
/// servidor las mandara con `Cache-Control` — ese encabezado no lo lee nadie
/// por ese camino.
///
/// Encima cada tesela hace dos saltos (teléfono → Render → Google), así que el
/// mapa entraba a trozos. Con esto, la segunda vez que se mira una zona la
/// imagen sale del disco y aparece de golpe.
///
/// No se usa ningún paquete de caché: `path_provider` ya venía con la app y el
/// resto es un archivo por tesela. Es deliberado — una caché de imágenes es
/// exactamente esto, y un paquete más es tamaño, permisos y una actualización
/// que puede romperse.
class TileDiskCache extends TileProvider {
  TileDiskCache({super.headers});

  /// Cuánto vale una tesela guardada. Un mes: las calles no se mueven, y el
  /// servidor manda ese mismo plazo.
  static const vida = Duration(days: 30);

  /// Tope de la carpeta. Al pasarse se borran las más antiguas. 2000 teselas
  /// son unos 50 MB y cubren de sobra una ciudad a todos los zooms útiles.
  static const _maxArchivos = 2000;

  static Directory? _dir;
  static Future<Directory>? _preparando;

  /// Carpeta de la caché, creada una sola vez aunque la pidan diez mapas a la
  /// vez (por eso se guarda el Future y no solo el resultado).
  static Future<Directory> carpeta() {
    final ya = _dir;
    if (ya != null) return Future<Directory>.value(ya);
    return _preparando ??= _crearCarpeta();
  }

  static Future<Directory> _crearCarpeta() async {
    final base = await getTemporaryDirectory();
    final d = Directory('${base.path}/tiles_nexum');
    if (!d.existsSync()) await d.create(recursive: true);
    _dir = d;
    unawaited(_limpiar(d));
    return d;
  }

  /// Borra lo caducado y, si aún sobran archivos, los más viejos. Corre una vez
  /// por arranque y sin bloquear a nadie: que la caché esté un rato pasada de
  /// tamaño no le hace daño a nadie.
  static Future<void> _limpiar(Directory d) async {
    try {
      final ahora = DateTime.now();
      final vivos = <MapEntry<File, DateTime>>[];
      await for (final f in d.list()) {
        if (f is! File) continue;
        final stat = await f.stat();
        if (ahora.difference(stat.modified) > vida) {
          await f.delete();
        } else {
          vivos.add(MapEntry(f, stat.modified));
        }
      }
      if (vivos.length <= _maxArchivos) return;
      vivos.sort((a, b) => a.value.compareTo(b.value));
      for (final e in vivos.take(vivos.length - _maxArchivos)) {
        await e.key.delete();
      }
    } catch (_) {
      // Una caché que no se puede limpiar sigue sirviendo teselas.
    }
  }

  @override
  ImageProvider<Object> getImage(
    TileCoordinates coordinates,
    TileLayer options,
  ) {
    return _TeselaEnDisco(getTileUrl(coordinates, options), headers);
  }
}

/// Una tesela: primero el disco, y solo si no está, la red.
@immutable
class _TeselaEnDisco extends ImageProvider<_TeselaEnDisco> {
  const _TeselaEnDisco(this.url, this.headers);

  final String url;
  final Map<String, String> headers;

  /// Nombre del archivo.
  ///
  /// La URL lleva el pase de acceso en `?t=`, que se renueva cada dos horas: si
  /// entrara en el nombre, la caché entera se invalidaría en cada renovación y
  /// no serviría de nada. Se usa solo el host y los tres últimos tramos de la
  /// ruta, que son z/x/y.
  String get _clave {
    final u = Uri.parse(url);
    final partes = u.pathSegments.where((s) => s.isNotEmpty).toList();
    final cola = partes.length >= 3
        ? partes.sublist(partes.length - 3).join('_')
        : url.hashCode.toUnsigned(32).toString();
    return '${u.host.hashCode.toUnsigned(32)}_$cola';
  }

  @override
  Future<_TeselaEnDisco> obtainKey(ImageConfiguration configuration) =>
      SynchronousFuture<_TeselaEnDisco>(this);

  @override
  ImageStreamCompleter loadImage(
    _TeselaEnDisco key,
    ImageDecoderCallback decode,
  ) {
    return MultiFrameImageStreamCompleter(
      codec: _cargar(decode),
      scale: 1,
      debugLabel: url,
    );
  }

  Future<ui.Codec> _cargar(ImageDecoderCallback decode) async {
    final delDisco = await _leerDelDisco();
    if (delDisco != null && delDisco.isNotEmpty) {
      return decode(await ui.ImmutableBuffer.fromUint8List(delDisco));
    }
    final descargada = await _descargar();
    return decode(await ui.ImmutableBuffer.fromUint8List(descargada));
  }

  /// Devuelve el archivo de la tesela, o null si el disco no se puede usar.
  Future<File?> _archivo() async {
    try {
      final dir = await TileDiskCache.carpeta();
      return File('${dir.path}/$_clave.img');
    } catch (_) {
      // Sin disco utilizable se sigue por la red, que es el comportamiento de
      // siempre. Nunca se deja de pintar el mapa por un fallo de la caché.
      return null;
    }
  }

  Future<Uint8List?> _leerDelDisco() async {
    try {
      final f = await _archivo();
      if (f == null || !f.existsSync()) return null;
      final stat = await f.stat();
      if (DateTime.now().difference(stat.modified) >= TileDiskCache.vida) {
        return null;
      }
      return await f.readAsBytes();
    } catch (_) {
      return null;
    }
  }

  Future<Uint8List> _descargar() async {
    final cliente = HttpClient()
      ..connectionTimeout = const Duration(seconds: 15);
    try {
      final req = await cliente.getUrl(Uri.parse(url));
      headers.forEach(req.headers.add);
      final res = await req.close();
      if (res.statusCode != HttpStatus.ok) {
        // Se propaga para que flutter_map recurra a su `fallbackUrl` (OSM).
        throw HttpException('HTTP ${res.statusCode}', uri: Uri.parse(url));
      }
      final datos = await consolidateHttpClientResponseBytes(res);
      if (datos.isNotEmpty) unawaited(_guardar(datos));
      return datos;
    } finally {
      cliente.close();
    }
  }

  /// Guarda para la próxima vez. Sin `await` en quien llama: la imagen ya se
  /// puede pintar y escribirla no debe retrasar este fotograma.
  Future<void> _guardar(Uint8List datos) async {
    try {
      final f = await _archivo();
      if (f == null) return;
      await f.writeAsBytes(datos, flush: false);
    } catch (_) {
      // Disco lleno o sin permiso: se pierde la caché, no la imagen.
    }
  }

  @override
  bool operator ==(Object other) => other is _TeselaEnDisco && other.url == url;

  @override
  int get hashCode => url.hashCode;
}

/// Punto de entrada para la importación condicional: en móvil, la caché real.
TileProvider crearTileDiskCache() => TileDiskCache();
