import 'package:nexum_driver/core/errors/failures.dart';
import 'package:nexum_driver/features/auth/domain/repositories/auth_repository.dart';

/// Caso de uso: solicitar OTP al número de teléfono.
/// Valida el formato del número colombiano (+57 3XXXXXXXXX).
class SendOtpUseCase {
  const SendOtpUseCase(this._repository);
  final AuthRepository _repository;

  /// Acepta números con o sin espacios internos, e.g.:
  ///   "+573124567890"  →  válido
  ///   "+57 312 456 7890"  →  válido
  static final _colombianPhoneRegex = RegExp(r'^\+573\d{9}$');

  Future<({bool success, Failure? failure})> call(String phoneNumber) async {
    // Normalizar: quitar todos los espacios y guiones opcionales
    final cleaned = phoneNumber.replaceAll(RegExp(r'[\s\-]'), '');
    if (!_colombianPhoneRegex.hasMatch(cleaned)) {
      return (
        success: false,
        failure: const AuthFailure(
          message: 'Ingresa un número de celular colombiano válido (+57 3XXXXXXXXX)',
          code: 'INVALID_PHONE',
        ),
      );
    }
    return _repository.sendOtp(cleaned);
  }
}
