import 'package:nexum_driver/features/auth/domain/entities/user_account_entity.dart';

class AdminUserEntity {
  const AdminUserEntity({
    required this.id,
    required this.fullName,
    required this.identifier,
    required this.role,
    required this.status,
    required this.createdAt,
    this.vehiclePlate,
    this.vehicleType,
    this.companyName,
    this.commissionRate = 0.13,
    this.rejectionReason,
    this.suspensionReason,
  });

  final String id;
  final String fullName;
  final String identifier; // phone or email
  final UserRole role;
  final UserAccountStatus status;
  final DateTime createdAt;
  final String? vehiclePlate;
  final String? vehicleType;
  final String? companyName;

  /// Platform commission (0.0–1.0), default 13 %.
  final double commissionRate;
  final String? rejectionReason;
  final String? suspensionReason;

  AdminUserEntity copyWith({
    UserAccountStatus? status,
    double? commissionRate,
    String? rejectionReason,
    String? suspensionReason,
  }) =>
      AdminUserEntity(
        id: id,
        fullName: fullName,
        identifier: identifier,
        role: role,
        status: status ?? this.status,
        createdAt: createdAt,
        vehiclePlate: vehiclePlate,
        vehicleType: vehicleType,
        companyName: companyName,
        commissionRate: commissionRate ?? this.commissionRate,
        rejectionReason: rejectionReason ?? this.rejectionReason,
        suspensionReason: suspensionReason ?? this.suspensionReason,
      );

  factory AdminUserEntity.fromJson(Map<String, dynamic> j) => AdminUserEntity(
        id: j['id'] as String? ?? '',
        fullName: j['fullName'] as String? ?? '',
        identifier: j['identifier'] as String? ?? '',
        role: UserRole.fromApi(j['role'] as String?),
        status: UserAccountStatus.fromApi(j['status'] as String?),
        createdAt: DateTime.tryParse(j['createdAt'] as String? ?? '') ??
            DateTime.now(),
        vehiclePlate: j['vehiclePlate'] as String?,
        vehicleType: j['vehicleType'] as String?,
        companyName: j['companyName'] as String?,
        commissionRate: (j['commissionRate'] as num?)?.toDouble() ?? 0.13,
        rejectionReason: j['rejectionReason'] as String?,
        suspensionReason: j['suspensionReason'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'identifier': identifier,
        'role': role.apiValue,
        'status': status.name,
        'createdAt': createdAt.toIso8601String(),
        if (vehiclePlate != null) 'vehiclePlate': vehiclePlate,
        if (vehicleType != null) 'vehicleType': vehicleType,
        if (companyName != null) 'companyName': companyName,
        'commissionRate': commissionRate,
        if (rejectionReason != null) 'rejectionReason': rejectionReason,
        if (suspensionReason != null) 'suspensionReason': suspensionReason,
      };
}
