import 'package:dio/dio.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/errors/exceptions.dart';
import 'package:nexum_client/features/auth/data/datasources/auth_datasource.dart';

/// Datasource real — conecta al backend Express en [ApiConfig.baseUrl]/client/auth.
class AuthRealDataSource implements AuthDataSource {
  const AuthRealDataSource({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// Traduce un [DioException] a un mensaje CONCRETO (no el genérico "Error de
  /// conexión") para poder diagnosticar por qué el login no avanza: timeout,
  /// host inalcanzable, certificado o error del servidor con su código.
  String _describe(DioException e) {
    final serverMsg = (e.response?.data as Map?)?['error'] as String?;
    if (serverMsg != null) return serverMsg;
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
        return 'Tiempo de conexión agotado: el servidor (${ApiConfig.baseUrl}) '
            'no aceptó la conexión.';
      case DioExceptionType.receiveTimeout:
        return 'El servidor no respondió a tiempo (receive timeout).';
      case DioExceptionType.sendTimeout:
        return 'Se agotó el tiempo al enviar la solicitud (send timeout).';
      case DioExceptionType.connectionError:
        return 'No se pudo conectar al servidor. Revisa tu red. '
            '(${e.error?.toString() ?? 'connectionError'})';
      case DioExceptionType.badCertificate:
        return 'Error de certificado TLS del servidor.';
      case DioExceptionType.badResponse:
        return 'El servidor respondió con error ${e.response?.statusCode}.';
      case DioExceptionType.cancel:
        return 'La solicitud se canceló.';
      case DioExceptionType.unknown:
        return 'Error de red: ${e.error?.toString() ?? 'desconocido'}.';
    }
  }

  @override
  Future<bool> sendOtp(String phoneNumber) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/client/auth/send-otp',
        data: {'phone': phoneNumber},
      );
      return res.data?['success'] == true;
    } on DioException catch (e) {
      throw NetworkException(message: _describe(e));
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
        // acceptedTerms: el único camino a esta llamada pasa por el checkbox
        // de términos/privacidad (no preseleccionado) de la pantalla de
        // teléfono — el backend guarda la constancia {versión, fecha, IP}.
        data: {'phone': phoneNumber, 'otp': otpCode, 'acceptedTerms': true},
      );
      if (res.data?['success'] != true) throw const InvalidOtpException();
      return res.data!['data'] as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const InvalidOtpException();
      throw NetworkException(message: _describe(e));
    }
  }
}
