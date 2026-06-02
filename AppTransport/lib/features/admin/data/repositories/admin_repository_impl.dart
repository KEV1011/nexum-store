import 'package:nexum_driver/features/admin/data/datasources/admin_datasource.dart';
import 'package:nexum_driver/features/admin/domain/entities/admin_user_entity.dart';
import 'package:nexum_driver/features/admin/domain/repositories/admin_repository.dart';
import 'package:nexum_driver/features/auth/domain/entities/user_account_entity.dart';

class AdminRepositoryImpl implements AdminRepository {
  AdminRepositoryImpl({AdminDatasource? datasource})
      : _ds = datasource ?? AdminDatasource();

  final AdminDatasource _ds;

  @override
  Future<List<AdminUserEntity>> getAccounts({
    String? search,
    UserAccountStatus? statusFilter,
    UserRole? roleFilter,
  }) =>
      _ds.getAccounts(
          search: search, statusFilter: statusFilter, roleFilter: roleFilter);

  @override
  Future<void> approveAccount(String id) => _ds.approveAccount(id);

  @override
  Future<void> rejectAccount(String id, {String? reason}) =>
      _ds.rejectAccount(id, reason: reason);

  @override
  Future<void> suspendAccount(String id, {String? reason}) =>
      _ds.suspendAccount(id, reason: reason);

  @override
  Future<void> updateCommission(String id, double rate) =>
      _ds.updateCommission(id, rate);
}
