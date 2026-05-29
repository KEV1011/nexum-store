import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:nexum_client/core/errors/failures.dart';
import 'package:nexum_client/features/auth/data/datasources/auth_mock_datasource.dart';
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
  return AuthRepository(
    dataSource: AuthMockDataSource(), // kIsWeb o MVP: siempre mock
    secureStorage: ref.watch(_secureStorageProvider),
  );
});

// ── AuthNotifier ─────────────────────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository) : super(const AuthInitial()) {
    checkAuth();
  }

  final AuthRepository _repository;

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
    // En el MVP el perfil del cliente se regenera desde el token mock.
    state = const AuthAuthenticated(
      client: ClientEntity(
        id: 'client-demo',
        phone: '+57 312 456 7890',
        name: 'Cliente Nexum',
      ),
    );
  }
}

// ── Providers públicos ───────────────────────────────────────────────────────

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authRepositoryProvider));
});

final currentClientProvider = Provider<ClientEntity?>((ref) {
  final state = ref.watch(authProvider);
  return switch (state) {
    AuthAuthenticated(:final client) => client,
    _ => null,
  };
});
