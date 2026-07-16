import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_client/core/network/api_client.dart';

/// Estado de la verificación de identidad del cliente (KYC pasajero).
class ClientKycState {
  const ClientKycState({
    this.status = 'PENDING',
    this.hasSelfie = false,
    this.canSubmit = false,
    this.enforced = false,
    this.isLoading = false,
  });

  final String status; // PENDING | IN_REVIEW | VERIFIED | REJECTED
  final bool hasSelfie;
  final bool canSubmit;
  final bool enforced;
  final bool isLoading;

  ClientKycState copyWith({
    String? status,
    bool? hasSelfie,
    bool? canSubmit,
    bool? enforced,
    bool? isLoading,
  }) =>
      ClientKycState(
        status: status ?? this.status,
        hasSelfie: hasSelfie ?? this.hasSelfie,
        canSubmit: canSubmit ?? this.canSubmit,
        enforced: enforced ?? this.enforced,
        isLoading: isLoading ?? this.isLoading,
      );

  factory ClientKycState.fromJson(Map<String, dynamic> j) => ClientKycState(
        status: (j['status'] as String?) ?? 'PENDING',
        hasSelfie: (j['hasSelfie'] as bool?) ?? false,
        canSubmit: (j['canSubmit'] as bool?) ?? false,
        enforced: (j['enforced'] as bool?) ?? false,
      );
}

class ClientKycNotifier extends StateNotifier<ClientKycState> {
  ClientKycNotifier(this._dio) : super(const ClientKycState());

  final Dio _dio;

  Future<void> load() async {
    state = state.copyWith(isLoading: true);
    try {
      final res = await _dio.get<Map<String, dynamic>>('/client/kyc');
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data != null) {
        state = ClientKycState.fromJson(data).copyWith(isLoading: false);
      } else {
        state = state.copyWith(isLoading: false);
      }
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  /// Sube la selfie. Devuelve el mensaje de error o null si OK.
  Future<String?> uploadSelfie(Uint8List bytes, String filename) async {
    try {
      final form = FormData.fromMap({
        'file': MultipartFile.fromBytes(
          bytes,
          filename: filename,
          contentType: DioMediaType('image', 'jpeg'),
        ),
      });
      final res = await _dio.post<Map<String, dynamic>>('/client/kyc/selfie', data: form);
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data != null) state = ClientKycState.fromJson(data).copyWith(isLoading: false);
      return null;
    } on DioException catch (e) {
      return _msg(e) ?? 'No se pudo subir la selfie.';
    } catch (_) {
      return 'No se pudo subir la selfie.';
    }
  }

  Future<String?> submit() async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/client/kyc/submit');
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data != null) state = ClientKycState.fromJson(data).copyWith(isLoading: false);
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
}

final clientKycProvider =
    StateNotifierProvider<ClientKycNotifier, ClientKycState>((ref) {
  return ClientKycNotifier(ref.read(apiClientProvider));
});
