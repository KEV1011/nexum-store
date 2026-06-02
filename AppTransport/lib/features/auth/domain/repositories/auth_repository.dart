import 'package:dartz/dartz.dart';
import 'package:nexum_driver/core/errors/failures.dart';
import 'package:nexum_driver/features/auth/domain/entities/driver_entity.dart';
import 'package:nexum_driver/features/auth/domain/usecases/register_driver_usecase.dart';

abstract interface class AuthRepository {
  /// Solicita el envío de un OTP al número de teléfono dado.
  Future<({bool success, Failure? failure})> sendOtp(String phoneNumber);

  /// Verifica el OTP ingresado por el conductor.
  Future<({DriverEntity? driver, Failure? failure, bool isRegistered})> verifyOtp({
    required String phoneNumber,
    required String otpCode,
  });

  /// Registra un nuevo conductor con el flujo OTP (legacy).
  Future<Either<Failure, DriverEntity>> registerDriver(
    RegisterDriverParams params,
  );

  /// Cierra la sesión: elimina el token del secure storage.
  Future<void> logout();

  /// Verifica si hay una sesión activa (token válido en secure storage).
  Future<bool> isAuthenticated();

  /// Obtiene el conductor actualmente autenticado.
  Future<DriverEntity?> getCurrentDriver();

  // ── Identifier-based auth ────────────────────────────────────────────────

  /// Verifica si el identificador (email o teléfono) tiene cuenta existente.
  Future<({bool exists, String? role, String? status})> checkIdentifier(
    String identifier,
  );

  /// Autentica con identificador + contraseña.
  Future<Either<Failure, DriverEntity>> loginWithPassword({
    required String identifier,
    required String password,
  });

  /// Registra una nueva cuenta para el rol dado.
  Future<Either<Failure, DriverEntity>> registerWithRole({
    required String identifier,
    required String password,
    required String role,
    required Map<String, dynamic> profileData,
  });
}
