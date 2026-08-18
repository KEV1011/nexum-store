/// Caché de teselas en disco, con la implementación que corresponda a la
/// plataforma: la real en móvil (`dart:io`) y ninguna en web, donde el propio
/// navegador ya cachea. Quien la usa solo llama a `crearTileDiskCache()`.
export 'tile_disk_cache_stub.dart'
    if (dart.library.io) 'tile_disk_cache_io.dart';
