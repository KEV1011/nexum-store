import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/auth/data/datasources/auth_datasource.dart';

/// Remote datasource for authentication via the ZIPA Conductor REST API.
class AuthRemoteDataSource implements AuthDataSource {
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

  /// POST /auth/verify-pin — el segundo paso cuando la cuenta tiene clave.
  ///
  /// Un 401 aquí es «clave equivocada», no «sesión vencida»: se devuelve el
  /// motivo que dio el servidor para que la pantalla lo diga tal cual.
  @override
  Future<Map<String, dynamic>> verifyPin({
    required String pinTicket,
    required String pin,
  }) async {
    try {
      final response = await _client.post<Map<String, dynamic>>(
        '/auth/verify-pin',
        data: {'pinTicket': pinTicket, 'pin': pin},
      );
      final data = response.data?['data'] as Map<String, dynamic>?;
      if (data == null) {
        throw const ServerException(message: 'Respuesta vacía del servidor');
      }
      return data;
    } on AuthException catch (e) {
      final cuerpo = e.details;
      final motivo = cuerpo is Map && cuerpo['error'] is String
          ? cuerpo['error'] as String
          : 'Clave equivocada.';
      final codigo = cuerpo is Map && cuerpo['code'] is String
          ? cuerpo['code'] as String
          : 'clave_incorrecta';
      throw AuthException(message: motivo, code: codigo);
    }
  }

  /// Registers a new driver via POST /auth/register.
  ///
  /// Returns a map with `{ token: String, driver: Map, isRegistered: bool }` on success.
  /// Throws [ServerException] on failure.
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
}
