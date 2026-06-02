import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/features/admin/domain/entities/admin_user_entity.dart';
import 'package:nexum_driver/features/admin/presentation/providers/admin_provider.dart';
import 'package:nexum_driver/features/auth/domain/entities/user_account_entity.dart';

class AdminScreen extends ConsumerStatefulWidget {
  const AdminScreen({super.key});

  @override
  ConsumerState<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends ConsumerState<AdminScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;
  final _searchCtrl = TextEditingController();
  Timer? _debounce;

  static const _tabs = [
    (label: 'Todos', status: null),
    (label: 'Pendientes', status: UserAccountStatus.pending),
    (label: 'Aprobados', status: UserAccountStatus.approved),
    (label: 'Suspendidos', status: UserAccountStatus.suspended),
  ];

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: _tabs.length, vsync: this);
    _tabCtrl.addListener(_onTabChanged);
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => ref.read(adminProvider.notifier).load(),
    );
    _searchCtrl.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    _searchCtrl.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onTabChanged() {
    if (_tabCtrl.indexIsChanging) return;
    ref
        .read(adminProvider.notifier)
        .setStatusFilter(_tabs[_tabCtrl.index].status);
  }

  void _onSearchChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      ref.read(adminProvider.notifier).setSearch(_searchCtrl.text.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(adminProvider);

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Panel de administración',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: AppColors.textPrimary,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppColors.textPrimary),
            onPressed: () => ref.read(adminProvider.notifier).load(),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(106),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: TextField(
                  controller: _searchCtrl,
                  style: const TextStyle(
                      fontSize: 14, color: AppColors.textPrimary),
                  decoration: InputDecoration(
                    hintText: 'Buscar por nombre, teléfono o correo...',
                    hintStyle: const TextStyle(
                        color: AppColors.inputHint, fontSize: 13.5),
                    prefixIcon: const Icon(Icons.search_rounded,
                        size: 20, color: AppColors.inputBorder),
                    suffixIcon: _searchCtrl.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear_rounded,
                                size: 18, color: AppColors.inputBorder),
                            onPressed: () {
                              _searchCtrl.clear();
                              ref
                                  .read(adminProvider.notifier)
                                  .setSearch('');
                            },
                          )
                        : null,
                    filled: true,
                    fillColor: AppColors.inputBackground,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide:
                          const BorderSide(color: AppColors.inputBorder),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide:
                          const BorderSide(color: AppColors.inputBorder),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(
                          color: AppColors.inputBorderFocused, width: 2),
                    ),
                  ),
                ),
              ),
              TabBar(
                controller: _tabCtrl,
                labelColor: AppColors.primary,
                unselectedLabelColor: AppColors.textSecondary,
                indicatorColor: AppColors.primary,
                indicatorWeight: 3,
                labelStyle: const TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w700),
                tabs: _tabs
                    .map((t) => Tab(text: t.label))
                    .toList(),
              ),
            ],
          ),
        ),
      ),
      body: state.isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primary))
          : state.accounts.isEmpty
              ? _emptyState()
              : RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () => ref.read(adminProvider.notifier).load(),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: state.accounts.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) => _AccountCard(
                      user: state.accounts[i],
                      onApprove: () => _approve(state.accounts[i]),
                      onReject: () => _reject(state.accounts[i]),
                      onSuspend: () => _suspend(state.accounts[i]),
                      onCommission: () => _editCommission(state.accounts[i]),
                    ),
                  ),
                ),
    );
  }

  Widget _emptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.manage_accounts_rounded,
              size: 56, color: AppColors.textSecondary),
          const SizedBox(height: 16),
          Text(
            _searchCtrl.text.isNotEmpty
                ? 'Sin resultados para "${_searchCtrl.text}"'
                : 'Sin cuentas que mostrar',
            style: const TextStyle(
                color: AppColors.textSecondary, fontSize: 15),
          ),
        ],
      ),
    );
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  Future<void> _approve(AdminUserEntity user) async {
    final ok = await _confirm(
      'Aprobar cuenta',
      '¿Aprobar a ${user.fullName}?',
    );
    if (ok) {
      await ref.read(adminProvider.notifier).approve(user.id);
      if (mounted) _snack('Cuenta aprobada', isError: false);
    }
  }

  Future<void> _reject(AdminUserEntity user) async {
    final reason = await _reasonDialog('Rechazar cuenta',
        '¿Razón del rechazo para ${user.fullName}?');
    if (reason != null) {
      await ref.read(adminProvider.notifier).reject(user.id, reason: reason);
      if (mounted) _snack('Cuenta rechazada');
    }
  }

  Future<void> _suspend(AdminUserEntity user) async {
    final reason = await _reasonDialog('Suspender cuenta',
        '¿Razón de la suspensión para ${user.fullName}?');
    if (reason != null) {
      await ref.read(adminProvider.notifier).suspend(user.id, reason: reason);
      if (mounted) _snack('Cuenta suspendida');
    }
  }

  Future<void> _editCommission(AdminUserEntity user) async {
    final ctrl = TextEditingController(
      text: (user.commissionRate * 100).toStringAsFixed(1),
    );
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Comisión de la plataforma'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${user.fullName}',
                style: const TextStyle(
                    fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Porcentaje (%)',
                suffixText: '%',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Guardar')),
        ],
      ),
    );
    if (ok == true && mounted) {
      final rate = (double.tryParse(ctrl.text.replaceAll(',', '.')) ?? 0) / 100;
      await ref
          .read(adminProvider.notifier)
          .updateCommission(user.id, rate.clamp(0, 1));
      if (mounted) _snack('Comisión actualizada', isError: false);
    }
  }

  Future<bool> _confirm(String title, String body) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('No')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Sí')),
        ],
      ),
    );
    return ok ?? false;
  }

  Future<String?> _reasonDialog(String title, String hint) async {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: ctrl,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: hint,
            border: const OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancelar')),
          ElevatedButton(
              onPressed: () =>
                  Navigator.pop(ctx, ctrl.text.trim().isEmpty ? '—' : ctrl.text.trim()),
              child: const Text('Confirmar')),
        ],
      ),
    );
  }

  void _snack(String msg, {bool isError = true}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: isError ? AppColors.error : AppColors.success,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

// ── Account card ──────────────────────────────────────────────────────────────

class _AccountCard extends StatelessWidget {
  const _AccountCard({
    required this.user,
    required this.onApprove,
    required this.onReject,
    required this.onSuspend,
    required this.onCommission,
  });

  final AdminUserEntity user;
  final VoidCallback onApprove;
  final VoidCallback onReject;
  final VoidCallback onSuspend;
  final VoidCallback onCommission;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              _RoleAvatar(role: user.role),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user.fullName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      user.identifier,
                      style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
              _StatusChip(status: user.status),
            ],
          ),

          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              _InfoChip(
                icon: user.role.icon,
                label: user.role.displayName,
              ),
              if (user.vehiclePlate != null)
                _InfoChip(
                  icon: Icons.confirmation_number_rounded,
                  label: user.vehiclePlate!,
                ),
              _InfoChip(
                icon: Icons.percent_rounded,
                label: '${(user.commissionRate * 100).toStringAsFixed(1)}%',
              ),
              _InfoChip(
                icon: Icons.calendar_today_rounded,
                label: _fmtDate(user.createdAt),
              ),
            ],
          ),

          if (user.rejectionReason != null || user.suspensionReason != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: user.status == UserAccountStatus.rejected
                    ? AppColors.statusRejectedContainer
                    : AppColors.statusSuspendedContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                user.rejectionReason ?? user.suspensionReason ?? '',
                style: TextStyle(
                  fontSize: 11.5,
                  color: user.status == UserAccountStatus.rejected
                      ? AppColors.statusRejected
                      : AppColors.statusSuspended,
                  height: 1.3,
                ),
              ),
            ),
          ],

          const SizedBox(height: 10),
          _ActionRow(
            status: user.status,
            onApprove: onApprove,
            onReject: onReject,
            onSuspend: onSuspend,
            onCommission: onCommission,
          ),
        ],
      ),
    );
  }

  String _fmtDate(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
}

// ── Role avatar ───────────────────────────────────────────────────────────────

class _RoleAvatar extends StatelessWidget {
  const _RoleAvatar({required this.role});

  final UserRole role;

  static const _colors = {
    UserRole.driverCar: Color(0xFF1565C0),
    UserRole.driverMoto: Color(0xFFE64A19),
    UserRole.business: Color(0xFF2E7D32),
  };

  @override
  Widget build(BuildContext context) {
    final color = _colors[role] ?? AppColors.primary;
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(role.icon, color: color, size: 22),
    );
  }
}

// ── Status chip ───────────────────────────────────────────────────────────────

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final UserAccountStatus status;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: status.containerColor,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        status.displayName,
        style: TextStyle(
          color: status.color,
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

// ── Info chip ─────────────────────────────────────────────────────────────────

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceVariantLight,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: AppColors.textSecondary),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
                fontSize: 11.5,
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

// ── Action row ────────────────────────────────────────────────────────────────

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.status,
    required this.onApprove,
    required this.onReject,
    required this.onSuspend,
    required this.onCommission,
  });

  final UserAccountStatus status;
  final VoidCallback onApprove;
  final VoidCallback onReject;
  final VoidCallback onSuspend;
  final VoidCallback onCommission;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        if (status == UserAccountStatus.pending) ...[
          _ActionBtn(
            label: 'Aprobar',
            icon: Icons.check_rounded,
            color: AppColors.statusApproved,
            onTap: onApprove,
          ),
          _ActionBtn(
            label: 'Rechazar',
            icon: Icons.close_rounded,
            color: AppColors.statusRejected,
            outlined: true,
            onTap: onReject,
          ),
        ],
        if (status == UserAccountStatus.approved)
          _ActionBtn(
            label: 'Suspender',
            icon: Icons.block_rounded,
            color: AppColors.statusSuspended,
            outlined: true,
            onTap: onSuspend,
          ),
        if (status == UserAccountStatus.suspended ||
            status == UserAccountStatus.rejected)
          _ActionBtn(
            label: 'Activar',
            icon: Icons.restart_alt_rounded,
            color: AppColors.statusApproved,
            onTap: onApprove,
          ),
        _ActionBtn(
          label: 'Comisión',
          icon: Icons.percent_rounded,
          color: AppColors.secondary,
          outlined: true,
          onTap: onCommission,
        ),
      ],
    );
  }
}

class _ActionBtn extends StatelessWidget {
  const _ActionBtn({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
    this.outlined = false,
  });

  final String label;
  final IconData icon;
  final Color color;
  final bool outlined;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (outlined) {
      return OutlinedButton.icon(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          foregroundColor: color,
          side: BorderSide(color: color),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10)),
        ),
        icon: Icon(icon, size: 14),
        label: Text(label,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
      );
    }
    return ElevatedButton.icon(
      onPressed: onTap,
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        elevation: 0,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      icon: Icon(icon, size: 14),
      label: Text(label,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}
