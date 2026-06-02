import 'package:nexum_driver/features/admin/domain/entities/admin_user_entity.dart';
import 'package:nexum_driver/features/auth/domain/entities/user_account_entity.dart';

abstract interface class AdminRepository {
  Future<List<AdminUserEntity>> getAccounts({
    String? search,
    UserAccountStatus? statusFilter,
    UserRole? roleFilter,
  });

  Future<void> approveAccount(String id);
  Future<void> rejectAccount(String id, {String? reason});
  Future<void> suspendAccount(String id, {String? reason});
  Future<void> updateCommission(String id, double rate);
}
