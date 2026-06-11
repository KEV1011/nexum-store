import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';

// ── Models ────────────────────────────────────────────────────────────────────

class PlaceSuggestion {
  final String placeId;
  final String mainText;
  final String secondaryText;
  final String description;

  const PlaceSuggestion({
    required this.placeId,
    required this.mainText,
    required this.secondaryText,
    required this.description,
  });

  factory PlaceSuggestion.fromJson(Map<String, dynamic> j) => PlaceSuggestion(
        placeId: j['placeId'] as String,
        mainText: j['mainText'] as String? ?? '',
        secondaryText: j['secondaryText'] as String? ?? '',
        description: j['description'] as String? ?? '',
      );
}

class PlaceDetails {
  final String placeId;
  final String name;
  final String address;
  final double lat;
  final double lng;

  const PlaceDetails({
    required this.placeId,
    required this.name,
    required this.address,
    required this.lat,
    required this.lng,
  });

  factory PlaceDetails.fromJson(Map<String, dynamic> j) => PlaceDetails(
        placeId: j['placeId'] as String,
        name: j['name'] as String? ?? '',
        address: j['address'] as String? ?? '',
        lat: (j['lat'] as num).toDouble(),
        lng: (j['lng'] as num).toDouble(),
      );
}

class RouteInfo {
  final int distanceMeters;
  final String distanceText;
  final int durationSeconds;
  final String durationText;
  final String? polyline;

  const RouteInfo({
    required this.distanceMeters,
    required this.distanceText,
    required this.durationSeconds,
    required this.durationText,
    this.polyline,
  });

  double get distanceKm => distanceMeters / 1000.0;
  int get durationMinutes => (durationSeconds / 60).round();

  factory RouteInfo.fromJson(Map<String, dynamic> j) => RouteInfo(
        distanceMeters: j['distanceMeters'] as int? ?? 0,
        distanceText: j['distanceText'] as String? ?? '',
        durationSeconds: j['durationSeconds'] as int? ?? 0,
        durationText: j['durationText'] as String? ?? '',
        polyline: j['polyline'] as String?,
      );
}

// ── Service ───────────────────────────────────────────────────────────────────

class GeoService {
  GeoService(this._dio);

  final Dio _dio;

  Future<List<PlaceSuggestion>> autocomplete(String input, {String? sessionToken}) async {
    if (input.trim().isEmpty) return [];
    try {
      final resp = await _dio.get<Map<String, dynamic>>(
        '/geo/autocomplete',
        queryParameters: {
          'input': input,
          if (sessionToken != null) 'sessionToken': sessionToken,
        },
      );
      final data = (resp.data?['data'] as List?) ?? [];
      return data
          .whereType<Map<String, dynamic>>()
          .map(PlaceSuggestion.fromJson)
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<PlaceDetails?> placeDetails(String placeId) async {
    try {
      final resp = await _dio.get<Map<String, dynamic>>('/geo/place/$placeId');
      final data = resp.data?['data'];
      if (data is Map<String, dynamic>) return PlaceDetails.fromJson(data);
    } catch (_) {}
    return null;
  }

  Future<String?> reverseGeocode(double lat, double lng) async {
    try {
      final resp = await _dio.get<Map<String, dynamic>>(
        '/geo/reverse',
        queryParameters: {'lat': lat, 'lng': lng},
      );
      return resp.data?['data']?['address'] as String?;
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
      final resp = await _dio.get<Map<String, dynamic>>(
        '/geo/directions',
        queryParameters: {
          'originLat': originLat,
          'originLng': originLng,
          'destLat': destLat,
          'destLng': destLng,
        },
      );
      final data = resp.data?['data'];
      if (data is Map<String, dynamic>) return RouteInfo.fromJson(data);
    } catch (_) {}
    return null;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

final geoServiceProvider = Provider<GeoService>((ref) {
  return GeoService(ref.watch(apiClientProvider));
});
