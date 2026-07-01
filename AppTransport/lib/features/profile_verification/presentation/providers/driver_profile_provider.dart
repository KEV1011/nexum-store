import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/profile_verification/domain/entities/driver_profile_entity.dart';

class DriverProfileState {
  const DriverProfileState({
    this.profile,
    this.isLoading = false,
    this.error,
  });

  final DriverProfileEntity? profile;
  final bool isLoading;
  final String? error;

  DriverProfileState copyWith({
    DriverProfileEntity? profile,
    bool? isLoading,
    String? error,
  }) =>
      DriverProfileState(
        profile: profile ?? this.profile,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );
}

class DriverProfileNotifier extends StateNotifier<DriverProfileState> {
  DriverProfileNotifier(this._client) : super(const DriverProfileState());

  final DioClient _client;

  Future<void> load() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final res = await _client.get<Map<String, dynamic>>('/driver/profile');
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data != null) {
        state = state.copyWith(
          profile: DriverProfileEntity.fromJson(data),
          isLoading: false,
        );
      } else {
        state = state.copyWith(isLoading: false);
      }
    } catch (_) {
      state = state.copyWith(isLoading: false, error: 'No se pudo cargar el perfil.');
    }
  }

  /// Uploads a document file via multipart POST /driver/documents.
  ///
  /// Recibe los [bytes] ya leídos (no una ruta de archivo) para funcionar igual
  /// en móvil y en web. En web `image_picker` devuelve una URL `blob:` y
  /// `MultipartFile.fromFile` no está soportado (no hay sistema de archivos),
  /// así que la subida fallaba siempre con "no se pudo subir el documento". Con
  /// bytes + content-type explícito funciona en ambas plataformas y supera el
  /// filtro de tipo MIME del backend (solo acepta imágenes/PDF).
  Future<bool> uploadDocument(
    String type,
    Uint8List bytes,
    String filename, {
    String? expiresAt,
  }) async {
    try {
      final formData = FormData.fromMap({
        'type': type,
        'file': MultipartFile.fromBytes(
          bytes,
          filename: filename,
          contentType: _mediaTypeFor(filename),
        ),
        if (expiresAt != null) 'expiresAt': expiresAt,
      });
      final res = await _client.dio.post<Map<String, dynamic>>(
        '/driver/documents',
        data: formData,
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data != null) {
        state = state.copyWith(profile: DriverProfileEntity.fromJson(data));
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Deriva el content-type a partir de la extensión del archivo. El backend
  /// solo acepta JPG, PNG, WebP o PDF; por defecto JPEG (fotos de galería).
  DioMediaType _mediaTypeFor(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return DioMediaType('image', 'png');
    if (lower.endsWith('.webp')) return DioMediaType('image', 'webp');
    if (lower.endsWith('.pdf')) return DioMediaType('application', 'pdf');
    return DioMediaType('image', 'jpeg');
  }

  Future<bool> updateProfile({String? bio, String? vehicleDescription}) async {
    try {
      final res = await _client.patch<Map<String, dynamic>>(
        '/driver/profile',
        data: {
          if (bio != null) 'bio': bio,
          if (vehicleDescription != null) 'vehicleDescription': vehicleDescription,
        },
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data != null) {
        state = state.copyWith(profile: DriverProfileEntity.fromJson(data));
      }
      return true;
    } catch (_) {
      return false;
    }
  }
}

final driverProfileProvider =
    StateNotifierProvider<DriverProfileNotifier, DriverProfileState>((ref) {
  return DriverProfileNotifier(DioClient());
});
