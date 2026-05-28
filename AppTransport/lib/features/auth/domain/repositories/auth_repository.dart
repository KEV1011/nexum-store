import 'package:dartz/dartz.dart';
import 'package:nexum_driver/core/errors/failures.dart';
import 'package:nexum_driver/features/auth/domain/entities/driver_entity.dart';
import 'package:nexum_driver/features/auth/domain/usecases/register_driver_usecase.dart';

/// Interfaz abstracta del repositorio de autenticación.
/// La implementación mock está en data/repositories/auth_repository_impl.dart.
/// Esta interfaz permite reemplazar el mock con llamadas reales HTTP sin
/// modificar la capa de presentación.
abstract interface class AuthRepository {
  /// Solicita el envío de un OTP al número de teléfono dado.
  /// Retorna [Failure] si el número no es válido.
  Future<({bool success, Failure? failure})> sendOtp(String phoneNumber);

  /// Verifica el OTP ingresado por el conductor.
  /// Si es correcto, genera y almacena el JWT.
  /// [isRegistered] indica si debe ir al home o al registro.
  Future<({DriverEntity? driver, Failure? failure, bool isRegistered})> verifyOtp({
    required String phoneNumber,
    required String otpCode,
  });

  /// Registra un nuevo conductor con su información personal, de vehículo y bancaria.
  /// Almacena el JWT resultante y retorna el [DriverEntity] creado o un [Failure].
  Future<Either<Failure, DriverEntity>> registerDriver(
    RegisterDriverParams params,
  );

  /// Cierra la sesión: elimina el token del secure storage.
  Future<void> logout();

  /// Verifica si hay una sesión activa (token válido en secure storage).
  Future<bool> isAuthenticated();

  /// Obtiene el conductor actualmente autenticado.
  Future<DriverEntity?> getCurrentDriver();
}
