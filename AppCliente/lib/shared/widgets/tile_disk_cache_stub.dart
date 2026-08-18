import 'package:flutter_map/flutter_map.dart';

/// Versión para web: el proveedor de siempre, sin caché propia.
///
/// El navegador YA guarda las imágenes él solo respetando el `Cache-Control`
/// que manda el backend, así que aquí no hace falta nada — y `dart:io`, que es
/// lo que usa la versión de móvil, ni siquiera existe al compilar para web.
///
/// Devuelve el proveedor de red en vez de `null` a propósito: así el tipo es
/// siempre `TileProvider` y no depende de que el parámetro `tileProvider` de
/// `TileLayer` acepte nulos en la versión de flutter_map que toque.
TileProvider crearTileDiskCache() => NetworkTileProvider();
