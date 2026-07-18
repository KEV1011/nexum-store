import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';

/// Perfil del cliente persistido en el backend (GET /client/profile).
class ClientProfile {
  const ClientProfile({
    required this.name,
    required this.phone,
    this.email,
    this.avatarUrl,
    this.memberSince,
  });

  factory ClientProfile.fromJson(Map<String, dynamic> json) {
    return ClientProfile(
      name: json['name'] as String? ?? 'Cliente ZIPA',
      phone: json['phone'] as String? ?? '',
      email: json['email'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      memberSince: json['memberSince'] as String?,
    );
  }

  final String name;
  final String phone;
  final String? email;
  final String? avatarUrl;
  final String? memberSince;
}

/// Carga el perfil real al construirse y expone subida de avatar y edición
/// de nombre. Estado `null` mientras carga o si no hay sesión.
class ClientProfileNotifier extends StateNotifier<ClientProfile?> {
  ClientProfileNotifier(this._dio) : super(null) {
    _load();
  }

  final Dio _dio;

  Future<void> _load() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/client/profile');
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data != null && mounted) {
        state = ClientProfile.fromJson(data);
      }
    } on DioException {
      // Sin sesión o sin conexión: la pantalla cae al nombre del auth local.
    }
  }

  Future<void> refresh() => _load();

  /// Sube el avatar (multipart, bytes para funcionar también en web).
  /// Devuelve `null` si todo salió bien o el mensaje de error a mostrar.
  Future<String?> uploadPhoto(Uint8List bytes, String filename) async {
    try {
      final formData = FormData.fromMap({
        'file': MultipartFile.fromBytes(
          bytes,
          filename: filename,
          contentType: _mediaTypeFor(filename),
        ),
      });
      final res = await _dio.post<Map<String, dynamic>>(
        '/client/profile/photo',
        data: formData,
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data != null && mounted) {
        state = ClientProfile.fromJson(data);
      }
      return null;
    } on DioException catch (e) {
      return (e.response?.data as Map?)?['error'] as String? ??
          'No se pudo subir la foto. Revisa tu conexión.';
    } catch (_) {
      return 'No se pudo subir la foto. Revisa tu conexión.';
    }
  }

  /// Actualiza el nombre visible (PUT /client/profile). Devuelve `null` si
  /// todo salió bien o el mensaje de error a mostrar.
  Future<String?> updateName(String name) async {
    final trimmed = name.trim();
    if (trimmed.length < 2) return 'Escribe tu nombre completo.';
    try {
      final res = await _dio.put<Map<String, dynamic>>(
        '/client/profile',
        data: {'name': trimmed},
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data != null && mounted) {
        state = ClientProfile.fromJson(data);
      }
      return null;
    } on DioException catch (e) {
      return (e.response?.data as Map?)?['error'] as String? ??
          'No se pudo actualizar el perfil.';
    }
  }

  DioMediaType _mediaTypeFor(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return DioMediaType('image', 'png');
    if (lower.endsWith('.webp')) return DioMediaType('image', 'webp');
    return DioMediaType('image', 'jpeg');
  }
}

final clientProfileProvider =
    StateNotifierProvider<ClientProfileNotifier, ClientProfile?>((ref) {
  return ClientProfileNotifier(ref.watch(apiClientProvider));
});
