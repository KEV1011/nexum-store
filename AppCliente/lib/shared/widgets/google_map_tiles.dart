import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/network/api_client.dart';

/// Pase de corta duración para los tiles del mapa.
///
/// Una capa de tiles no puede poner cabeceras: el permiso viaja en la URL de
/// CADA imagen, y una panorámica son decenas. Antes ahí iba el JWT de sesión de
/// 30 días, que acaba en los registros del servidor, en cualquier proxy y en el
/// historial. Este pase dura dos horas y solo sirve para pedir mapas: si se
/// filtra, lo peor que se puede hacer con él es mirar mapas hasta que venza.
///
/// Se renueva solo poco antes de vencer, para que una sesión larga no vea el
/// mapa caer a OpenStreetMap a mitad de camino.
final mapTileTicketProvider = FutureProvider<String?>((ref) async {
  Timer? renovacion;
  ref.onDispose(() => renovacion?.cancel());

  try {
    final res = await ref
        .read(apiClientProvider)
        .get<Map<String, dynamic>>('/geo/tile-ticket');
    final data = res.data?['data'] as Map<String, dynamic>?;
    final ticket = data?['ticket'] as String?;
    if (ticket == null || ticket.isEmpty) return null;

    final vidaS = (data?['expiresIn'] as num?)?.toInt() ?? 7200;
    renovacion = Timer(
      Duration(seconds: (vidaS * 0.9).round()),
      ref.invalidateSelf,
    );
    return ticket;
  } catch (_) {
    // Sin sesión, sin red o backend dormido: OpenStreetMap. El mapa nunca se
    // queda gris por no haber podido pedir un pase.
    return null;
  }
});

/// Capa de tiles del mapa **real de Google** (Map Tiles API), servida por el
/// backend en `/geo/tile/{z}/{x}/{y}` con la key server-side (la app nunca ve
/// la key). Reemplaza la capa de OpenStreetMap: el aspecto es idéntico a
/// maps.google.com.
///
/// Mientras el pase carga —o si la app está sin autenticar— cae a
/// OpenStreetMap para no dejar el mapa en gris.
class GoogleMapTiles extends ConsumerWidget {
  const GoogleMapTiles({super.key});

  static const _osm = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ticket = ref.watch(mapTileTicketProvider).valueOrNull;
    if (ticket == null || ticket.isEmpty) {
      return TileLayer(
        urlTemplate: _osm,
        // Sin esto las teselas de 256 px se ven BORROSAS en pantallas de alta
        // densidad (el usuario lo describió como "parece un dibujo"): flutter_map
        // pide un zoom más y las escala, así el mapa se ve nítido.
        retinaMode: RetinaMode.isHighDensity(context),
        userAgentPackageName: 'com.nexum.client',
      );
    }
    // Los tiles de Google Map Tiles API son 256 px, el default de flutter_map.
    // fallbackUrl: si el tile del backend falla (Render no desplegado, dormido,
    // 404/401 o Map Tiles API sin habilitar) flutter_map usa OpenStreetMap por
    // tile — el mapa NUNCA queda en blanco.
    return TileLayer(
      urlTemplate: '${ApiConfig.baseUrl}/geo/tile/{z}/{x}/{y}?t=$ticket',
      fallbackUrl: _osm,
      retinaMode: RetinaMode.isHighDensity(context),
      userAgentPackageName: 'com.nexum.client',
    );
  }
}
