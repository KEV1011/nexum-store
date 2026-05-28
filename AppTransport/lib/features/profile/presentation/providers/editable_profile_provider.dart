import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/mock_data/driver_mock.dart';

/// Perfil editable del conductor en memoria (fase MVP, sin backend).
///
/// Se siembra con los valores de [DriverMock] y permite que el conductor
/// edite su identidad y los datos de su vehículo durante la sesión.
class EditableProfile {
  const EditableProfile({
    required this.firstName,
    required this.lastName,
    required this.phone,
    required this.email,
    required this.vehicleBrand,
    required this.vehicleModel,
    required this.vehicleYear,
    required this.vehiclePlate,
    required this.vehicleColor,
    required this.vehicleType,
  });

  factory EditableProfile.fromMock() => const EditableProfile(
        firstName: DriverMock.firstName,
        lastName: DriverMock.lastName,
        phone: DriverMock.phone,
        email: DriverMock.email,
        vehicleBrand: DriverMock.vehicleBrand,
        vehicleModel: DriverMock.vehicleModel,
        vehicleYear: DriverMock.vehicleYear,
        vehiclePlate: DriverMock.vehiclePlate,
        vehicleColor: DriverMock.vehicleColor,
        vehicleType: DriverMock.vehicleType,
      );

  final String firstName;
  final String lastName;
  final String phone;
  final String email;
  final String vehicleBrand;
  final String vehicleModel;
  final int vehicleYear;
  final String vehiclePlate;
  final String vehicleColor;
  final String vehicleType;

  String get fullName => '$firstName $lastName';

  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+'));
    return parts
        .take(2)
        .where((p) => p.isNotEmpty)
        .map((p) => p[0])
        .join()
        .toUpperCase();
  }

  EditableProfile copyWith({
    String? firstName,
    String? lastName,
    String? phone,
    String? email,
    String? vehicleBrand,
    String? vehicleModel,
    int? vehicleYear,
    String? vehiclePlate,
    String? vehicleColor,
    String? vehicleType,
  }) {
    return EditableProfile(
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      vehicleBrand: vehicleBrand ?? this.vehicleBrand,
      vehicleModel: vehicleModel ?? this.vehicleModel,
      vehicleYear: vehicleYear ?? this.vehicleYear,
      vehiclePlate: vehiclePlate ?? this.vehiclePlate,
      vehicleColor: vehicleColor ?? this.vehicleColor,
      vehicleType: vehicleType ?? this.vehicleType,
    );
  }
}

class EditableProfileNotifier extends StateNotifier<EditableProfile> {
  EditableProfileNotifier() : super(EditableProfile.fromMock());

  void updateIdentity({
    required String firstName,
    required String lastName,
    required String phone,
    required String email,
  }) {
    state = state.copyWith(
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email.trim(),
    );
  }

  void updateVehicle({
    required String brand,
    required String model,
    required int year,
    required String plate,
    required String color,
    required String type,
  }) {
    state = state.copyWith(
      vehicleBrand: brand.trim(),
      vehicleModel: model.trim(),
      vehicleYear: year,
      vehiclePlate: plate.trim().toUpperCase(),
      vehicleColor: color.trim(),
      vehicleType: type.trim(),
    );
  }
}

/// Proveedor del perfil editable del conductor.
final editableProfileProvider =
    StateNotifierProvider<EditableProfileNotifier, EditableProfile>((ref) {
  return EditableProfileNotifier();
});
