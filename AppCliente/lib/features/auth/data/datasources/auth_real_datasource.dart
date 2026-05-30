import 'package:dio/dio.dart';
import 'package:nexum_client/core/errors/exceptions.dart';
import 'package:nexum_client/features/auth/data/datasources/auth_datasource.dart';

/// Datasource real — conecta al backend Express en [ApiConfig.baseUrl]/client/auth.
class AuthRealDataSource implements AuthDataSource {
  const AuthRealDataSource({required Dio dio}) : _dio = dio;

  final Dio _dio;

  @override
  Future<bool> sendOtp(String phoneNumber) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/client/auth/send-otp',
        data: {'phone': phoneNumber},
      );
      return res.data?['success'] == true;
    } on DioException catch (e) {
      final msg = (e.response?.data as Map?)?['error'] as String?
          ?? 'Error de conexión';
      throw NetworkException(message: msg);
    }
  }

  @override
  Future<Map<String, dynamic>> verifyOtp({
    required String phoneNumber,
    required String otpCode,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/client/auth/verify-otp',
        data: {'phone': phoneNumber, 'otp': otpCode},
      );
      if (res.data?['success'] != true) throw const InvalidOtpException();
      return res.data!['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const InvalidOtpException();
      final msg = (e.response?.data as Map?)?['error'] as String?
          ?? 'Error de conexión';
      throw NetworkException(message: msg);
    }
  }
}
