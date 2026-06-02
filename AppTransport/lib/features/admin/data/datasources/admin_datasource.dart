import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/admin/domain/entities/admin_user_entity.dart';
import 'package:nexum_driver/features/auth/domain/entities/user_account_entity.dart';

class AdminDatasource {
  AdminDatasource({DioClient? client}) : _client = client ?? DioClient();

  final DioClient _client;

  Future<List<AdminUserEntity>> getAccounts({
    String? search,
    UserAccountStatus? statusFilter,
    UserRole? roleFilter,
  }) async {
    try {
      final res = await _client.get<Map<String, dynamic>>(
        '/admin/accounts',
        queryParameters: {
          if (search != null && search.isNotEmpty) 'search': search,
          if (statusFilter != null) 'status': statusFilter.name,
          if (roleFilter != null) 'role': roleFilter.apiValue,
        },
      );
      final list = (res.data?['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(AdminUserEntity.fromJson)
          .toList();
      return list;
    } catch (_) {
      return _mockAccounts(search: search, status: statusFilter, role: roleFilter);
    }
  }

  Future<void> approveAccount(String id) async {
    try {
      await _client.post<Map<String, dynamic>>('/admin/accounts/$id/approve');
    } catch (_) {}
  }

  Future<void> rejectAccount(String id, {String? reason}) async {
    try {
      await _client.post<Map<String, dynamic>>(
        '/admin/accounts/$id/reject',
        data: reason != null ? {'reason': reason} : null,
      );
    } catch (_) {}
  }

  Future<void> suspendAccount(String id, {String? reason}) async {
    try {
      await _client.post<Map<String, dynamic>>(
        '/admin/accounts/$id/suspend',
        data: reason != null ? {'reason': reason} : null,
      );
    } catch (_) {}
  }

  Future<void> updateCommission(String id, double rate) async {
    try {
      await _client.patch<Map<String, dynamic>>(
        '/admin/accounts/$id/commission',
        data: {'commissionRate': rate},
      );
    } catch (_) {}
  }

  // ── Mock data ──────────────────────────────────────────────────────────────

  static final _allMock = <AdminUserEntity>[
    AdminUserEntity(
      id: 'u-001',
      fullName: 'Juan Carlos Villamizar Contreras',
      identifier: '+57 313 456 7890',
      role: UserRole.driverCar,
      status: UserAccountStatus.approved,
      createdAt: DateTime(2024, 3, 12),
      vehiclePlate: 'KGB-742',
      vehicleType: 'particular',
      commissionRate: 0.13,
    ),
    AdminUserEntity(
      id: 'u-002',
      fullName: 'María Fernanda Rojas Pérez',
      identifier: 'maria.rojas@gmail.com',
      role: UserRole.driverMoto,
      status: UserAccountStatus.pending,
      createdAt: DateTime(2025, 1, 8),
      vehiclePlate: 'BKM-019',
      vehicleType: 'moto',
      commissionRate: 0.10,
    ),
    AdminUserEntity(
      id: 'u-003',
      fullName: 'Transportes Catatumbo S.A.S.',
      identifier: 'contacto@catatumbo.com',
      role: UserRole.business,
      status: UserAccountStatus.approved,
      createdAt: DateTime(2024, 6, 20),
      companyName: 'Transportes Catatumbo S.A.S.',
      commissionRate: 0.11,
    ),
    AdminUserEntity(
      id: 'u-004',
      fullName: 'Andrés Felipe Mora Suárez',
      identifier: '+57 310 234 5678',
      role: UserRole.driverCar,
      status: UserAccountStatus.pending,
      createdAt: DateTime(2025, 5, 2),
      vehiclePlate: 'TRM-234',
      vehicleType: 'taxi',
      commissionRate: 0.13,
    ),
    AdminUserEntity(
      id: 'u-005',
      fullName: 'Luisa Camila Castro Vega',
      identifier: 'lccastro@hotmail.com',
      role: UserRole.driverMoto,
      status: UserAccountStatus.approved,
      createdAt: DateTime(2024, 9, 17),
      vehiclePlate: 'UYA-801',
      vehicleType: 'moto',
      commissionRate: 0.10,
    ),
    AdminUserEntity(
      id: 'u-006',
      fullName: 'Carlos Eduardo Gómez Rincón',
      identifier: '+57 317 890 1234',
      role: UserRole.driverCar,
      status: UserAccountStatus.suspended,
      createdAt: DateTime(2024, 1, 30),
      vehiclePlate: 'FPQ-567',
      vehicleType: 'particular',
      commissionRate: 0.13,
      suspensionReason: 'Queja de pasajero por mal comportamiento.',
    ),
    AdminUserEntity(
      id: 'u-007',
      fullName: 'Paola Andrea Chitiva Moreno',
      identifier: 'p.chitiva@nexum.co',
      role: UserRole.business,
      status: UserAccountStatus.rejected,
      createdAt: DateTime(2025, 2, 14),
      companyName: 'Delicias Chitiva',
      commissionRate: 0.11,
      rejectionReason: 'Documentos incompletos.',
    ),
    AdminUserEntity(
      id: 'u-008',
      fullName: 'Jorge Enrique Suárez Álvarez',
      identifier: '+57 312 345 6789',
      role: UserRole.driverCar,
      status: UserAccountStatus.pending,
      createdAt: DateTime(2025, 5, 30),
      vehiclePlate: 'LMX-321',
      vehicleType: 'particular',
      commissionRate: 0.13,
    ),
    AdminUserEntity(
      id: 'u-009',
      fullName: 'Daniela Sofía Peñaloza Torres',
      identifier: 'daniela.pt@gmail.com',
      role: UserRole.driverMoto,
      status: UserAccountStatus.approved,
      createdAt: DateTime(2024, 11, 5),
      vehiclePlate: 'HNA-654',
      vehicleType: 'moto',
      commissionRate: 0.10,
    ),
    AdminUserEntity(
      id: 'u-010',
      fullName: 'Logística Andes Colombia S.A.S.',
      identifier: 'operaciones@logandes.co',
      role: UserRole.business,
      status: UserAccountStatus.pending,
      createdAt: DateTime(2025, 5, 28),
      companyName: 'Logística Andes Colombia S.A.S.',
      commissionRate: 0.11,
    ),
  ];

  List<AdminUserEntity> _mockAccounts({
    String? search,
    UserAccountStatus? status,
    UserRole? role,
  }) {
    var list = List<AdminUserEntity>.from(_allMock);
    if (status != null) list = list.where((u) => u.status == status).toList();
    if (role != null) list = list.where((u) => u.role == role).toList();
    if (search != null && search.isNotEmpty) {
      final q = search.toLowerCase();
      list = list
          .where((u) =>
              u.fullName.toLowerCase().contains(q) ||
              u.identifier.toLowerCase().contains(q) ||
              (u.companyName?.toLowerCase().contains(q) ?? false))
          .toList();
    }
    return list;
  }
}
