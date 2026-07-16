import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/network/dio_client.dart';

/// Estado de la verificación de identidad (KYC) del conductor.
class DriverKycState {
  const DriverKycState({
    this.status = 'PENDING',
    this.provider,
    this.hasSelfie = false,
    this.canSubmit = false,
    this.enforced = false,
    this.isLoading = false,
    this.error,
  });

  final String status; // PENDING | IN_REVIEW | VERIFIED | REJECTED
  final String? provider;
  final bool hasSelfie;
  final bool canSubmit;
  final bool enforced;
  final bool isLoading;
  final String? error;

  DriverKycState copyWith({
    String? status,
    String? provider,
    bool? hasSelfie,
    bool? canSubmit,
    bool? enforced,
    bool? isLoading,
    String? error,
  }) =>
      DriverKycState(
        status: status ?? this.status,
        provider: provider ?? this.provider,
        hasSelfie: hasSelfie ?? this.hasSelfie,
        canSubmit: canSubmit ?? this.canSubmit,
        enforced: enforced ?? this.enforced,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );

  factory DriverKycState.fromJson(Map<String, dynamic> j) => DriverKycState(
        status: (j['status'] as String?) ?? 'PENDING',
        provider: j['provider'] as String?,
        hasSelfie: (j['hasSelfie'] as bool?) ?? false,
        canSubmit: (j['canSubmit'] as bool?) ?? false,
        enforced: (j['enforced'] as bool?) ?? false,
      );
}

class DriverKycNotifier extends StateNotifier<DriverKycState> {
  DriverKycNotifier(this._client) : super(const DriverKycState());

  final DioClient _client;

  Future<void> load() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final res = await _client.get<Map<String, dynamic>>('/driver/kyc');
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data != null) {
        final next = DriverKycState.fromJson(data);
        state = next.copyWith(isLoading: false);
      } else {
        state = state.copyWith(isLoading: false);
      }
    } catch (_) {
      state = state.copyWith(isLoading: false, error: 'No se pudo cargar la verificación de identidad.');
    }
  }

  /// Sube la selfie (bytes, web-safe). Devuelve el mensaje de error o null si OK.
  Future<String?> uploadSelfie(Uint8List bytes, String filename) async {
    try {
      final formData = FormData.fromMap({
        'file': MultipartFile.fromBytes(
          bytes,
          filename: filename,
          contentType: _mediaTypeFor(filename),
        ),
      });
      final res = await _client.dio.post<Map<String, dynamic>>(
        '/driver/kyc/selfie',
        data: formData,
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data != null) {
        state = DriverKycState.fromJson(data).copyWith(isLoading: false);
      }
      return null;
    } on DioException catch (e) {
      return _msg(e) ?? 'No se pudo subir la selfie.';
    } catch (_) {
      return 'No se pudo subir la selfie.';
    }
  }

  /// Envía la verificación de identidad. Devuelve el mensaje de error o null si OK.
  Future<String?> submit() async {
    try {
      final res = await _client.dio.post<Map<String, dynamic>>('/driver/kyc/submit');
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data != null) {
        state = DriverKycState.fromJson(data).copyWith(isLoading: false);
      }
      return null;
    } on DioException catch (e) {
      return _msg(e) ?? 'No se pudo enviar la verificación.';
    } catch (_) {
      return 'No se pudo enviar la verificación.';
    }
  }

  String? _msg(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] is String) return data['error'] as String;
    return null;
  }

  DioMediaType _mediaTypeFor(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return DioMediaType('image', 'png');
    if (lower.endsWith('.webp')) return DioMediaType('image', 'webp');
    return DioMediaType('image', 'jpeg');
  }
}

final driverKycProvider =
    StateNotifierProvider<DriverKycNotifier, DriverKycState>((ref) {
  return DriverKycNotifier(DioClient());
});
