import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/auth/data/datasources/auth_datasource.dart';

/// Remote datasource for authentication via the Nexum Driver REST API.
class AuthRemoteDataSource implements AuthDataSource {
  AuthRemoteDataSource({DioClient? client}) : _client = client ?? DioClient();

  final DioClient _client;

  @override
  Future<bool> sendOtp(String phoneNumber) async {
    await _client.post<Map<String, dynamic>>(
      '/auth/send-otp',
      data: {'phone': phoneNumber},
    );
    return true;
  }

  @override
  Future<Map<String, dynamic>> verifyOtp({
    required String phoneNumber,
    required String otpCode,
  }) async {
    try {
      final response = await _client.post<Map<String, dynamic>>(
        '/auth/verify-otp',
        data: {'phone': phoneNumber, 'otp': otpCode},
      );
      final data = response.data?['data'] as Map<String, dynamic>?;
      if (data == null) {
        throw const ServerException(message: 'Respuesta vacía del servidor');
      }
      return data;
    } on AuthException {
      throw const InvalidOtpException();
    }
  }

  @override
  Future<Map<String, dynamic>> registerDriver(
    Map<String, dynamic> data,
  ) async {
    final response = await _client.post<Map<String, dynamic>>(
      '/auth/register',
      data: data,
    );
    final responseData = response.data?['data'] as Map<String, dynamic>?;
    if (responseData == null) {
      throw const ServerException(message: 'Respuesta vacía del servidor');
    }
    return responseData;
  }

  // ── Identifier-based auth ────────────────────────────────────────────────

  @override
  Future<({bool exists, String? role, String? status})> checkIdentifier(
    String identifier,
  ) async {
    try {
      final response = await _client.post<Map<String, dynamic>>(
        '/auth/check-identifier',
        data: {'identifier': identifier},
      );
      final d = response.data?['data'] as Map<String, dynamic>?;
      if (d == null) return (exists: false, role: null, status: null);
      return (
        exists: (d['exists'] as bool?) ?? false,
        role: d['role'] as String?,
        status: d['status'] as String?,
      );
    } catch (_) {
      return (exists: false, role: null, status: null);
    }
  }

  @override
  Future<Map<String, dynamic>> loginWithPassword({
    required String identifier,
    required String password,
  }) async {
    try {
      final response = await _client.post<Map<String, dynamic>>(
        '/auth/login',
        data: {'identifier': identifier, 'password': password},
      );
      final data = response.data?['data'] as Map<String, dynamic>?;
      if (data == null) {
        throw const ServerException(message: 'Respuesta vacía del servidor');
      }
      return data;
    } on AuthException {
      throw const AuthException(
        message: 'Credenciales incorrectas.',
        code: 'INVALID_CREDENTIALS',
      );
    }
  }

  @override
  Future<Map<String, dynamic>> registerWithRole({
    required String identifier,
    required String password,
    required String role,
    required Map<String, dynamic> profileData,
  }) async {
    final response = await _client.post<Map<String, dynamic>>(
      '/auth/register-role',
      data: {
        'identifier': identifier,
        'password': password,
        'role': role,
        'profile': profileData,
      },
    );
    final data = response.data?['data'] as Map<String, dynamic>?;
    if (data == null) {
      throw const ServerException(message: 'Respuesta vacía del servidor');
    }
    return data;
  }
}
