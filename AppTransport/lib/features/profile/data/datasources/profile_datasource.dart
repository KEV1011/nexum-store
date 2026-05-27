import 'package:nexum_driver/core/mock_data/driver_mock.dart';
import 'package:nexum_driver/features/profile/domain/entities/driver_profile_entity.dart';

/// Fuente de datos mock para el perfil del conductor.
/// Retorna los datos de Juan Carlos Villamizar Contreras.
class ProfileMockDataSource {
  Future<DriverProfileEntity> getProfile() async {
    await Future.delayed(const Duration(milliseconds: 300));
    return DriverProfileEntity(
      id: DriverMock.id,
      name: DriverMock.name,
      phone: DriverMock.phone,
      rating: DriverMock.rating,
      totalTrips: DriverMock.totalTrips,
      vehicleBrand: DriverMock.vehicleBrand,
      vehicleModel: DriverMock.vehicleModel,
      vehicleYear: DriverMock.vehicleYear,
      vehiclePlate: DriverMock.vehiclePlate,
      vehicleColor: DriverMock.vehicleColor,
      documentNumber: DriverMock.documentNumber,
      bankName: DriverMock.bankName,
      bankAccountType: DriverMock.bankAccountType,
      bankAccountNumber: DriverMock.bankAccountNumber,
      isVerified: DriverMock.isVerified,
      memberSince: DateTime(2024, 3, 15),
      photoUrl: DriverMock.photoUrl,
    );
  }
}
