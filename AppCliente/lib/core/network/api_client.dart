import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/constants/app_constants.dart';

// ── Auth interceptor ──────────────────────────────────────────────────────────

class _AuthInterceptor extends Interceptor {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // La lectura del token NUNCA debe bloquear la petición: en algunos
    // dispositivos el almacenamiento seguro (Android Keystore) se cuelga y, sin
    // timeout, el interceptor jamás llamaría a handler.next() → la petición no
    // sale y el login se queda "cargando" para siempre, sin error. Con timeout
    // (y try/catch) la app sigue sin token — el login no lo necesita.
    String? token;
    try {
      token = await _storage
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

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401) {
      // Delete stale token so the router redirects to login.
      _storage.delete(key: AppConstants.authTokenKey);
    }
    handler.next(err);
  }
}

// ── Dio provider ──────────────────────────────────────────────────────────────

final apiClientProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: ApiConfig.baseUrl,
      // Timeouts holgados para tolerar el cold-start del backend (el plan free
      // de Render tarda ~50s en despertar el primer request). En un backend
      // siempre encendido las respuestas son rápidas y nunca se alcanzan.
      connectTimeout: const Duration(seconds: 60),
      receiveTimeout: const Duration(seconds: 60),
      headers: {'Content-Type': 'application/json'},
    ),
  );
  dio.interceptors.add(_AuthInterceptor());
  return dio;
});
