import 'dart:async' show unawaited;

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

  Future<void> logout() async {
    await _repository.logout();
    state = const AuthUnauthenticated();
  }

  Future<void> checkAuth() async {
    state = const AuthLoading();
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
