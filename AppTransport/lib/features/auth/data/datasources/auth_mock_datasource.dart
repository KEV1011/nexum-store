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
          'role': 'driver_car',
          'accountStatus': 'approved',
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

    return {
      'token': 'mock-jwt-new-driver-$phoneNumber',
      'isRegistered': false,
      'driver': {
        'id': '',
        'name': '',
        'phone': phoneNumber,
        'rating': 0.0,
        'totalTrips': 0,
        'vehicle': {'brand': '', 'model': '', 'year': 0, 'plate': '', 'color': ''},
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
        'role': 'driver_car',
        'accountStatus': 'pending',
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

  // ── Identifier-based auth ────────────────────────────────────────────────

  @override
  Future<({bool exists, String? role, String? status})> checkIdentifier(
    String identifier,
  ) async {
    await Future<void>.delayed(const Duration(milliseconds: 600));

    final normalized = identifier.replaceAll(' ', '');
    final mockPhone = AppConstants.mockDriverPhone.replaceAll(' ', '');

    // Mock admin identifier
    if (normalized == 'admin@nexum.co' || normalized == 'admin') {
      return (exists: true, role: 'admin', status: 'approved');
    }

    if (normalized == mockPhone ||
        normalized == '+57${mockPhone.replaceAll('+57', '')}') {
      return (exists: true, role: 'driver_car', status: 'approved');
    }

    return (exists: false, role: null, status: null);
  }

  @override
  Future<Map<String, dynamic>> loginWithPassword({
    required String identifier,
    required String password,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 800));

    final normalized = identifier.replaceAll(' ', '');

    if (normalized == 'admin@nexum.co' || normalized == 'admin') {
      return {
        'token': 'mock-admin-jwt',
        'isRegistered': true,
        'driver': {
          'id': 'admin-001',
          'name': 'Admin Nexum',
          'phone': '+57 300 000 0000',
          'email': 'admin@nexum.co',
          'rating': 5.0,
          'totalTrips': 0,
          'role': 'admin',
          'accountStatus': 'approved',
          'vehicle': {'brand': '', 'model': '', 'year': 0, 'plate': '', 'color': ''},
        },
      };
    }

    final mockPhone = AppConstants.mockDriverPhone.replaceAll(' ', '');
    if (normalized == mockPhone ||
        normalized == '+57${mockPhone.replaceAll('+57', '')}') {
      return {
        'token': 'mock-jwt-nexum-demo',
        'isRegistered': true,
        'driver': {
          'id': 'driver-001',
          'name': 'Juan Carlos Villamizar Contreras',
          'phone': identifier,
          'rating': 4.87,
          'totalTrips': 312,
          'role': 'driver_car',
          'accountStatus': 'approved',
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

    throw const AuthException(
      message: 'Credenciales incorrectas.',
      code: 'INVALID_CREDENTIALS',
    );
  }

  @override
  Future<Map<String, dynamic>> registerWithRole({
    required String identifier,
    required String password,
    required String role,
    required Map<String, dynamic> profileData,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 1000));

    final name = profileData['fullName'] as String? ??
        profileData['companyName'] as String? ??
        'Usuario';

    return {
      'token': 'mock-jwt-role-registered-${DateTime.now().millisecondsSinceEpoch}',
      'isRegistered': true,
      'driver': {
        'id': 'user-${DateTime.now().millisecondsSinceEpoch}',
        'name': name,
        'phone': identifier.contains('@') ? '' : identifier,
        'email': identifier.contains('@') ? identifier : null,
        'rating': 0.0,
        'totalTrips': 0,
        'role': role,
        'accountStatus': 'pending',
        'vehicle': {
          'brand': profileData['vehicleBrand'] as String? ?? '',
          'model': profileData['vehicleModel'] as String? ?? '',
          'year': (profileData['vehicleYear'] as num?)?.toInt() ?? 0,
          'plate': profileData['vehiclePlate'] as String? ?? '',
          'color': profileData['vehicleColor'] as String? ?? '',
        },
        ...profileData,
      },
    };
  }
}
