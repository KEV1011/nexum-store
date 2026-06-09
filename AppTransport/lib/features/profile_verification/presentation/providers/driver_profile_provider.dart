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
  /// [filePath] is the local file system path returned by image_picker.
  Future<bool> uploadDocument(String type, String filePath, {String? expiresAt}) async {
    try {
      final filename = filePath.split('/').last;
      final formData = FormData.fromMap({
        'type': type,
        'file': await MultipartFile.fromFile(filePath, filename: filename),
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
