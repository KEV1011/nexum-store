import 'package:nexum_client/core/errors/exceptions.dart' show InvalidOtpException;

/// Interfaz de la fuente de datos de autenticación del cliente.
abstract class AuthDataSource {
  Future<bool> sendOtp(String phoneNumber);

  /// Devuelve `{token, client}` en éxito.
  /// Lanza [InvalidOtpException] si el código es incorrecto.
  Future<Map<String, dynamic>> verifyOtp({
    required String phoneNumber,
    required String otpCode,
  });

  /// Canjea el código del enlace que llegó por WhatsApp.
  ///
  /// El teléfono ya lo verificó Meta, así que no hay OTP que pedir. Devuelve
  /// `{token, client}` igual que [verifyOtp].
  Future<Map<String, dynamic>> redeemMagicLink(String code);
}
