import 'package:dio/dio.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/core/network/interceptors/auth_interceptor.dart';
import 'package:nexum_driver/core/network/interceptors/logging_interceptor.dart';

/// Base URL del API de Nexum.
///
/// TODO(backend): Reemplazar con la URL real del servidor cuando esté
/// disponible. En MVP se usa un placeholder — todas las llamadas de red
/// son simuladas con mock data.
const String _kBaseUrl = 'https://api.nexum.com.co/v1';

/// Cliente HTTP centralizado para la app del conductor.
///
/// Singleton que configura un [Dio] con:
/// - Base URL y timeouts estándar.
/// - [AuthInterceptor]: inyecta el JWT en cada petición.
/// - [LoggingInterceptor]: registra tráfico HTTP en modo debug.
///
/// Todos los errores de red se convierten en subclases de [AppException]
/// para que la capa de dominio nunca tenga que importar `dio`.
class DioClient {
  DioClient._()
      : _dio = Dio(
          BaseOptions(
            baseUrl: _kBaseUrl,
            connectTimeout: const Duration(
              milliseconds: AppConstants.connectTimeoutMs,
            ),
            receiveTimeout: const Duration(
              milliseconds: AppConstants.receiveTimeoutMs,
            ),
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          ),
        ) {
    _dio
      ..interceptors.add(AuthInterceptor())
      ..interceptors.add(LoggingInterceptor());
  }

  static final DioClient _instance = DioClient._();

  /// Returns the singleton instance.
  factory DioClient() => _instance;

  final Dio _dio;

  /// Exposes the underlying [Dio] instance for advanced use cases
  /// (e.g. multipart uploads).
  Dio get dio => _dio;

  // ── HTTP verbs ────────────────────────────────────────────────────────────

  /// Performs a GET request to [path] with optional [queryParameters].
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.get<T>(
        path,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioException(e);
    }
  }

  /// Performs a POST request to [path] with an optional [data] body.
  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.post<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioException(e);
    }
  }

  /// Performs a PUT request to [path] with an optional [data] body.
  Future<Response<T>> put<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.put<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioException(e);
    }
  }

  /// Performs a DELETE request to [path].
  Future<Response<T>> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.delete<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioException(e);
    }
  }

  // ── Error handling ────────────────────────────────────────────────────────

  /// Converts a [DioException] into a domain-level [AppException].
  ///
  /// Mapping:
  /// - Connection / send / receive timeout → [NetworkException]
  /// - No internet / connection error      → [NetworkException]
  /// - 4xx / 5xx server responses          → [ServerException] (with status code)
  /// - Anything else                       → [AppException]
  AppException _handleDioException(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return const NetworkException(
          message: 'La solicitud tardó demasiado. Verifica tu conexión.',
          code: 'TIMEOUT',
        );

      case DioExceptionType.connectionError:
        return const NetworkException(
          message: 'Sin conexión a internet. Verifica tu red.',
          code: 'NO_INTERNET',
        );

      case DioExceptionType.badResponse:
        final statusCode = e.response?.statusCode;
        final responseBody = e.response?.data;

        if (statusCode == null) {
          return ServerException(
            message: 'Respuesta del servidor no válida.',
            details: responseBody,
          );
        }

        if (statusCode >= 500) {
          return ServerException(
            message: 'Error en el servidor ($statusCode). Intenta de nuevo.',
            code: 'SERVER_$statusCode',
            details: responseBody,
          );
        }

        if (statusCode == 401) {
          return AuthException(
            message: 'Tu sesión ha expirado. Por favor inicia sesión de nuevo.',
            code: 'UNAUTHORIZED',
            details: responseBody,
          );
        }

        if (statusCode == 404) {
          return NotFoundException(
            message: 'El recurso solicitado no existe ($statusCode).',
            code: 'NOT_FOUND',
          );
        }

        return ServerException(
          message: 'Error del servidor ($statusCode).',
          code: 'HTTP_$statusCode',
          details: responseBody,
        );

      case DioExceptionType.cancel:
        return const AppException(
          message: 'La solicitud fue cancelada.',
          code: 'REQUEST_CANCELLED',
        );

      case DioExceptionType.badCertificate:
        return const NetworkException(
          message: 'Certificado SSL inválido.',
          code: 'BAD_CERTIFICATE',
        );

      case DioExceptionType.unknown:
      default:
        return AppException(
          message: e.message ?? 'Error desconocido de red.',
          code: 'UNKNOWN_NETWORK_ERROR',
          details: e.error,
        );
    }
  }
}
