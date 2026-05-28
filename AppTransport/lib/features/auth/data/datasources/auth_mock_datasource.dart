import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/features/auth/data/datasources/auth_datasource.dart';

class AuthMockDataSource implements AuthDataSource {
  @override
  Future<bool> sendOtp(String phoneNumber) async {
    await Future<void>.delayed(const Duration(milliseconds: 800));
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

    return {
      'token': 'mock-jwt-nexum-demo',
      'driver': {
        'id': 'driver-001',
        'name': 'Juan Carlos Villamizar Contreras',
        'phone': phoneNumber,
        'rating': 4.87,
        'totalTrips': 312,
        'vehicle': {
          'brand': 'Chevrolet',
          'model': 'Spark GT',
          'year': 2020,
          'plate': 'KGB-742',
          'color': 'Blanco perla',
        },
      },
    };
  }
}
