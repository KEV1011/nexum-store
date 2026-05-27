/// Perfil completo del conductor.
class DriverProfileEntity {
  const DriverProfileEntity({
    required this.id,
    required this.name,
    required this.phone,
    required this.rating,
    required this.totalTrips,
    required this.vehicleBrand,
    required this.vehicleModel,
    required this.vehicleYear,
    required this.vehiclePlate,
    required this.vehicleColor,
    required this.documentNumber,
    required this.bankName,
    required this.bankAccountType,
    required this.bankAccountNumber,
    required this.isVerified,
    required this.memberSince,
    this.photoUrl,
  });

  final String id;
  final String name;
  final String phone;
  final double rating;
  final int totalTrips;
  final String vehicleBrand;
  final String vehicleModel;
  final int vehicleYear;
  final String vehiclePlate;
  final String vehicleColor;
  final String documentNumber;
  final String bankName;
  final String bankAccountType;
  final String bankAccountNumber;
  final bool isVerified;
  final DateTime memberSince;
  final String? photoUrl;

  String get vehicleFullName => '$vehicleBrand $vehicleModel $vehicleYear';
  String get vehicleDisplay => '$vehicleFullName · $vehiclePlate';
}
