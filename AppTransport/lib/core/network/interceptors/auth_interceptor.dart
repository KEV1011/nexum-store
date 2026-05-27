import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

/// Interceptor de autenticación para el cliente Dio.
///
/// Responsabilidades:
/// 1. Lee el JWT almacenado en [FlutterSecureStorage] antes de cada petición.
/// 2. Inyecta el header `Authorization: Bearer <token>` si el token existe.
/// 3. En caso de respuesta 401 (Unauthorized), borra el token local.
///    TODO(backend): Disparar flujo de re-login cuando exista navegación real.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({FlutterSecureStorage? secureStorage})
      : _secureStorage = secureStorage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _secureStorage;

  // ── Request ───────────────────────────────────────────────────────────────

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _secureStorage.read(key: AppConstants.authTokenKey);

    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }

    handler.next(options);
  }

  // ── Response ──────────────────────────────────────────────────────────────

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    // Pass through successful responses without modification.
    handler.next(response);
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode == 401) {
      // Token expirado o inválido: limpiar credenciales locales.
      await _secureStorage.delete(key: AppConstants.authTokenKey);

      // TODO(backend): Navegar a la pantalla de login cuando exista un
      // NavigationService o GoRouter accesible desde aquí.
      // NavigationService.instance.pushReplacementNamed(Routes.login);
    }

    handler.next(err);
  }
}
