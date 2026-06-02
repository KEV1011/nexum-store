import 'package:nexum_driver/features/auth/domain/entities/user_account_entity.dart';

/// Entidad de dominio del conductor autenticado.
class DriverEntity {
  const DriverEntity({
    required this.id,
    required this.name,
    required this.phone,
    required this.rating,
    required this.totalTrips,
    required this.vehiclePlate,
    required this.vehicleDescription,
    required this.isVerified,
    this.photoUrl,
    this.documentType,
    this.documentNumber,
    this.vehicleType,
    this.bankName,
    this.bankAccountType,
    this.bankAccountNumber,
    this.role,
    this.accountStatus,
    this.email,
  });

  final String id;
  final String name;
  final String phone;
  final double rating;
  final int totalTrips;
  final String vehiclePlate;
  final String vehicleDescription;
  final bool isVerified;
  final String? photoUrl;
  final String? email;

  /// Tipo de documento: 'CC' | 'CE' | 'PA'
  final String? documentType;
  final String? documentNumber;

  /// Tipo de vehículo: 'particular' | 'taxi' | 'moto'
  final String? vehicleType;
  final String? bankName;
  final String? bankAccountType;
  final String? bankAccountNumber;

  /// Role in the platform (driverCar, driverMoto, business).
  final UserRole? role;

  /// Admin-controlled account status.
  final UserAccountStatus? accountStatus;

  DriverEntity copyWith({
    String? id,
    String? name,
    String? phone,
    double? rating,
    int? totalTrips,
    String? vehiclePlate,
    String? vehicleDescription,
    bool? isVerified,
    String? photoUrl,
    String? documentType,
    String? documentNumber,
    String? vehicleType,
    String? bankName,
    String? bankAccountType,
    String? bankAccountNumber,
    UserRole? role,
    UserAccountStatus? accountStatus,
    String? email,
  }) {
    return DriverEntity(
      id: id ?? this.id,
      name: name ?? this.name,
      phone: phone ?? this.phone,
      rating: rating ?? this.rating,
      totalTrips: totalTrips ?? this.totalTrips,
      vehiclePlate: vehiclePlate ?? this.vehiclePlate,
      vehicleDescription: vehicleDescription ?? this.vehicleDescription,
      isVerified: isVerified ?? this.isVerified,
      photoUrl: photoUrl ?? this.photoUrl,
      documentType: documentType ?? this.documentType,
      documentNumber: documentNumber ?? this.documentNumber,
      vehicleType: vehicleType ?? this.vehicleType,
      bankName: bankName ?? this.bankName,
      bankAccountType: bankAccountType ?? this.bankAccountType,
      bankAccountNumber: bankAccountNumber ?? this.bankAccountNumber,
      role: role ?? this.role,
      accountStatus: accountStatus ?? this.accountStatus,
      email: email ?? this.email,
    );
  }

  @override
  String toString() =>
      'DriverEntity(id: $id, name: $name, plate: $vehiclePlate, rating: $rating)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DriverEntity && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}
