import 'package:nexum_client/core/config/api_config.dart';
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
  const SosResult({
    required this.eventId,
    required this.trustedContactNotified,
    this.contactStatus = 'sin_contacto',
  });

  final String eventId;
  final bool trustedContactNotified;

  /// Por qué NO se avisó, cuando no se avisó: 'enviado' | 'sin_contacto' |
  /// 'sin_canal' | 'fallo'. La pantalla no puede limitarse a decir "configura
  /// un contacto" cuando el contacto existe y lo que falla es el envío.
  final String contactStatus;
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
      contactStatus: d['trustedContactStatus'] as String? ?? 'sin_contacto',
    );
  }

  /// El enlace que se le manda a un familiar para que siga el viaje, o null
  /// si no se pudo generar.
  ///
  /// Es la PÁGINA del portal (`shareUrl`): mapa, carro y hora de llegada.
  /// Antes se armaba aquí con la ruta de la API, y quien lo abría desde
  /// WhatsApp veía una pantalla de código. Contra un servidor anterior que no
  /// manda `shareUrl` se cae a esa ruta: peor, pero no roto.
  Future<String?> shareTripUrl(String tripId) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/safety/share-trip',
      data: {'tripId': tripId},
    );
    final d = res.data?['data'] as Map<String, dynamic>?;
    final url = d?['shareUrl'];
    if (url is String && url.isNotEmpty) return url;
    final token = d?['shareToken'];
    if (token is String && token.isNotEmpty) {
      return '${ApiConfig.baseUrl}/safety/track/$token';
    }
    return null;
  }

  /// La respuesta al «¿Todo bien?». Best-effort: si no llega, pedir ayuda
  /// sigue funcionando por el SOS, que tiene su propio camino.
  Future<void> responderTodoBien(String tripId, {required bool ok}) async {
    await _dio.post<Map<String, dynamic>>(
      '/client/trips/$tripId/safety-check',
      data: {'ok': ok},
    );
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
