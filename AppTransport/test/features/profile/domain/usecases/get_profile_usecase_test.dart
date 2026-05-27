import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/core/mock_data/driver_mock.dart';
import 'package:nexum_driver/features/profile/data/datasources/profile_datasource.dart';
import 'package:nexum_driver/features/profile/data/repositories/profile_repository_impl.dart';
import 'package:nexum_driver/features/profile/domain/usecases/get_profile_usecase.dart';

void main() {
  group('GetProfileUseCase', () {
    late GetProfileUseCase useCase;

    setUp(() {
      final dataSource = ProfileMockDataSource();
      final repository = ProfileRepositoryImpl(dataSource);
      useCase = GetProfileUseCase(repository);
    });

    test('Retorna perfil del conductor mock', () async {
      final profile = await useCase.call();

      expect(profile, isNotNull);
      expect(profile.name, equals(DriverMock.name));
      expect(profile.phone, equals(DriverMock.phone));
    });

    test('Conductor tiene nombre correcto: Juan Carlos Villamizar Contreras', () async {
      final profile = await useCase.call();
      expect(profile.name, equals('Juan Carlos Villamizar Contreras'));
    });

    test('Vehículo es Chevrolet Spark GT 2020 placa KGB-742', () async {
      final profile = await useCase.call();
      expect(profile.vehicleBrand, equals('Chevrolet'));
      expect(profile.vehicleModel, equals('Spark GT'));
      expect(profile.vehicleYear, equals(2020));
      expect(profile.vehiclePlate, equals('KGB-742'));
    });

    test('Rating es 4.87', () async {
      final profile = await useCase.call();
      expect(profile.rating, closeTo(4.87, 0.001));
    });

    test('Conductor está verificado', () async {
      final profile = await useCase.call();
      expect(profile.isVerified, isTrue);
    });

    test('vehicleDisplay combina nombre completo y placa', () async {
      final profile = await useCase.call();
      expect(profile.vehicleDisplay, contains('KGB-742'));
      expect(profile.vehicleDisplay, contains('Chevrolet'));
    });

    test('Banco es Bancolombia', () async {
      final profile = await useCase.call();
      expect(profile.bankName, equals('Bancolombia'));
      expect(profile.bankAccountType, equals('Ahorros'));
    });
  });
}
