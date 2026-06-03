import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';

// ── Mock state ────────────────────────────────────────────────────────────────

enum _MethodType { card, nequi, pse, cash }

class _PaymentMethod {
  const _PaymentMethod({
    required this.id,
    required this.type,
    required this.label,
    required this.detail,
    this.isDefault = false,
  });

  final String id;
  final _MethodType type;
  final String label;
  final String detail;
  final bool isDefault;

  _PaymentMethod copyWith({bool? isDefault}) => _PaymentMethod(
        id: id,
        type: type,
        label: label,
        detail: detail,
        isDefault: isDefault ?? this.isDefault,
      );
}

class _PaymentMethodsNotifier extends StateNotifier<List<_PaymentMethod>> {
  _PaymentMethodsNotifier()
      : super(const [
          _PaymentMethod(
            id: 'cash',
            type: _MethodType.cash,
            label: 'Efectivo',
            detail: 'Pago al recibir',
            isDefault: true,
          ),
          _PaymentMethod(
            id: 'visa-1234',
            type: _MethodType.card,
            label: 'Visa •••• 1234',
            detail: 'Vence 08/27',
          ),
          _PaymentMethod(
            id: 'nequi-3100001111',
            type: _MethodType.nequi,
            label: 'Nequi',
            detail: '310 000 1111',
          ),
        ]);

  void remove(String id) {
    if (id == 'cash') return; // cash can't be removed
    state = state.where((m) => m.id != id).toList();
  }

  void setDefault(String id) {
    state = state.map((m) => m.copyWith(isDefault: m.id == id)).toList();
  }

  void addCard({required String number, required String expiry}) {
    final last4 = number.replaceAll(' ', '').substring(
        (number.replaceAll(' ', '').length - 4).clamp(0, 9999));
    state = [
      ...state,
      _PaymentMethod(
        id: 'card-$last4-${DateTime.now().millisecondsSinceEpoch}',
        type: _MethodType.card,
        label: 'Tarjeta •••• $last4',
        detail: 'Vence $expiry',
      ),
    ];
  }

  void addNequi(String phone) {
    state = [
      ...state,
      _PaymentMethod(
        id: 'nequi-$phone',
        type: _MethodType.nequi,
        label: 'Nequi',
        detail: phone,
      ),
    ];
  }
}

final _paymentMethodsProvider =
    StateNotifierProvider<_PaymentMethodsNotifier, List<_PaymentMethod>>(
  (_) => _PaymentMethodsNotifier(),
);

// ── Screen ────────────────────────────────────────────────────────────────────

class PaymentMethodsScreen extends ConsumerWidget {
  const PaymentMethodsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final methods = ref.watch(_paymentMethodsProvider);
    final notifier = ref.read(_paymentMethodsProvider.notifier);

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        title: const Text('Métodos de pago'),
        backgroundColor: AppColors.surfaceLight,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          const _SectionLabel('Mis métodos'),
          const SizedBox(height: AppConstants.spacingS),
          ...methods.map(
            (m) => _MethodTile(
              method: m,
              onSetDefault: () => notifier.setDefault(m.id),
              onRemove: m.type == _MethodType.cash
                  ? null
                  : () => _confirmRemove(context, m, notifier),
            ),
          ),
          const SizedBox(height: AppConstants.spacingL),
          const _SectionLabel('Agregar método'),
          const SizedBox(height: AppConstants.spacingS),
          _AddTile(
            icon: Icons.credit_card_rounded,
            label: 'Tarjeta débito / crédito',
            onTap: () => _showAddCardSheet(context, notifier),
          ),
          const SizedBox(height: AppConstants.spacingS),
          _AddTile(
            icon: Icons.account_balance_wallet_rounded,
            iconColor: const Color(0xFF7B2D8B),
            label: 'Nequi',
            onTap: () => _showAddNequiSheet(context, notifier),
          ),
          const SizedBox(height: AppConstants.spacingS),
          _AddTile(
            icon: Icons.account_balance_rounded,
            iconColor: AppColors.secondary,
            label: 'PSE',
            onTap: () => _showPseBanner(context),
          ),
          const SizedBox(height: AppConstants.spacingL),
          const _InfoBanner(),
        ],
      ),
    );
  }

  Future<void> _confirmRemove(
    BuildContext context,
    _PaymentMethod method,
    _PaymentMethodsNotifier notifier,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar método'),
        content: Text('¿Eliminar ${method.label}?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text(
              'Eliminar',
              style: TextStyle(color: AppColors.error),
            ),
          ),
        ],
      ),
    );
    if (confirmed ?? false) notifier.remove(method.id);
  }

  void _showAddCardSheet(
      BuildContext context, _PaymentMethodsNotifier notifier) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius:
            BorderRadius.vertical(top: Radius.circular(AppConstants.radiusLarge)),
      ),
      builder: (_) => _AddCardSheet(notifier: notifier),
    );
  }

  void _showAddNequiSheet(
      BuildContext context, _PaymentMethodsNotifier notifier) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius:
            BorderRadius.vertical(top: Radius.circular(AppConstants.radiusLarge)),
      ),
      builder: (_) => _AddNequiSheet(notifier: notifier),
    );
  }

  void _showPseBanner(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('PSE disponible próximamente')),
    );
  }
}

// ── Tiles ─────────────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: AppColors.textSecondary,
          letterSpacing: 0.4,
        ),
      );
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({
    required this.method,
    required this.onSetDefault,
    this.onRemove,
  });

  final _PaymentMethod method;
  final VoidCallback onSetDefault;
  final VoidCallback? onRemove;

  IconData get _icon => switch (method.type) {
        _MethodType.card => Icons.credit_card_rounded,
        _MethodType.nequi => Icons.account_balance_wallet_rounded,
        _MethodType.pse => Icons.account_balance_rounded,
        _MethodType.cash => Icons.payments_rounded,
      };

  Color get _iconColor => switch (method.type) {
        _MethodType.nequi => const Color(0xFF7B2D8B),
        _MethodType.pse => AppColors.secondary,
        _ => AppColors.primary,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: method.isDefault
              ? AppColors.primary
              : AppColors.outlineLight,
          width: method.isDefault ? 1.5 : 1,
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(
            horizontal: AppConstants.spacingM, vertical: 4),
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: _iconColor.withValues(alpha: 0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(_icon, color: _iconColor, size: 22),
        ),
        title: Text(
          method.label,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        subtitle: Text(
          method.detail,
          style: const TextStyle(
              color: AppColors.textSecondary, fontSize: 12),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (method.isDefault)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'Predeterminado',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primaryDim,
                  ),
                ),
              )
            else
              TextButton(
                onPressed: onSetDefault,
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(60, 30),
                ),
                child: const Text(
                  'Usar',
                  style: TextStyle(fontSize: 12, color: AppColors.primary),
                ),
              ),
            if (onRemove != null) ...[
              const SizedBox(width: 4),
              IconButton(
                icon: const Icon(Icons.delete_outline_rounded,
                    size: 20, color: AppColors.error),
                onPressed: onRemove,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AddTile extends StatelessWidget {
  const _AddTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.iconColor = AppColors.primary,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppConstants.spacingM, vertical: AppConstants.spacingM),
        decoration: BoxDecoration(
          color: AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: Border.all(
              color: AppColors.outlineLight,
              style: BorderStyle.solid),
        ),
        child: Row(
          children: [
            Icon(icon, color: iconColor, size: 22),
            const SizedBox(width: AppConstants.spacingM),
            Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w500,
                fontSize: 14,
              ),
            ),
            const Spacer(),
            const Icon(Icons.add_rounded, color: AppColors.textSecondary),
          ],
        ),
      ),
    );
  }
}

class _InfoBanner extends StatelessWidget {
  const _InfoBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.secondaryContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: const Row(
        children: [
          Icon(Icons.lock_rounded, size: 18, color: AppColors.secondary),
          SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Text(
              'Tus datos de pago están protegidos con cifrado de extremo a extremo.',
              style: TextStyle(
                fontSize: 12,
                color: AppColors.secondary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Add card sheet ────────────────────────────────────────────────────────────

class _AddCardSheet extends StatefulWidget {
  const _AddCardSheet({required this.notifier});
  final _PaymentMethodsNotifier notifier;

  @override
  State<_AddCardSheet> createState() => _AddCardSheetState();
}

class _AddCardSheetState extends State<_AddCardSheet> {
  final _numberCtrl = TextEditingController();
  final _expiryCtrl = TextEditingController();
  final _cvvCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _numberCtrl.dispose();
    _expiryCtrl.dispose();
    _cvvCtrl.dispose();
    _nameCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    widget.notifier.addCard(
      number: _numberCtrl.text,
      expiry: _expiryCtrl.text,
    );
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Tarjeta agregada')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Agregar tarjeta',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 20),
            TextFormField(
              controller: _nameCtrl,
              decoration: const InputDecoration(labelText: 'Nombre del titular'),
              textCapitalization: TextCapitalization.words,
              validator: (v) => (v?.trim().isEmpty ?? true) ? 'Requerido' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _numberCtrl,
              decoration: const InputDecoration(labelText: 'Número de tarjeta'),
              keyboardType: TextInputType.number,
              maxLength: 19,
              validator: (v) {
                final digits = v?.replaceAll(' ', '') ?? '';
                if (digits.length < 13) return 'Número inválido';
                return null;
              },
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _expiryCtrl,
                    decoration:
                        const InputDecoration(labelText: 'MM/AA', counterText: ''),
                    keyboardType: TextInputType.number,
                    maxLength: 5,
                    validator: (v) {
                      if (v == null || !RegExp(r'^\d{2}/\d{2}$').hasMatch(v)) {
                        return 'Inválida';
                      }
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: TextFormField(
                    controller: _cvvCtrl,
                    decoration:
                        const InputDecoration(labelText: 'CVV', counterText: ''),
                    keyboardType: TextInputType.number,
                    maxLength: 4,
                    obscureText: true,
                    validator: (v) {
                      if ((v?.length ?? 0) < 3) return 'Inválido';
                      return null;
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Agregar tarjeta',
                    style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Add Nequi sheet ───────────────────────────────────────────────────────────

class _AddNequiSheet extends StatefulWidget {
  const _AddNequiSheet({required this.notifier});
  final _PaymentMethodsNotifier notifier;

  @override
  State<_AddNequiSheet> createState() => _AddNequiSheetState();
}

class _AddNequiSheetState extends State<_AddNequiSheet> {
  final _phoneCtrl = TextEditingController();

  @override
  void dispose() {
    _phoneCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    final phone = _phoneCtrl.text.trim();
    if (phone.length < 10) return;
    widget.notifier.addNequi(phone);
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Nequi vinculado')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Vincular Nequi',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          const Text(
            'Ingresa el número de celular asociado a tu cuenta Nequi.',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _phoneCtrl,
            decoration: const InputDecoration(
              labelText: 'Número de celular',
              prefixText: '+57 ',
            ),
            keyboardType: TextInputType.phone,
            maxLength: 10,
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF7B2D8B),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Vincular Nequi',
                  style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}
