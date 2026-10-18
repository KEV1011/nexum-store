import 'dart:async' show Completer, TimeoutException, unawaited;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:nexum_client/core/errors/failures.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/services/push_notification_service.dart';
import 'package:nexum_client/features/auth/data/datasources/'
    'auth_datasource.dart';
import 'package:nexum_client/features/auth/data/datasources/'
    'auth_real_datasource.dart';
import 'package:nexum_client/features/auth/data/repositories/auth_repository.dart';
import 'package:nexum_client/features/auth/domain/entities/client_entity.dart';
import 'package:nexum_client/features/auth/presentation/providers/soltar_datos_de_cuenta.dart';
import 'package:nexum_client/shared/providers/origen_sugerido_provider.dart';

// ── Estado sellado ───────────────────────────────────────────────────────────

sealed class AuthState {
  const AuthState();
}

final class AuthInitial extends AuthState {
  const AuthInitial();
}

final class AuthLoading extends AuthState {
  const AuthLoading();
}

final class AuthOtpSent extends AuthState {
  const AuthOtpSent({required this.phone});

  final String phone;
}

final class AuthAuthenticated extends AuthState {
  const AuthAuthenticated({required this.client});

  final ClientEntity client;
}

final class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

final class AuthError extends AuthState {
  const AuthError({required this.failure});

  final Failure failure;
}

// ── Providers de infraestructura ─────────────────────────────────────────────

final _secureStorageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  // App real: siempre backend, también en web. (El mock de demo se retiró;
  // para un demo público sin backend se reintroduciría tras un flag explícito.)
  final AuthDataSource dataSource =
      AuthRealDataSource(dio: ref.watch(apiClientProvider));
  return AuthRepository(
    dataSource: dataSource,
    secureStorage: ref.watch(_secureStorageProvider),
    // Lo cargado en memoria también era de la cuenta anterior.
    alCambiarDeCuenta: () => soltarDatosDeCuenta(ref),
  );
});

/// Provider de diagnóstico — expone el Dio usado en auth para poder mockear
/// en tests sin romper el grafo.
final authDioProvider = Provider<Dio>((ref) => ref.watch(apiClientProvider));

// ── AuthNotifier ─────────────────────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository, this._dio) : super(const AuthInitial()) {
    checkAuth();
  }

  final AuthRepository _repository;
  final Dio _dio;

  final Completer<AuthState> _restaurada = Completer<AuthState>();

  /// Se completa cuando la sesión guardada terminó de leerse.
  ///
  /// Quien decide a dónde ir al arrancar (el splash) TIENE que esperar esto.
  /// Leer `state` sin esperar daba `AuthLoading` —el constructor lo pone antes
  /// del primer `await`— y el splash mandaba al login a alguien con la sesión
  /// intacta: cada vez que el sistema mataba la app en segundo plano y la
  /// persona volvía, le tocaba entrar otra vez con su teléfono y su código.
  ///
  /// Con tiempo de espera porque el almacén seguro de Android se cuelga en
  /// algunos teléfonos; pasado ese tiempo se devuelve el estado que haya, sin
  /// borrar nada: la sesión sigue guardada para el siguiente arranque.
  Future<AuthState> listo({Duration espera = const Duration(seconds: 8)}) {
    return _restaurada.future.timeout(espera, onTimeout: () => state);
  }

  void _marcarRestaurada() {
    if (!_restaurada.isCompleted) _restaurada.complete(state);
  }

  Future<void> sendOtp(String phone) async {
    state = const AuthLoading();
    final result = await _repository.sendOtp(phone);
    if (result.failure != null) {
      state = AuthError(failure: result.failure!);
      return;
    }
    state = AuthOtpSent(phone: phone.trim());
  }

  Future<void> verifyOtp(String phone, String otp) async {
    state = const AuthLoading();
    final result = await _repository.verifyOtp(phone: phone, otpCode: otp);
    if (result.failure != null) {
      state = AuthError(failure: result.failure!);
      return;
    }
    state = AuthAuthenticated(client: result.client!);
    _registerPushToken();
  }

  /// Entra con el código del enlace de WhatsApp.
  ///
  /// Devuelve el motivo del fallo en vez de tragárselo: el pasajero tiene que
  /// saber si el enlace venció, si ya lo usó o si está mal copiado — son tres
  /// arreglos distintos.
  /// Devuelve el motivo del fallo, o el punto de recogida si el pasajero lo
  /// mandó con el botón de ubicación del chat (puede venir en null: entrar sin
  /// origen es lo normal cuando escribió en vez de tocar el botón).
  Future<({String? motivo, OrigenSugerido? origen})> entrarConEnlace(
    String code,
  ) async {
    state = const AuthLoading();
    final result = await _repository.redeemMagicLink(code);
    if (result.failure != null) {
      state = const AuthUnauthenticated();
      return (motivo: result.failure!.message, origen: null);
    }
    state = AuthAuthenticated(client: result.client!);
    _registerPushToken();
    return (motivo: null, origen: result.origen);
  }

  /// Entra con Google o Apple. Devuelve el motivo si falla (null si entró):
  /// la pantalla lo muestra tal cual, porque «esa cuenta fue eliminada» y
  /// «no está disponible todavía» se arreglan distinto.
  Future<String?> entrarConProveedor(
    String proveedor,
    Map<String, dynamic> cuerpo,
  ) async {
    state = const AuthLoading();
    final result = await _repository.entrarConProveedor(proveedor, cuerpo);
    if (result.failure != null) {
      state = const AuthUnauthenticated();
      return result.failure!.message;
    }
    state = AuthAuthenticated(client: result.client!);
    _registerPushToken();
    return null;
  }

  /// Refleja en la sesión el nombre que el pasajero acaba de poner.
  ///
  /// Lo guarda el perfil (`PUT /client/profile`); esto solo actualiza la copia
  /// local para que la app deje de preguntarlo y el saludo del inicio deje de
  /// decir «Pasajero».
  Future<void> nombrePuesto(String nombre) async {
    final s = state;
    if (s is! AuthAuthenticated) return;
    state = AuthAuthenticated(
      client: await _repository.guardarNombre(s.client, nombre),
    );
  }

  Future<void> logout() async {
    await _repository.logout();
    state = const AuthUnauthenticated();
  }

  Future<void> checkAuth() async {
    state = const AuthLoading();
    try {
      final ok = await _repository.isAuthenticated();
      if (!ok) {
        state = const AuthUnauthenticated();
        return;
      }
      final client = await _repository.getStoredClient();
      if (client == null) {
        state = const AuthUnauthenticated();
        return;
      }
      state = AuthAuthenticated(client: client);
      _registerPushToken();
    } on TimeoutException {
      state = const AuthUnauthenticated();
    } finally {
      _marcarRestaurada();
    }
  }

  /// Registra el token FCM del dispositivo en el backend para recibir push
  /// (conductor asignado, pedido en camino, pago aprobado…). Fire-and-forget.
  void _registerPushToken() {
    if (kIsWeb) return;
    unawaited(PushNotificationService().syncTokenToBackend(_dio));
  }
}

// ── Providers públicos ───────────────────────────────────────────────────────

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    ref.watch(authRepositoryProvider),
    ref.watch(apiClientProvider),
  );
});

final currentClientProvider = Provider<ClientEntity?>((ref) {
  final s = ref.watch(authProvider);
  return switch (s) {
    AuthAuthenticated(:final client) => client,
    _ => null,
  };
});
