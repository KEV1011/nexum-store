import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:nexum_client/core/network/api_client.dart';

/// Resultado de una ruta calculada por el backend (Google Directions).
class RouteResult {
  const RouteResult({
    required this.distanceKm,
    required this.durationMinutes,
    required this.origin,
    required this.destination,
    required this.points,
  });

  final double distanceKm;
  final int durationMinutes;
  final LatLng origin;
  final LatLng destination;

  /// Puntos decodificados de la polilínea para dibujar la ruta en el mapa.
  final List<LatLng> points;
}

/// Consume los endpoints de mapas del backend (`/client/maps/*`), que a su vez
/// usan Google Directions/Geocoding. Toda la lógica de claves vive en el server.
class MapsService {
  const MapsService(this._dio);

  final Dio _dio;

  /// Calcula la ruta real (siguiendo calles) entre dos puntos.
  /// Devuelve `null` si el backend no responde o Maps no está configurado.
  Future<RouteResult?> route(LatLng origin, LatLng destination) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/client/maps/route',
        queryParameters: {
          'origin': '${origin.latitude},${origin.longitude}',
          'destination': '${destination.latitude},${destination.longitude}',
        },
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data == null) return null;

      final encoded = data['polyline'] as String?;
      final points = encoded != null && encoded.isNotEmpty
          ? decodePolyline(encoded)
          : <LatLng>[origin, destination];

      return RouteResult(
        distanceKm: (data['distanceKm'] as num).toDouble(),
        durationMinutes: (data['durationMinutes'] as num).toInt(),
        origin: LatLng(
          (data['originLat'] as num).toDouble(),
          (data['originLng'] as num).toDouble(),
        ),
        destination: LatLng(
          (data['destLat'] as num).toDouble(),
          (data['destLng'] as num).toDouble(),
        ),
        points: points,
      );
    } catch (_) {
      return null;
    }
  }

  /// Convierte una dirección de texto en coordenadas. `null` si no se resuelve.
  Future<LatLng?> geocode(String address) async {
    if (address.trim().isEmpty) return null;
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/client/maps/geocode',
        queryParameters: {'address': address},
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data == null) return null;
      return LatLng(
        (data['lat'] as num).toDouble(),
        (data['lng'] as num).toDouble(),
      );
    } catch (_) {
      return null;
    }
  }
}

/// Decodifica una polilínea codificada de Google (algoritmo estándar).
List<LatLng> decodePolyline(String encoded) {
  final points = <LatLng>[];
  var index = 0;
  var lat = 0;
  var lng = 0;

  while (index < encoded.length) {
    int shift = 0, result = 0, b;
    do {
      b = encoded.codeUnitAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    final dlat = (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.codeUnitAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    final dlng = (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    points.add(LatLng(lat / 1e5, lng / 1e5));
  }

  return points;
}

final mapsServiceProvider = Provider<MapsService>(
  (ref) => MapsService(ref.read(apiClientProvider)),
);
