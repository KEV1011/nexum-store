import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/mock_data/driver_mock.dart';
import 'package:nexum_driver/core/network/dio_client.dart';

/// Afiliación del conductor a una empresa/operador (taxi o intermunicipal).
/// Ausente = conductor independiente.
class DriverAffiliation {
  const DriverAffiliation({
    required this.operatorId,
    required this.legalName,
    required this.type,
    required this.status,
    required this.isVerified,
    required this.employmentType,
  });

  factory DriverAffiliation.fromJson(Map<String, dynamic> json) {
    return DriverAffiliation(
      operatorId: json['operatorId'] as String? ?? '',
      legalName: json['legalName'] as String? ?? 'Empresa',
      type: json['type'] as String? ?? 'TAXI',
      status: json['status'] as String? ?? 'PENDING',
      isVerified: json['isVerified'] as bool? ?? false,
      employmentType: json['employmentType'] as String? ?? 'AFFILIATED',
    );
  }

  final String operatorId;
  final String legalName;
  final String type; // TAXI | INTERCITY | MIXED
  final String status; // PENDING | ACTIVE | SUSPENDED
  final bool isVerified;
  final String employmentType; // OWN | AFFILIATED

  /// La empresa está habilitada y verificada por Nexum.
  bool get isActiveVerified => isVerified && status == 'ACTIVE';

  String get typeLabel {
    switch (type) {
      case 'INTERCITY':
        return 'Intermunicipal';
      case 'MIXED':
        return 'Taxi e intermunicipal';
      default:
        return 'Taxi';
    }
  }
}

/// Perfil del conductor mostrado y editable en la pantalla de perfil.
///
/// Se siembra con [DriverMock] para que la pantalla pinte de inmediato y, al
/// construirse el notifier, se reemplaza con el perfil REAL del backend
/// (`GET /driver/profile`). La edición de identidad/vehículo permanece local
/// (MVP): el backend aún no persiste ese formulario.
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
    required this.rating,
    required this.totalTrips,
    required this.isVerified,
    required this.documentNumber,
    required this.bankName,
    required this.bankAccountType,
    required this.bankAccountNumber,
    this.affiliation,
    this.photoUrl,
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
        rating: DriverMock.rating,
        totalTrips: DriverMock.totalTrips,
        isVerified: DriverMock.isVerified,
        documentNumber: DriverMock.documentNumber,
        bankName: DriverMock.bankName,
        bankAccountType: DriverMock.bankAccountType,
        bankAccountNumber: DriverMock.bankAccountNumber,
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
  final double rating;
  final int totalTrips;
  final bool isVerified;
  final String documentNumber;
  final String bankName;
  final String bankAccountType;
  final String bankAccountNumber;
  final DriverAffiliation? affiliation;

  /// URL del avatar subido al backend (null = sin foto, se muestran iniciales).
  final String? photoUrl;

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
    double? rating,
    int? totalTrips,
    bool? isVerified,
    String? documentNumber,
    String? bankName,
    String? bankAccountType,
    String? bankAccountNumber,
    DriverAffiliation? affiliation,
    String? photoUrl,
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
      rating: rating ?? this.rating,
      totalTrips: totalTrips ?? this.totalTrips,
      isVerified: isVerified ?? this.isVerified,
      documentNumber: documentNumber ?? this.documentNumber,
      bankName: bankName ?? this.bankName,
      bankAccountType: bankAccountType ?? this.bankAccountType,
      bankAccountNumber: bankAccountNumber ?? this.bankAccountNumber,
      affiliation: affiliation ?? this.affiliation,
      photoUrl: photoUrl ?? this.photoUrl,
    );
  }
}

class EditableProfileNotifier extends StateNotifier<EditableProfile> {
  EditableProfileNotifier(this._client) : super(EditableProfile.fromMock()) {
    _load();
  }

  final DioClient _client;

  /// Carga el perfil REAL del backend y reemplaza el seed mock. Si falla (sin
  /// conexión), se conserva el seed para que la pantalla no quede vacía.
  Future<void> _load() async {
    try {
      final res = await _client.get<Map<String, dynamic>>('/driver/profile');
      final d = res.data?['data'] as Map<String, dynamic>?;
      if (d == null || !mounted) return;

      final fullName = (d['fullName'] as String?)?.trim() ?? '';
      final parts = fullName.isEmpty ? <String>[] : fullName.split(RegExp(r'\s+'));
      final firstName = parts.isNotEmpty ? parts.first : state.firstName;
      final lastName = parts.length > 1 ? parts.sublist(1).join(' ') : '';

      final affiliationJson = d['affiliation'] as Map<String, dynamic>?;
      final affiliation =
          affiliationJson != null ? DriverAffiliation.fromJson(affiliationJson) : null;

      state = state.copyWith(
        firstName: firstName,
        lastName: lastName,
        phone: d['phone'] as String? ?? state.phone,
        rating: (d['rating'] as num?)?.toDouble() ?? state.rating,
        totalTrips: (d['totalTrips'] as num?)?.toInt() ?? state.totalTrips,
        isVerified: d['isVerified'] as bool? ?? state.isVerified,
        documentNumber: d['documentNumber'] as String? ?? state.documentNumber,
        bankName: d['bankName'] as String? ?? state.bankName,
        bankAccountType: d['bankAccountType'] as String? ?? state.bankAccountType,
        bankAccountNumber:
            d['bankAccountNumber'] as String? ?? state.bankAccountNumber,
        vehicleBrand: d['vehicleBrand'] as String? ?? state.vehicleBrand,
        vehicleModel: d['vehicleModel'] as String? ?? state.vehicleModel,
        vehicleYear: (d['vehicleYear'] as num?)?.toInt() ?? state.vehicleYear,
        vehiclePlate: d['vehiclePlate'] as String? ?? state.vehiclePlate,
        vehicleColor: d['vehicleColor'] as String? ?? state.vehicleColor,
        vehicleType: d['vehicleType'] as String? ?? state.vehicleType,
        affiliation: affiliation,
        photoUrl: d['photoUrl'] as String?,
      );
    } catch (_) {
      // Sin conexión: se conserva el seed mock.
    }
  }

  /// Sube el avatar al backend (multipart, bytes para funcionar también en
  /// web) y actualiza el estado con la URL persistida. Devuelve `null` si todo
  /// salió bien o el mensaje de error para mostrar al usuario.
  Future<String?> uploadPhoto(Uint8List bytes, String filename) async {
    try {
      final formData = FormData.fromMap({
        'file': MultipartFile.fromBytes(
          bytes,
          filename: filename,
          contentType: _mediaTypeFor(filename),
        ),
      });
      final res = await _client.dio.post<Map<String, dynamic>>(
        '/driver/profile/photo',
        data: formData,
      );
      final d = res.data?['data'] as Map<String, dynamic>?;
      final url = d?['photoUrl'] as String?;
      if (url != null && mounted) {
        state = state.copyWith(photoUrl: url);
      }
      return null;
    } on DioException catch (e) {
      return (e.response?.data as Map?)?['error'] as String? ??
          'No se pudo subir la foto. Revisa tu conexión.';
    } catch (_) {
      return 'No se pudo subir la foto. Revisa tu conexión.';
    }
  }

  DioMediaType _mediaTypeFor(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return DioMediaType('image', 'png');
    if (lower.endsWith('.webp')) return DioMediaType('image', 'webp');
    return DioMediaType('image', 'jpeg');
  }

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
    // Persiste el nombre en el backend (PATCH /driver/profile). El teléfono es
    // la identidad de login y no se toca; el email sigue local (MVP).
    final fullName = '${firstName.trim()} ${lastName.trim()}'.trim();
    if (fullName.isNotEmpty) {
      _client.dio
          .patch<Map<String, dynamic>>(
            '/driver/profile',
            data: {'fullName': fullName},
          )
          .ignore();
    }
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

/// Proveedor del perfil del conductor (real, cargado desde el backend).
final editableProfileProvider =
    StateNotifierProvider<EditableProfileNotifier, EditableProfile>((ref) {
  return EditableProfileNotifier(DioClient());
});
