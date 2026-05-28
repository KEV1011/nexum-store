import 'package:dartz/dartz.dart';
import 'package:nexum_driver/core/errors/failures.dart';
import 'package:nexum_driver/features/auth/domain/entities/driver_entity.dart';
import 'package:nexum_driver/features/auth/domain/repositories/auth_repository.dart';

class RegisterDriverParams {
  const RegisterDriverParams({
    required this.phone,
    required this.fullName,
    required this.documentType,
    required this.documentNumber,
    required this.vehicleBrand,
    required this.vehicleModel,
    required this.vehicleYear,
    required this.vehiclePlate,
    required this.vehicleColor,
    required this.vehicleType,
    required this.bankName,
    required this.bankAccountType,
    required this.bankAccountNumber,
  });

  final String phone;
  final String fullName;
  final String documentType;
  final String documentNumber;
  final String vehicleBrand;
  final String vehicleModel;
  final int vehicleYear;
  final String vehiclePlate;
  final String vehicleColor;
  final String vehicleType;
  final String bankName;
  final String bankAccountType;
  final String bankAccountNumber;

  Map<String, dynamic> toMap() => {
        'phone': phone,
        'fullName': fullName,
        'documentType': documentType,
        'documentNumber': documentNumber,
        'vehicleBrand': vehicleBrand,
        'vehicleModel': vehicleModel,
        'vehicleYear': vehicleYear,
        'vehiclePlate': vehiclePlate,
        'vehicleColor': vehicleColor,
        'vehicleType': vehicleType,
        'bankName': bankName,
        'bankAccountType': bankAccountType,
        'bankAccountNumber': bankAccountNumber,
      };
}

class RegisterDriverUseCase {
  const RegisterDriverUseCase(this._repository);
  final AuthRepository _repository;

  Future<Either<Failure, DriverEntity>> call(RegisterDriverParams params) =>
      _repository.registerDriver(params);
}
