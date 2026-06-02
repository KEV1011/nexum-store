import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:nexum_driver/core/errors/failures.dart';
import 'package:nexum_driver/features/auth/data/datasources/auth_mock_datasource.dart';
import 'package:nexum_driver/features/auth/data/datasources/auth_remote_datasource.dart';
import 'package:nexum_driver/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:nexum_driver/features/auth/domain/entities/driver_entity.dart';
import 'package:nexum_driver/features/auth/domain/usecases/register_driver_usecase.dart';
import 'package:nexum_driver/features/auth/domain/usecases/send_otp_usecase.dart';
import 'package:nexum_driver/features/auth/domain/usecases/verify_otp_usecase.dart';

// ── Auth State ───────────────────────────────────────────────────────────────

/// Estado sellado de autenticación.
/// Cada subclase representa un estado concreto del flujo de auth.
sealed class AuthState {
  const AuthState();
}

/// Estado inicial antes de cualquier interacción.
final class AuthInitial extends AuthState {
  const AuthInitial();
}

/// Operación en progreso (envío OTP, verificación, logout, etc.)
final class AuthLoading extends AuthState {
  const AuthLoading();
}

/// OTP enviado correctamente; esperando que el usuario ingrese el código.
final class AuthOtpSent extends AuthState {
  const AuthOtpSent({required this.phone});

  /// Número de teléfono al que se envió el OTP (con prefijo +57).
  final String phone;
}

/// Conductor autenticado correctamente.
final class AuthAuthenticated extends AuthState {
  const AuthAuthenticated({required this.driver});

  final DriverEntity driver;
}

/// Error ocurrido durante alguna operación de auth.
final class AuthError extends AuthState {
  const AuthError({required this.failure});

  final Failure failure;
}

/// OTP verificado pero el conductor no está registrado aún.
final class AuthRegistrationRequired extends AuthState {
  const AuthRegistrationRequired({required this.phone});
  final String phone;
}

/// Sesión cerrada o no existe sesión activa.
final class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

/// Identificador verificado — cuenta existente, lista para ingresar contraseña.
final class AuthIdentifierFound extends AuthState {
  const AuthIdentifierFound({required this.identifier, this.role, this.status});
  final String identifier;
  final String? role;
  final String? status;
}

/// Identificador verificado — cuenta no existe, redirigir a selección de rol.
final class AuthIdentifierNotFound extends AuthState {
  const AuthIdentifierNotFound({required this.identifier});
  final String identifier;
}

// ── Infrastructure providers ─────────────────────────────────────────────────

/// Proveedor de [FlutterSecureStorage] con opciones óptimas por plataforma.
final _secureStorageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );
});

/// Proveedor del repositorio de autenticación.
/// En web (GitHub Pages demo) usa mock; en Android/iOS usa el backend real.
final authRepositoryProvider = Provider<AuthRepositoryImpl>((ref) {
  return AuthRepositoryImpl(
    dataSource: kIsWeb ? AuthMockDataSource() : AuthRemoteDataSource(),
    secureStorage: ref.watch(_secureStorageProvider),
  );
});

// ── Use case providers ────────────────────────────────────────────────────────

final _sendOtpUseCaseProvider = Provider<SendOtpUseCase>((ref) {
  return SendOtpUseCase(ref.watch(authRepositoryProvider));
});

final _verifyOtpUseCaseProvider = Provider<VerifyOtpUseCase>((ref) {
  return VerifyOtpUseCase(ref.watch(authRepositoryProvider));
});

final _registerDriverUseCaseProvider = Provider<RegisterDriverUseCase>((ref) {
  return RegisterDriverUseCase(ref.watch(authRepositoryProvider));
});

// ── AuthNotifier ──────────────────────────────────────────────────────────────

/// Notifier central para el flujo de autenticación de conductores.
///
/// Expone los métodos:
/// - [sendOtp]    → envía el OTP al número dado
/// - [verifyOtp]  → verifica el código y autentica al conductor
/// - [logout]     → cierra la sesión
/// - [checkAuth]  → comprueba si hay una sesión activa al arrancar la app
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier({
    required AuthRepositoryImpl repository,
    required SendOtpUseCase sendOtpUseCase,
    required VerifyOtpUseCase verifyOtpUseCase,
    required RegisterDriverUseCase registerDriverUseCase,
  })  : _repository = repository,
        _sendOtpUseCase = sendOtpUseCase,
        _verifyOtpUseCase = verifyOtpUseCase,
        _registerDriverUseCase = registerDriverUseCase,
        super(const AuthInitial());

  final AuthRepositoryImpl _repository;
  final SendOtpUseCase _sendOtpUseCase;
  final VerifyOtpUseCase _verifyOtpUseCase;
  final RegisterDriverUseCase _registerDriverUseCase;

  // ── sendOtp ────────────────────────────────────────────────────────────────

  /// Solicita el envío de OTP al [phone] dado.
  ///
  /// Emite [AuthLoading] → [AuthOtpSent] | [AuthError].
  Future<void> sendOtp(String phone) async {
    state = const AuthLoading();

    final result = await _sendOtpUseCase(phone);

    if (result.failure != null) {
      state = AuthError(failure: result.failure!);
      return;
    }

    // Normalize the phone for display (strip extra spaces)
    final normalizedPhone = phone.trim();
    state = AuthOtpSent(phone: normalizedPhone);
  }

  // ── verifyOtp ──────────────────────────────────────────────────────────────

  /// Verifica el [otp] para el [phone] dado.
  ///
  /// Emite [AuthLoading] → [AuthAuthenticated] | [AuthError].
  Future<void> verifyOtp(String phone, String otp) async {
    state = const AuthLoading();

    final result = await _verifyOtpUseCase(
      phoneNumber: phone,
      otpCode: otp,
    );

    if (result.failure != null) {
      state = AuthError(failure: result.failure!);
      return;
    }

    if (!result.isRegistered) {
      state = AuthRegistrationRequired(phone: phone);
      return;
    }

    state = AuthAuthenticated(driver: result.driver!);
  }

  // ── registerDriver ─────────────────────────────────────────────────────────

  /// Completa el registro del nuevo conductor con sus datos.
  ///
  /// Emite [AuthLoading] → [AuthAuthenticated] | [AuthError].
  Future<void> registerDriver(RegisterDriverParams params) async {
    state = const AuthLoading();

    final result = await _registerDriverUseCase(params);

    result.fold(
      (failure) => state = AuthError(failure: failure),
      (driver) => state = AuthAuthenticated(driver: driver),
    );
  }

  // ── checkIdentifier ────────────────────────────────────────────────────────

  /// Verifica si el identificador tiene cuenta.
  ///
  /// Emite [AuthLoading] → [AuthIdentifierFound] | [AuthIdentifierNotFound].
  Future<void> checkIdentifier(String identifier) async {
    state = const AuthLoading();
    final result = await _repository.checkIdentifier(identifier);
    if (result.exists) {
      state = AuthIdentifierFound(
        identifier: identifier,
        role: result.role,
        status: result.status,
      );
    } else {
      state = AuthIdentifierNotFound(identifier: identifier);
    }
  }

  // ── loginWithPassword ──────────────────────────────────────────────────────

  /// Autentica con identificador + contraseña.
  ///
  /// Emite [AuthLoading] → [AuthAuthenticated] | [AuthError].
  Future<void> loginWithPassword({
    required String identifier,
    required String password,
  }) async {
    state = const AuthLoading();
    final result = await _repository.loginWithPassword(
      identifier: identifier,
      password: password,
    );
    result.fold(
      (failure) => state = AuthError(failure: failure),
      (driver) => state = AuthAuthenticated(driver: driver),
    );
  }

  // ── registerWithRole ───────────────────────────────────────────────────────

  /// Registra con rol. Emite [AuthLoading] → [AuthAuthenticated] | [AuthError].
  Future<void> registerWithRole({
    required String identifier,
    required String password,
    required String role,
    required Map<String, dynamic> profileData,
  }) async {
    state = const AuthLoading();
    final result = await _repository.registerWithRole(
      identifier: identifier,
      password: password,
      role: role,
      profileData: profileData,
    );
    result.fold(
      (failure) => state = AuthError(failure: failure),
      (driver) => state = AuthAuthenticated(driver: driver),
    );
  }

  // ── logout ─────────────────────────────────────────────────────────────────

  /// Cierra la sesión actual y emite [AuthUnauthenticated].
  Future<void> logout() async {
    await _repository.logout();
    state = const AuthUnauthenticated();
  }

  // ── checkAuth ──────────────────────────────────────────────────────────────

  /// Comprueba si hay una sesión válida en el secure storage al arrancar la app.
  ///
  /// Emite [AuthAuthenticated] si hay token válido, o [AuthUnauthenticated].
  Future<void> checkAuth() async {
    state = const AuthLoading();

    final isAuth = await _repository.isAuthenticated();
    if (!isAuth) {
      state = const AuthUnauthenticated();
      return;
    }

    final driver = await _repository.getCurrentDriver();
    if (driver == null) {
      state = const AuthUnauthenticated();
      return;
    }

    state = AuthAuthenticated(driver: driver);
  }
}

// ── Public providers ──────────────────────────────────────────────────────────

/// Proveedor principal del estado de autenticación.
///
/// Úsalo en la UI con `ref.watch(authProvider)` para reaccionar a cambios.
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    repository: ref.watch(authRepositoryProvider),
    sendOtpUseCase: ref.watch(_sendOtpUseCaseProvider),
    verifyOtpUseCase: ref.watch(_verifyOtpUseCaseProvider),
    registerDriverUseCase: ref.watch(_registerDriverUseCaseProvider),
  );
});

/// Proveedor derivado: retorna el [DriverEntity] si el estado es [AuthAuthenticated],
/// o `null` en cualquier otro caso.
final currentDriverProvider = Provider<DriverEntity?>((ref) {
  final authState = ref.watch(authProvider);
  return switch (authState) {
    AuthAuthenticated(:final driver) => driver,
    _ => null,
  };
});
