import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';

/// Trusted contact configured by the user for SOS / trip sharing.
class TrustedContact {
  const TrustedContact({this.name, this.phone});

  factory TrustedContact.fromJson(Map<String, dynamic> json) => TrustedContact(
        name: json['name'] as String?,
        phone: json['phone'] as String?,
      );

  final String? name;
  final String? phone;

  bool get isConfigured => (phone ?? '').trim().isNotEmpty;
}

/// Result of a POST /safety/sos call.
class SosResult {
  const SosResult({required this.eventId, required this.trustedContactNotified});

  final String eventId;
  final bool trustedContactNotified;
}

class SafetyService {
  SafetyService(this._dio);

  final Dio _dio;

  Future<SosResult> sendSos({
    String? tripId,
    required double lat,
    required double lng,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/safety/sos',
      data: {
        if (tripId != null) 'tripId': tripId,
        'lat': lat,
        'lng': lng,
      },
    );
    final d = res.data?['data'] as Map<String, dynamic>? ?? const {};
    return SosResult(
      eventId: d['eventId'] as String? ?? '',
      trustedContactNotified: d['trustedContactNotified'] as bool? ?? false,
    );
  }

  /// Returns the opaque share token for the trip, or null on failure.
  Future<String?> shareTrip(String tripId) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/safety/share-trip',
      data: {'tripId': tripId},
    );
    final d = res.data?['data'] as Map<String, dynamic>?;
    return d?['shareToken'] as String?;
  }

  Future<TrustedContact> getTrustedContact() async {
    final res = await _dio.get<Map<String, dynamic>>('/safety/trusted-contact');
    final d = res.data?['data'] as Map<String, dynamic>? ?? const {};
    return TrustedContact.fromJson(d);
  }

  Future<TrustedContact> setTrustedContact({
    required String name,
    required String phone,
  }) async {
    final res = await _dio.put<Map<String, dynamic>>(
      '/safety/trusted-contact',
      data: {'name': name, 'phone': phone},
    );
    final d = res.data?['data'] as Map<String, dynamic>? ?? const {};
    return TrustedContact.fromJson(d);
  }
}

final safetyServiceProvider = Provider<SafetyService>(
  (ref) => SafetyService(ref.read(apiClientProvider)),
);

final trustedContactProvider =
    FutureProvider.autoDispose<TrustedContact>((ref) async {
  return ref.read(safetyServiceProvider).getTrustedContact();
});
