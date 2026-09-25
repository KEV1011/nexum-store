import 'package:dio/dio.dart';
import 'package:nexum_driver/core/config/api_config.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/core/network/interceptors/auth_interceptor.dart';
import 'package:nexum_driver/core/network/interceptors/logging_interceptor.dart';

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
            baseUrl: ApiConfig.baseUrl,
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

  /// Performs a PATCH request to [path] with an optional [data] body.
  Future<Response<T>> patch<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.patch<T>(
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

  /// El motivo que MANDÓ el servidor, si lo mandó.
  ///
  /// Todas las rutas del backend responden `{ success, error }` con el motivo
  /// escrito en español y pensado para leerse («Placa inválida. Usa el formato
  /// colombiano: ABC123…»). Esta clase los tiraba a la basura y enseñaba
  /// «Error del servidor (400).», así que el conductor veía que algo falló y
  /// no qué — el registro se quedaba trabado sin una sola pista, ni para él ni
  /// para soporte.
  ///
  /// Solo se usa en los 4xx: un 5xx trae el mensaje de una excepción interna
  /// (rutas que hacen `error: err.message`), y enseñar el texto de un fallo de
  /// base de datos no ayuda a nadie y filtra cómo estamos hechos por dentro.
  static String? _motivoDelServidor(dynamic body) {
    if (body is! Map) return null;
    for (final clave in const ['error', 'message']) {
      final v = body[clave];
      // Hay respuestas donde `error` es un objeto; solo sirve el texto.
      if (v is String && v.trim().isNotEmpty) {
        final t = v.trim();
        // Un mensaje larguísimo en un snackbar se corta y no dice nada; a
        // partir de ahí es un volcado, no un motivo.
        return t.length > 300 ? '${t.substring(0, 299)}…' : t;
      }
    }
    return null;
  }

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

        final motivo = _motivoDelServidor(responseBody);

        if (statusCode == 404) {
          return NotFoundException(
            message: motivo ?? 'El recurso solicitado no existe ($statusCode).',
            code: 'NOT_FOUND',
          );
        }

        return ServerException(
          message: motivo ?? 'Error del servidor ($statusCode).',
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
