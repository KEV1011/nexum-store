import 'package:flutter/material.dart';

/// Verification state of a single required document.
enum DocumentStatus {
  missing,
  pending,
  approved,
  rejected;

  static DocumentStatus fromApi(String? s) {
    switch ((s ?? '').toUpperCase()) {
      case 'APPROVED':
        return DocumentStatus.approved;
      case 'PENDING':
        return DocumentStatus.pending;
      case 'REJECTED':
        return DocumentStatus.rejected;
      default:
        return DocumentStatus.missing;
    }
  }

  String get label {
    switch (this) {
      case DocumentStatus.approved:
        return 'Aprobado';
      case DocumentStatus.pending:
        return 'En revisión';
      case DocumentStatus.rejected:
        return 'Rechazado';
      case DocumentStatus.missing:
        return 'Pendiente';
    }
  }

  Color get color {
    switch (this) {
      case DocumentStatus.approved:
        return const Color(0xFF00C853);
      case DocumentStatus.pending:
        return const Color(0xFFFF9800);
      case DocumentStatus.rejected:
        return const Color(0xFFE53935);
      case DocumentStatus.missing:
        return const Color(0xFF9E9E9E);
    }
  }

  IconData get icon {
    switch (this) {
      case DocumentStatus.approved:
        return Icons.verified_rounded;
      case DocumentStatus.pending:
        return Icons.hourglass_top_rounded;
      case DocumentStatus.rejected:
        return Icons.error_rounded;
      case DocumentStatus.missing:
        return Icons.upload_file_rounded;
    }
  }
}

class DriverDocument {
  const DriverDocument({
    required this.type,
    required this.label,
    required this.fileUrl,
    required this.status,
    this.expiresAt,
    this.rejectionReason,
  });

  final String type;
  final String label;
  final String fileUrl;
  final DocumentStatus status;
  final String? expiresAt;
  final String? rejectionReason;

  factory DriverDocument.fromJson(Map<String, dynamic> j) => DriverDocument(
        type: j['type'] as String? ?? '',
        label: j['label'] as String? ?? '',
        fileUrl: j['fileUrl'] as String? ?? '',
        status: DocumentStatus.fromApi(j['status'] as String?),
        expiresAt: j['expiresAt'] as String?,
        rejectionReason: j['rejectionReason'] as String?,
      );
}

class DriverProfileEntity {
  const DriverProfileEntity({
    required this.driverId,
    required this.fullName,
    required this.phone,
    required this.rating,
    required this.totalTrips,
    required this.vehicleDescription,
    this.vehicleType,
    required this.memberSince,
    required this.isVerified,
    required this.documents,
    required this.requiredDocsCount,
    required this.approvedDocsCount,
    this.verificationRequired = true,
    this.complianceStatus = 'CLEAR',
    this.blockedReason,
    this.photoUrl,
    this.bio,
  });

  final String driverId;
  final String fullName;
  final String phone;
  final double rating;
  final int totalTrips;
  final String vehicleDescription;

  /// Tipo REAL del vehículo activo (PARTICULAR|TAXI|MOTO|TURBO|CAMION|MULA)
  /// — decide el ícono ilustrado en el mapa del viaje activo.
  final String? vehicleType;
  final String memberSince;
  final bool isVerified;
  /// false en modo piloto: la app permite conectarse sin esperar aprobación.
  final bool verificationRequired;

  /// Kill-switch documental: 'CLEAR' | 'EXPIRING' | 'BLOCKED'.
  /// BLOCKED = documento obligatorio vencido → banner rojo + Conectarse
  /// deshabilitado (el backend además rechaza el online con enforce activo).
  final String complianceStatus;
  final String? blockedReason;

  final List<DriverDocument> documents;
  final int requiredDocsCount;
  final int approvedDocsCount;
  final String? photoUrl;
  final String? bio;

  factory DriverProfileEntity.fromJson(Map<String, dynamic> j) =>
      DriverProfileEntity(
        driverId: j['driverId'] as String? ?? '',
        fullName: j['fullName'] as String? ?? 'Conductor',
        phone: j['phone'] as String? ?? '',
        rating: (j['rating'] as num?)?.toDouble() ?? 5.0,
        totalTrips: (j['totalTrips'] as num?)?.toInt() ?? 0,
        vehicleDescription: j['vehicleDescription'] as String? ?? '',
        vehicleType: j['vehicleType'] as String?,
        memberSince: j['memberSince'] as String? ?? '',
        isVerified: j['isVerified'] as bool? ?? false,
        verificationRequired: j['verificationRequired'] as bool? ?? true,
        complianceStatus: j['complianceStatus'] as String? ?? 'CLEAR',
        blockedReason: j['blockedReason'] as String?,
        documents: (j['documents'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(DriverDocument.fromJson)
            .toList(),
        requiredDocsCount: (j['requiredDocsCount'] as num?)?.toInt() ?? 0,
        approvedDocsCount: (j['approvedDocsCount'] as num?)?.toInt() ?? 0,
        photoUrl: j['photoUrl'] as String?,
        bio: j['bio'] as String?,
      );
}
