import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/core/mock_data/driver_mock.dart';

/// Fuente de datos mock para autenticación.
///
/// OTP válido hardcoded: 123456 (ver [AppConstants.mockOtpCode]).
/// Simula delays de red realistas (800 ms – 1 200 ms) para que los
/// estados de carga del UI sean visibles durante el desarrollo.
class AuthMockDataSource {
  /// Simula el envío de un OTP al [phoneNumber] dado.
  ///
  /// En modo mock siempre tiene éxito – el OTP "enviado" se imprime en
  /// la consola de debug para facilitar las pruebas manuales.
  Future<bool> sendOtp(String phoneNumber) async {
    // Simular latencia de red
    await Future.delayed(const Duration(milliseconds: 1200));
    // ignore: avoid_print
    print(
      '[AuthMock] OTP enviado a $phoneNumber. '
      'Código de prueba: ${AppConstants.mockOtpCode}',
    );
    return true;
  }

  /// Verifica el [otpCode] recibido del usuario.
  ///
  /// - Si el código coincide con [AppConstants.mockOtpCode] retorna el
  ///   token mock de [DriverMock.mockToken].
  /// - Si el código es incorrecto lanza [InvalidOtpException].
  Future<String> verifyOtp({
    required String phoneNumber,
    required String otpCode,
  }) async {
    await Future.delayed(const Duration(milliseconds: 800));

    if (otpCode != AppConstants.mockOtpCode) {
      throw const InvalidOtpException();
    }

    // ignore: avoid_print
    print(
      '[AuthMock] OTP correcto para $phoneNumber. '
      'Generando token JWT mock...',
    );
    return DriverMock.mockToken;
  }
}
