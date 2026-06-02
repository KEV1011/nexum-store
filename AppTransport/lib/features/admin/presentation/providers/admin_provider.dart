import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/features/admin/data/repositories/admin_repository_impl.dart';
import 'package:nexum_driver/features/admin/domain/entities/admin_user_entity.dart';
import 'package:nexum_driver/features/admin/domain/repositories/admin_repository.dart';
import 'package:nexum_driver/features/auth/domain/entities/user_account_entity.dart';

class AdminState {
  const AdminState({
    this.accounts = const [],
    this.isLoading = false,
    this.search = '',
    this.statusFilter,
    this.roleFilter,
  });

  final List<AdminUserEntity> accounts;
  final bool isLoading;
  final String search;
  final UserAccountStatus? statusFilter;
  final UserRole? roleFilter;

  AdminState copyWith({
    List<AdminUserEntity>? accounts,
    bool? isLoading,
    String? search,
    UserAccountStatus? statusFilter,
    bool clearStatusFilter = false,
    UserRole? roleFilter,
    bool clearRoleFilter = false,
  }) =>
      AdminState(
        accounts: accounts ?? this.accounts,
        isLoading: isLoading ?? this.isLoading,
        search: search ?? this.search,
        statusFilter: clearStatusFilter ? null : (statusFilter ?? this.statusFilter),
        roleFilter: clearRoleFilter ? null : (roleFilter ?? this.roleFilter),
      );
}

class AdminNotifier extends StateNotifier<AdminState> {
  AdminNotifier(this._repo) : super(const AdminState());

  final AdminRepository _repo;

  Future<void> load() async {
    state = state.copyWith(isLoading: true);
    final accounts = await _repo.getAccounts(
      search: state.search.isEmpty ? null : state.search,
      statusFilter: state.statusFilter,
      roleFilter: state.roleFilter,
    );
    state = state.copyWith(accounts: accounts, isLoading: false);
  }

  void setSearch(String q) {
    state = state.copyWith(search: q);
    load();
  }

  void setStatusFilter(UserAccountStatus? s) {
    state = s == null
        ? state.copyWith(clearStatusFilter: true)
        : state.copyWith(statusFilter: s);
    load();
  }

  void setRoleFilter(UserRole? r) {
    state = r == null
        ? state.copyWith(clearRoleFilter: true)
        : state.copyWith(roleFilter: r);
    load();
  }

  Future<void> approve(String id) async {
    await _repo.approveAccount(id);
    _updateLocal(id, UserAccountStatus.approved);
  }

  Future<void> reject(String id, {String? reason}) async {
    await _repo.rejectAccount(id, reason: reason);
    _updateLocal(id, UserAccountStatus.rejected,
        rejectionReason: reason);
  }

  Future<void> suspend(String id, {String? reason}) async {
    await _repo.suspendAccount(id, reason: reason);
    _updateLocal(id, UserAccountStatus.suspended,
        suspensionReason: reason);
  }

  Future<void> updateCommission(String id, double rate) async {
    await _repo.updateCommission(id, rate);
    final updated = state.accounts.map((u) {
      if (u.id != id) return u;
      return u.copyWith(commissionRate: rate);
    }).toList();
    state = state.copyWith(accounts: updated);
  }

  void _updateLocal(
    String id,
    UserAccountStatus newStatus, {
    String? rejectionReason,
    String? suspensionReason,
  }) {
    final updated = state.accounts.map((u) {
      if (u.id != id) return u;
      return u.copyWith(
        status: newStatus,
        rejectionReason: rejectionReason,
        suspensionReason: suspensionReason,
      );
    }).toList();
    state = state.copyWith(accounts: updated);
  }
}

final adminRepositoryProvider = Provider<AdminRepository>((ref) {
  return AdminRepositoryImpl();
});

final adminProvider =
    StateNotifierProvider<AdminNotifier, AdminState>((ref) {
  return AdminNotifier(ref.watch(adminRepositoryProvider));
});
