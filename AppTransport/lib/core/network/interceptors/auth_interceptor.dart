import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

/// Interceptor de autenticación para el cliente Dio.
///
/// Responsabilidades:
/// 1. Lee el JWT almacenado en [FlutterSecureStorage] antes de cada petición.
/// 2. Inyecta el header `Authorization: Bearer <token>` si el token existe.
/// 3. En caso de respuesta 401 (Unauthorized), borra el token local y dispara
///    [onSessionExpired] para que la app lleve al conductor al login.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({FlutterSecureStorage? secureStorage})
      : _secureStorage = secureStorage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  /// Hook global de sesión vencida. Lo registra [ZIPADriverApp] al construir
  /// el router (aquí no hay acceso a GoRouter sin acoplar capas).
  static void Function()? onSessionExpired;

  final FlutterSecureStorage _secureStorage;

  // ── Request ───────────────────────────────────────────────────────────────

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // La lectura del token NUNCA debe bloquear la petición: en algunos
    // dispositivos el almacenamiento seguro (Android Keystore) se cuelga y, sin
    // timeout, el interceptor jamás llamaría a handler.next() → la petición no
    // sale y la pantalla se queda "cargando" para siempre, sin error.
    String? token;
    try {
      token = await _secureStorage
          .read(key: AppConstants.authTokenKey)
          .timeout(const Duration(seconds: 5), onTimeout: () => null);
    } catch (_) {
      token = null;
    }

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
    if (tokenRechazado(err.requestOptions, err.response?.statusCode)) {
      // Token expirado o inválido: limpiar credenciales y volver al login.
      await _secureStorage.delete(key: AppConstants.authTokenKey);
      onSessionExpired?.call();
    }

    handler.next(err);
  }
}

/// ¿Este 401 dice que el token GUARDADO ya no vale?
///
/// Solo si la petición LLEVABA el token. Una petición que salió sin él —porque
/// el almacén seguro tardó al volver del segundo plano y la lectura agotó su
/// tiempo— también recibe 401, y antes eso borraba un token válido y sacaba al
/// conductor al login a mitad de turno.
bool tokenRechazado(RequestOptions peticion, int? status) {
  if (status != 401) return false;
  final auth = peticion.headers['Authorization'];
  return auth is String && auth.startsWith('Bearer ') && auth.length > 7;
}
