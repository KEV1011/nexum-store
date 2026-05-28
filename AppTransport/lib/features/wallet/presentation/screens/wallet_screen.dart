import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';

class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(title: const Text('Billetera')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          // Balance card
          Container(
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.primary, AppColors.primaryDim],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(AppConstants.radiusXLarge),
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
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: Colors.white70,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppConstants.spacingS,
                        vertical: 4,
                      ),
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
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppConstants.spacingS),
                Text(
                  CurrencyFormatter.format(87500),
                  style: theme.textTheme.headlineMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: AppConstants.spacingL),
                Row(
                  children: [
                    _WalletActionButton(
                      icon: Icons.arrow_upward_rounded,
                      label: 'Retirar',
                      onTap: () => _showComingSoon(context),
                    ),
                    const SizedBox(width: AppConstants.spacingM),
                    _WalletActionButton(
                      icon: Icons.history_rounded,
                      label: 'Historial',
                      onTap: () => _showComingSoon(context),
                    ),
                    const SizedBox(width: AppConstants.spacingM),
                    _WalletActionButton(
                      icon: Icons.account_balance_rounded,
                      label: 'Cuenta',
                      onTap: () => _showComingSoon(context),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppConstants.spacingL),

          // Summary cards
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

          // Recent transactions
          Text(
            'Movimientos recientes',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppConstants.spacingM),
          ..._mockTransactions.map(
            (t) => _TransactionTile(transaction: t, isDark: isDark),
          ),
        ],
      ),
    );
  }

  void _showComingSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Próximamente disponible')),
    );
  }
}

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
              color: Colors.white70,
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
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
              transaction.isCredit
                  ? Icons.arrow_downward_rounded
                  : Icons.arrow_upward_rounded,
              size: 18,
              color:
                  transaction.isCredit ? AppColors.success : AppColors.error,
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
              color:
                  transaction.isCredit ? AppColors.success : AppColors.error,
            ),
          ),
        ],
      ),
    );
  }
}

class _Transaction {
  const _Transaction({
    required this.description,
    required this.amount,
    required this.date,
    required this.isCredit,
  });

  final String description;
  final double amount;
  final String date;
  final bool isCredit;
}

const _mockTransactions = [
  _Transaction(
    description: 'Viaje completado #1042',
    amount: 12800,
    date: 'Hoy, 14:32',
    isCredit: true,
  ),
  _Transaction(
    description: 'Viaje completado #1041',
    amount: 8400,
    date: 'Hoy, 11:15',
    isCredit: true,
  ),
  _Transaction(
    description: 'Retiro a Bancolombia',
    amount: 50000,
    date: 'Ayer, 18:00',
    isCredit: false,
  ),
  _Transaction(
    description: 'Viaje completado #1040',
    amount: 15600,
    date: 'Ayer, 16:44',
    isCredit: true,
  ),
  _Transaction(
    description: 'Bono de productividad',
    amount: 10000,
    date: 'Ayer, 09:00',
    isCredit: true,
  ),
];
