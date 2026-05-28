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

    // El conductor mock ya está registrado; cualquier otro número es nuevo.
    final isMockDriver = phoneNumber.replaceAll(' ', '') ==
        AppConstants.mockDriverPhone.replaceAll(' ', '');

    if (isMockDriver) {
      return {
        'token': 'mock-jwt-nexum-demo',
        'isRegistered': true,
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

    // Conductor nuevo: token provisional, sin datos de vehículo aún.
    return {
      'token': 'mock-jwt-new-driver-$phoneNumber',
      'isRegistered': false,
      'driver': {
        'id': '',
        'name': '',
        'phone': phoneNumber,
        'rating': 0.0,
        'totalTrips': 0,
        'vehicle': {
          'brand': '',
          'model': '',
          'year': 0,
          'plate': '',
          'color': '',
        },
      },
    };
  }

  @override
  Future<Map<String, dynamic>> registerDriver(
    Map<String, dynamic> data,
  ) async {
    await Future<void>.delayed(const Duration(milliseconds: 900));

    return {
      'token': 'mock-jwt-token-registered',
      'isRegistered': true,
      'driver': {
        'id': 'driver-${DateTime.now().millisecondsSinceEpoch}',
        'name': data['fullName'] as String,
        'phone': data['phone'] as String,
        'rating': 0.0,
        'totalTrips': 0,
        'documentType': data['documentType'] as String,
        'documentNumber': data['documentNumber'] as String,
        'vehicleType': data['vehicleType'] as String,
        'bankName': data['bankName'] as String,
        'bankAccountType': data['bankAccountType'] as String,
        'bankAccountNumber': data['bankAccountNumber'] as String,
        'vehicle': {
          'brand': data['vehicleBrand'] as String,
          'model': data['vehicleModel'] as String,
          'year': data['vehicleYear'] as int,
          'plate': data['vehiclePlate'] as String,
          'color': data['vehicleColor'] as String,
        },
      },
    };
  }
}
