import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/errors/exceptions.dart';
import 'package:nexum_client/features/auth/data/datasources/auth_datasource.dart';

/// Fuente de datos mock — válida en demo/web.
///
/// OTP hardcodeado: [AppConstants.mockOtpCode] (123456).
/// Cualquier número de teléfono funciona como cliente válido.
class AuthMockDataSource implements AuthDataSource {
  @override
  Future<bool> sendOtp(String phoneNumber) async {
    await Future<void>.delayed(const Duration(milliseconds: 700));
    return true;
  }

  @override
  Future<Map<String, dynamic>> verifyOtp({
    required String phoneNumber,
    required String otpCode,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 600));

    if (otpCode != AppConstants.mockOtpCode) {
      throw const InvalidOtpException();
    }

    final normalized = phoneNumber.replaceAll(' ', '');
    return {
      'token': 'mock-jwt-client-$normalized',
      'client': {
        'id': 'client-${normalized.hashCode.abs()}',
        'phone': phoneNumber,
        'name': 'Cliente ZIPA',
      },
    };
  }
}
