import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';

// ── Domain types ──────────────────────────────────────────────────────────────

class PlaceSuggestion {
  const PlaceSuggestion({
    required this.placeId,
    required this.description,
    required this.mainText,
    required this.secondaryText,
  });

  final String placeId;
  final String description;
  final String mainText;
  final String secondaryText;

  factory PlaceSuggestion.fromJson(Map<String, dynamic> j) => PlaceSuggestion(
        placeId: j['placeId'] as String,
        description: j['description'] as String? ?? '',
        mainText: j['mainText'] as String? ?? '',
        secondaryText: j['secondaryText'] as String? ?? '',
      );
}

class PlaceDetails {
  const PlaceDetails({
    required this.placeId,
    required this.description,
    required this.lat,
    required this.lng,
  });

  final String placeId;
  final String description;
  final double lat;
  final double lng;

  factory PlaceDetails.fromJson(Map<String, dynamic> j) => PlaceDetails(
        placeId: j['placeId'] as String,
        description: j['description'] as String? ?? '',
        lat: (j['lat'] as num).toDouble(),
        lng: (j['lng'] as num).toDouble(),
      );
}

class RouteInfo {
  const RouteInfo({
    required this.distanceKm,
    required this.etaMinutes,
    required this.polyline,
  });

  final double distanceKm;
  final int etaMinutes;
  final String polyline;

  factory RouteInfo.fromJson(Map<String, dynamic> j) => RouteInfo(
        distanceKm: (j['distanceKm'] as num).toDouble(),
        etaMinutes: (j['etaMinutes'] as num).toInt(),
        polyline: j['polyline'] as String? ?? '',
      );
}

// ── Service ───────────────────────────────────────────────────────────────────

class GeoService {
  GeoService(this._dio);

  final Dio _dio;

  Future<List<PlaceSuggestion>> autocomplete(
    String input, {
    double? lat,
    double? lng,
  }) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/geo/autocomplete',
        queryParameters: {
          'input': input,
          if (lat != null) 'lat': lat,
          if (lng != null) 'lng': lng,
        },
      );
      final list = res.data!['data'] as List<dynamic>;
      return list
          .cast<Map<String, dynamic>>()
          .map(PlaceSuggestion.fromJson)
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<PlaceDetails?> placeDetails(String placeId) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/geo/place/$placeId',
      );
      return PlaceDetails.fromJson(
        res.data!['data'] as Map<String, dynamic>,
      );
    } catch (_) {
      return null;
    }
  }

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
      return RouteInfo.fromJson(res.data!['data'] as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

final geoServiceProvider = Provider<GeoService>((ref) {
  final dio = ref.watch(dioProvider);
  return GeoService(dio);
});
