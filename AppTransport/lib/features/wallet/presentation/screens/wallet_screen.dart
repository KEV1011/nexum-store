import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/mock_data/driver_mock.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';

// ── Transaction model ─────────────────────────────────────────────────────────

enum _TxType { trip, withdrawal, bonus }

class _Transaction {
  const _Transaction({
    required this.description,
    required this.amount,
    required this.date,
    required this.isCredit,
    required this.type,
  });

  final String description;
  final double amount;
  final String date;
  final bool isCredit;
  final _TxType type;
}

// ── Payment method model ──────────────────────────────────────────────────────

class _PaymentMethod {
  const _PaymentMethod({
    required this.name,
    required this.accountInfo,
    required this.icon,
    required this.color,
  });
  final String name;
  final String accountInfo;
  final IconData icon;
  final Color color;
}

const _paymentMethods = [
  _PaymentMethod(
    name: 'Bancolombia',
    accountInfo: 'Cuenta Ahorros ****4521',
    icon: Icons.account_balance_rounded,
    color: Color(0xFF1A237E),
  ),
  _PaymentMethod(
    name: 'Nequi',
    accountInfo: '+57 312 *** **89',
    icon: Icons.phone_android_rounded,
    color: Color(0xFF6200EA),
  ),
  _PaymentMethod(
    name: 'Daviplata',
    accountInfo: '+57 312 *** **89',
    icon: Icons.account_balance_wallet_rounded,
    color: Color(0xFFE53935),
  ),
];

// ── Mock data ─────────────────────────────────────────────────────────────────

final _initialTransactions = [
  const _Transaction(
    description: 'Viaje completado #1042',
    amount: 12800,
    date: 'Hoy, 14:32',
    isCredit: true,
    type: _TxType.trip,
  ),
  const _Transaction(
    description: 'Viaje completado #1041',
    amount: 8400,
    date: 'Hoy, 11:15',
    isCredit: true,
    type: _TxType.trip,
  ),
  const _Transaction(
    description: 'Retiro a Bancolombia',
    amount: 50000,
    date: 'Ayer, 18:00',
    isCredit: false,
    type: _TxType.withdrawal,
  ),
  const _Transaction(
    description: 'Viaje completado #1040',
    amount: 15600,
    date: 'Ayer, 16:44',
    isCredit: true,
    type: _TxType.trip,
  ),
  const _Transaction(
    description: 'Bono de productividad',
    amount: 10000,
    date: 'Ayer, 09:00',
    isCredit: true,
    type: _TxType.bonus,
  ),
  const _Transaction(
    description: 'Viaje completado #1039',
    amount: 9700,
    date: 'Lun, 20:10',
    isCredit: true,
    type: _TxType.trip,
  ),
  const _Transaction(
    description: 'Bono de bienvenida',
    amount: 5000,
    date: 'Lun, 08:00',
    isCredit: true,
    type: _TxType.bonus,
  ),
  const _Transaction(
    description: 'Viaje completado #1038',
    amount: 6200,
    date: 'Dom, 17:30',
    isCredit: true,
    type: _TxType.trip,
  ),
  const _Transaction(
    description: 'Retiro a Bancolombia',
    amount: 80000,
    date: 'Dom, 10:00',
    isCredit: false,
    type: _TxType.withdrawal,
  ),
  const _Transaction(
    description: 'Viaje completado #1037',
    amount: 18200,
    date: 'Sáb, 21:15',
    isCredit: true,
    type: _TxType.trip,
  ),
];

// ── Screen ────────────────────────────────────────────────────────────────────

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  int _filterIndex = 0; // 0=Todos, 1=Viajes, 2=Retiros, 3=Bonos
  late List<_Transaction> _transactions;
  double _balance = 87500;

  static const _filterLabels = ['Todos', 'Viajes', 'Retiros', 'Bonos'];
  static const _filterTypes = [null, _TxType.trip, _TxType.withdrawal, _TxType.bonus];

  @override
  void initState() {
    super.initState();
    _transactions = List.of(_initialTransactions);
  }

  List<_Transaction> get _filtered {
    final type = _filterTypes[_filterIndex];
    if (type == null) return _transactions;
    return _transactions.where((t) => t.type == type).toList();
  }

  void _onWithdraw(double amount, String methodName) {
    setState(() {
      _balance -= amount;
      _transactions.insert(
        0,
        _Transaction(
          description: 'Retiro a $methodName',
          amount: amount,
          date: 'Ahora',
          isCredit: false,
          type: _TxType.withdrawal,
        ),
      );
    });
    AppSnackbar.showSuccess(
      context,
      'Retiro de ${CurrencyFormatter.format(amount)} a $methodName '
      'solicitado. Llegará en 1–2 días hábiles.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final filtered = _filtered;

    return Scaffold(
      appBar: AppBar(title: const Text('Billetera')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          // ── Balance card ─────────────────────────────────────────────────
          Container(
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.primary, AppColors.primaryDim],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius:
                  BorderRadius.circular(AppConstants.radiusXLarge),
            ),
            padding: const EdgeInsets.all(AppConstants.spacingL),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Saldo disponible',
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: Colors.white70),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: AppConstants.spacingS, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white24,
                        borderRadius:
                            BorderRadius.circular(AppConstants.radiusSmall),
                      ),
                      child: const Text(
                        'Activo',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppConstants.spacingS),
                Text(
                  CurrencyFormatter.format(_balance),
                  style: theme.textTheme.headlineMedium?.copyWith(
                      color: Colors.white, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: AppConstants.spacingXS),
                Text(
                  '${DriverMock.bankName} · ${DriverMock.bankAccountType} ${DriverMock.bankAccountNumber}',
                  style: const TextStyle(
                      color: Colors.white60, fontSize: 12),
                ),
                const SizedBox(height: AppConstants.spacingL),
                Row(
                  children: [
                    _WalletActionButton(
                      icon: Icons.arrow_upward_rounded,
                      label: 'Retirar',
                      onTap: () => _showWithdrawSheet(context),
                    ),
                    const SizedBox(width: AppConstants.spacingM),
                    _WalletActionButton(
                      icon: Icons.receipt_long_rounded,
                      label: 'Historial',
                      onTap: () => Scrollable.ensureVisible(context),
                    ),
                    const SizedBox(width: AppConstants.spacingM),
                    _WalletActionButton(
                      icon: Icons.account_balance_rounded,
                      label: 'Cuenta',
                      onTap: () => _showBankInfo(context),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppConstants.spacingL),

          // ── Summary row ───────────────────────────────────────────────────
          Row(
            children: [
              Expanded(
                child: _SummaryCard(
                  label: 'Esta semana',
                  amount: 234000,
                  icon: Icons.trending_up_rounded,
                  trend: '+12%',
                  positive: true,
                ),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: _SummaryCard(
                  label: 'Este mes',
                  amount: 892000,
                  icon: Icons.calendar_month_rounded,
                  trend: '+8%',
                  positive: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingL),

          // ── Transactions header + filter ───────────────────────────────
          Text(
            'Movimientos',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppConstants.spacingS),
          SizedBox(
            height: 36,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _filterLabels.length,
              separatorBuilder: (_, __) =>
                  const SizedBox(width: AppConstants.spacingS),
              itemBuilder: (context, i) => ChoiceChip(
                label: Text(_filterLabels[i]),
                selected: _filterIndex == i,
                onSelected: (_) => setState(() => _filterIndex = i),
                selectedColor: AppColors.primaryContainer,
                labelStyle: TextStyle(
                  color: _filterIndex == i
                      ? AppColors.primary
                      : AppColors.textSecondary,
                  fontWeight: _filterIndex == i
                      ? FontWeight.w700
                      : FontWeight.w400,
                  fontSize: 12,
                ),
                showCheckmark: false,
                visualDensity: VisualDensity.compact,
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          if (filtered.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(
                  vertical: AppConstants.spacingXL),
              child: Center(
                child: Text(
                  'Sin movimientos en esta categoría',
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: AppColors.textSecondary),
                ),
              ),
            )
          else
            ...filtered.map(
              (t) => _TransactionTile(transaction: t, isDark: isDark),
            ),
        ],
      ),
    );
  }

  // ── Withdrawal bottom sheet ───────────────────────────────────────────────

  void _showWithdrawSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _WithdrawSheet(
        balance: _balance,
        onConfirm: (amount, methodName) {
          Navigator.of(ctx).pop();
          _onWithdraw(amount, methodName);
        },
      ),
    );
  }

  void _showBankInfo(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cuenta de destino'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _DialogRow(label: 'Banco', value: DriverMock.bankName),
            _DialogRow(label: 'Tipo', value: DriverMock.bankAccountType),
            _DialogRow(label: 'Número', value: DriverMock.bankAccountNumber),
            const SizedBox(height: AppConstants.spacingS),
            const Text(
              'Para cambiar tu cuenta bancaria comunícate con soporte.',
              style: TextStyle(
                  fontSize: 12, color: AppColors.textSecondary),
            ),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
  }
}

// ── Withdrawal bottom sheet widget ────────────────────────────────────────────

class _WithdrawSheet extends StatefulWidget {
  const _WithdrawSheet({
    required this.balance,
    required this.onConfirm,
  });
  final double balance;
  final void Function(double amount, String methodName) onConfirm;

  @override
  State<_WithdrawSheet> createState() => _WithdrawSheetState();
}

class _WithdrawSheetState extends State<_WithdrawSheet> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  double _amount = 0;
  String? _error;
  int _selectedMethodIndex = 0;

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onAmountChanged(String raw) {
    final digits = raw.replaceAll(RegExp(r'[^\d]'), '');
    final value = double.tryParse(digits) ?? 0;
    setState(() {
      _amount = value;
      _error = null;
    });
  }

  void _submit() {
    if (_amount < 10000) {
      setState(() => _error = 'El monto mínimo de retiro es \$10.000');
      return;
    }
    if (_amount > widget.balance) {
      setState(() => _error = 'Saldo insuficiente');
      return;
    }
    widget.onConfirm(
      _amount,
      _paymentMethods[_selectedMethodIndex].name,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottomPad = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(
          AppConstants.spacingL,
          AppConstants.spacingL,
          AppConstants.spacingL,
          AppConstants.spacingL + bottomPad),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.divider,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          Text(
            'Retirar fondos',
            style: theme.textTheme.titleLarge
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: AppConstants.spacingXS),
          Text(
            'Disponible: ${CurrencyFormatter.format(widget.balance)}',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: AppColors.textSecondary),
          ),
          const SizedBox(height: AppConstants.spacingL),

          // Amount field
          TextField(
            controller: _controller,
            focusNode: _focusNode,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            onChanged: _onAmountChanged,
            style: theme.textTheme.headlineMedium
                ?.copyWith(fontWeight: FontWeight.w800),
            textAlign: TextAlign.center,
            decoration: InputDecoration(
              prefixText: '\$ ',
              prefixStyle: theme.textTheme.headlineMedium?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w400,
              ),
              hintText: '0',
              hintStyle: theme.textTheme.headlineMedium?.copyWith(
                color: AppColors.outlineLight,
                fontWeight: FontWeight.w800,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                borderSide:
                    const BorderSide(color: AppColors.outlineLight),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                borderSide: const BorderSide(
                    color: AppColors.primary, width: 2),
              ),
              errorText: _error,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // Quick amounts
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [20000, 50000, 100000].map((amt) {
              return OutlinedButton(
                onPressed: () {
                  _controller.text = amt.toString();
                  _onAmountChanged(amt.toString());
                },
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  minimumSize: const Size(0, 36),
                  textStyle: const TextStyle(fontSize: 13),
                ),
                child: Text(CurrencyFormatter.format(amt.toDouble())),
              );
            }).toList(),
          ),
          const SizedBox(height: AppConstants.spacingL),

          // Payment method selector
          Text(
            'Método de retiro',
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),
          ..._paymentMethods.asMap().entries.map((entry) {
            final i = entry.key;
            final method = entry.value;
            final isSelected = _selectedMethodIndex == i;
            return GestureDetector(
              onTap: () =>
                  setState(() => _selectedMethodIndex = i),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.only(
                  bottom: AppConstants.spacingS,
                ),
                padding: const EdgeInsets.all(AppConstants.spacingM),
                decoration: BoxDecoration(
                  color: isSelected
                      ? method.color.withValues(alpha: 0.08)
                      : AppColors.surfaceVariantLight,
                  borderRadius: BorderRadius.circular(
                    AppConstants.radiusMedium,
                  ),
                  border: Border.all(
                    color: isSelected
                        ? method.color
                        : AppColors.outlineLight,
                    width: isSelected ? 2 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(method.icon, color: method.color, size: 20),
                    const SizedBox(width: AppConstants.spacingM),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            method.name,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: isSelected
                                  ? method.color
                                  : AppColors.textPrimary,
                            ),
                          ),
                          Text(
                            method.accountInfo,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (isSelected)
                      Icon(
                        Icons.check_circle_rounded,
                        color: method.color,
                        size: 18,
                      ),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: AppConstants.spacingL),

          ElevatedButton(
            onPressed: _amount > 0 ? _submit : null,
            style: ElevatedButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            child: Text(
              _amount > 0
                  ? 'Confirmar retiro de ${CurrencyFormatter.format(_amount)}'
                  : 'Ingresa un monto',
            ),
          ),
        ],
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _WalletActionButton extends StatelessWidget {
  const _WalletActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: Colors.white24,
              borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
            ),
            child: Icon(icon, color: Colors.white, size: 20),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
                color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.label,
    required this.amount,
    required this.icon,
    required this.trend,
    required this.positive,
  });
  final String label;
  final double amount;
  final IconData icon;
  final String trend;
  final bool positive;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Icon(icon, size: 18, color: AppColors.primary),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: (positive ? AppColors.success : AppColors.error)
                        .withValues(alpha: 0.1),
                    borderRadius:
                        BorderRadius.circular(AppConstants.radiusSmall),
                  ),
                  child: Text(
                    trend,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: positive ? AppColors.success : AppColors.error,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingS),
            Text(
              CurrencyFormatter.format(amount),
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            Text(
              label,
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({
    required this.transaction,
    required this.isDark,
  });
  final _Transaction transaction;
  final bool isDark;

  IconData get _typeIcon => switch (transaction.type) {
        _TxType.trip => Icons.two_wheeler_rounded,
        _TxType.withdrawal => Icons.arrow_upward_rounded,
        _TxType.bonus => Icons.card_giftcard_rounded,
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: transaction.isCredit
                  ? AppColors.successContainer
                  : AppColors.errorContainer,
              borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
            ),
            child: Icon(
              _typeIcon,
              size: 18,
              color: transaction.isCredit ? AppColors.success : AppColors.error,
            ),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  transaction.description,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(
                  transaction.date,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          Text(
            '${transaction.isCredit ? '+' : '-'}${CurrencyFormatter.format(transaction.amount)}',
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: transaction.isCredit ? AppColors.success : AppColors.error,
            ),
          ),
        ],
      ),
    );
  }
}

class _DialogRow extends StatelessWidget {
  const _DialogRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(color: AppColors.textSecondary)),
          Text(value,
              style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
