import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/core/network/dio_client.dart';

/// Remote datasource for authentication via the Nexum Driver REST API.
class AuthRemoteDataSource {
  AuthRemoteDataSource({DioClient? client}) : _client = client ?? DioClient();

  final DioClient _client;

  /// Requests an OTP to be sent to [phoneNumber].
  Future<bool> sendOtp(String phoneNumber) async {
    await _client.post<Map<String, dynamic>>(
      '/auth/send-otp',
      data: {'phone': phoneNumber},
    );
    return true;
  }

  /// Verifies [otpCode] for [phoneNumber].
  ///
  /// Returns a map with `{ token: String, driver: Map }` on success.
  /// Throws [InvalidOtpException] on 401.
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
}
