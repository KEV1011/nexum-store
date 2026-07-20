import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import 'package:nexum_client/core/utils/polyline_decoder.dart';
import 'package:nexum_client/core/network/api_client.dart';

/// Sugerencia de dirección devuelta por el autocompletado.
class PlaceSuggestion {
  const PlaceSuggestion({
    required this.placeId,
    required this.description,
    required this.mainText,
    required this.secondaryText,
  });

  factory PlaceSuggestion.fromJson(Map<String, dynamic> json) =>
      PlaceSuggestion(
        placeId: json['placeId'] as String,
        description: json['description'] as String,
        mainText: json['mainText'] as String? ?? json['description'] as String,
        secondaryText: json['secondaryText'] as String? ?? '',
      );

  final String placeId;
  final String description;
  final String mainText;
  final String secondaryText;
}

/// Dirección resuelta con coordenadas.
class PlaceDetails {
  const PlaceDetails({
    required this.address,
    required this.lat,
    required this.lng,
  });

  factory PlaceDetails.fromJson(Map<String, dynamic> json) => PlaceDetails(
        address: json['address'] as String,
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
      );

  final String address;
  final double lat;
  final double lng;
}

/// Ruta real entre dos puntos (distancia, duración y polyline).
class RouteInfo {
  const RouteInfo({
    required this.distanceKm,
    required this.durationMinutes,
    required this.polyline,
  });

  factory RouteInfo.fromJson(Map<String, dynamic> json) => RouteInfo(
        distanceKm: (json['distanceKm'] as num).toDouble(),
        durationMinutes: (json['durationMinutes'] as num).toInt(),
        polyline: json['polyline'] as String? ?? '',
      );

  final double distanceKm;
  final int durationMinutes;
  final String polyline;
}

/// Cliente del proxy geográfico del backend (/geo/*).
///
/// La API key de Google Maps vive solo en el servidor: la app llama con su
/// token de sesión y recibe respuestas reducidas.
class GeoService {
  GeoService(this._dio);

  final Dio _dio;

  /// Sugerencias de direcciones para [input] (mínimo 3 caracteres).
  /// Devuelve lista vacía ante cualquier error para degradar sin romper la UI.
  Future<List<PlaceSuggestion>> autocomplete(String input) async {
    if (input.trim().length < 3) return const [];
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/geo/autocomplete',
        queryParameters: {'input': input.trim()},
      );
      final data = res.data?['data'] as List<dynamic>? ?? const [];
      return data
          .map((e) => PlaceSuggestion.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Coordenadas y dirección formateada de un lugar seleccionado.
  Future<PlaceDetails?> placeDetails(String placeId) async {
    try {
      final res =
          await _dio.get<Map<String, dynamic>>('/geo/place/$placeId');
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data == null) return null;
      return PlaceDetails.fromJson(data);
    } catch (_) {
      return null;
    }
  }

  /// Ruta en carro entre origen y destino (distancia/ETA reales).
  Future<RouteInfo?> directions({
    required double originLat,
    required double originLng,
    required double destLat,
    required double destLng,
  }) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/geo/directions',
        queryParameters: {
          'originLat': originLat,
          'originLng': originLng,
          'destLat': destLat,
          'destLng': destLng,
        },
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data == null) return null;
      return RouteInfo.fromJson(data);
    } catch (_) {
      return null;
    }
  }
}

// ── Ruta real por las calles (con caché en memoria) ─────────────────────────
//
// Devuelve los puntos del trayecto siguiendo las vías (Routes API vía el proxy
// del backend), o null si el proxy no tiene llave/no responde — los mapas caen
// a la línea recta actual. La caché evita quemar cuota en rebuilds.
final Map<String, List<LatLng>> _routeCache = {};

String _routeKey(double aLat, double aLng, double bLat, double bLng) =>
    '${aLat.toStringAsFixed(4)},${aLng.toStringAsFixed(4)}'
    '->${bLat.toStringAsFixed(4)},${bLng.toStringAsFixed(4)}';

extension GeoRoutePoints on GeoService {
  Future<List<LatLng>?> routePoints({
    required double originLat,
    required double originLng,
    required double destLat,
    required double destLng,
  }) async {
    final key = _routeKey(originLat, originLng, destLat, destLng);
    final cached = _routeCache[key];
    if (cached != null) return cached;
    final route = await directions(
      originLat: originLat,
      originLng: originLng,
      destLat: destLat,
      destLng: destLng,
    );
    if (route == null || route.polyline.isEmpty) return null;
    final points = decodePolyline(route.polyline);
    if (points.length < 2) return null;
    _routeCache[key] = points;
    return points;
  }
}

final geoServiceProvider = Provider<GeoService>(
  (ref) => GeoService(ref.read(apiClientProvider)),
);
