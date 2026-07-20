import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/constants/app_constants.dart';

/// Token JWT (una lectura cacheada por sesión) para autorizar los tiles del
/// proxy de mapas del backend. Vive en [FlutterSecureStorage], igual que el
/// interceptor de red.
final mapTileTokenProvider = FutureProvider<String?>((ref) async {
  const storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  return storage.read(key: AppConstants.authTokenKey);
});

/// Capa de tiles del mapa **real de Google** (Map Tiles API), servida por el
/// backend en `/geo/tile/{z}/{x}/{y}` con la key server-side (la app nunca ve
/// la key). Reemplaza la capa de OpenStreetMap: el aspecto es idéntico a
/// maps.google.com.
///
/// Mientras el token de sesión carga —o si la app está sin autenticar— cae a
/// OpenStreetMap para no dejar el mapa en gris.
class GoogleMapTiles extends ConsumerWidget {
  const GoogleMapTiles({super.key});

  static const _osm = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final token = ref.watch(mapTileTokenProvider).valueOrNull;
    if (token == null || token.isEmpty) {
      return TileLayer(
        urlTemplate: _osm,
        userAgentPackageName: 'com.nexum.client',
      );
    }
    // Los tiles de Google Map Tiles API son 256 px, el default de flutter_map.
    return TileLayer(
      urlTemplate: '${ApiConfig.baseUrl}/geo/tile/{z}/{x}/{y}?t=$token',
      userAgentPackageName: 'com.nexum.client',
    );
  }
}
