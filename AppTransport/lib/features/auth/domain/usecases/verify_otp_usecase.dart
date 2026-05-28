import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/errors/failures.dart';
import 'package:nexum_driver/features/auth/domain/entities/driver_entity.dart';
import 'package:nexum_driver/features/auth/domain/repositories/auth_repository.dart';

/// Caso de uso: verificar el OTP ingresado por el conductor.
class VerifyOtpUseCase {
  const VerifyOtpUseCase(this._repository);
  final AuthRepository _repository;

  Future<({DriverEntity? driver, Failure? failure, bool isRegistered})> call({
    required String phoneNumber,
    required String otpCode,
  }) async {
    if (otpCode.length != AppConstants.otpLength) {
      return (
        driver: null,
        failure: AuthFailure(
          message: 'El código debe tener ${AppConstants.otpLength} dígitos',
          code: 'OTP_INCOMPLETE',
        ),
        isRegistered: false,
      );
    }
    return _repository.verifyOtp(
      phoneNumber: phoneNumber,
      otpCode: otpCode,
    );
  }
}
