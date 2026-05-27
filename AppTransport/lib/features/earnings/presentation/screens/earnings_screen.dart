import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/core/utils/fare_calculator.dart';

// ── Mock data ────────────────────────────────────────────────────────────────

class _DayEarning {
  const _DayEarning({
    required this.date,
    required this.totalTrips,
    required this.grossEarnings,
  });

  final DateTime date;
  final int totalTrips;
  final double grossEarnings;

  double get netEarnings => FareCalculator.calculateNetEarning(grossEarnings);
}

List<_DayEarning> _generateMockEarnings() {
  final now = DateTime.now();
  return [
    _DayEarning(
      date: now,
      totalTrips: 8,
      grossEarnings: 68000,
    ),
    _DayEarning(
      date: now.subtract(const Duration(days: 1)),
      totalTrips: 11,
      grossEarnings: 95500,
    ),
    _DayEarning(
      date: now.subtract(const Duration(days: 2)),
      totalTrips: 6,
      grossEarnings: 52000,
    ),
    _DayEarning(
      date: now.subtract(const Duration(days: 3)),
      totalTrips: 14,
      grossEarnings: 128000,
    ),
    _DayEarning(
      date: now.subtract(const Duration(days: 4)),
      totalTrips: 9,
      grossEarnings: 77500,
    ),
    _DayEarning(
      date: now.subtract(const Duration(days: 5)),
      totalTrips: 12,
      grossEarnings: 107000,
    ),
    _DayEarning(
      date: now.subtract(const Duration(days: 6)),
      totalTrips: 7,
      grossEarnings: 61000,
    ),
  ];
}

// ── Screen ────────────────────────────────────────────────────────────────────

/// Pantalla de ganancias con resumen del día y historial de 7 días.
class EarningsScreen extends ConsumerWidget {
  const EarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final earnings = _generateMockEarnings();
    final today = earnings.first;
    final weekTotal = earnings.fold<double>(0, (sum, e) => sum + e.netEarnings);
    final weekTrips = earnings.fold<int>(0, (sum, e) => sum + e.totalTrips);
    final maxGross =
        earnings.map((e) => e.grossEarnings).reduce((a, b) => a > b ? a : b);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis ganancias'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingM,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Today's earnings hero card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(AppConstants.spacingL),
                child: Column(
                  children: [
                    Text(
                      'Hoy, ${DateFormatter.formatDate(today.date)}',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingS),
                    Text(
                      CurrencyFormatter.format(today.netEarnings),
                      style: theme.textTheme.displaySmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary,
                      ),
                    ),
                    Text(
                      'ganancias netas',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingM),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        _MiniStat(
                          label: 'Viajes',
                          value: today.totalTrips.toString(),
                          icon: Icons.local_taxi_rounded,
                        ),
                        _MiniStat(
                          label: 'Tarifa bruta',
                          value: CurrencyFormatter.format(today.grossEarnings),
                          icon: Icons.receipt_outlined,
                        ),
                        _MiniStat(
                          label: 'Comisión',
                          value: CurrencyFormatter.format(
                            FareCalculator.calculateCommission(today.grossEarnings),
                          ),
                          icon: Icons.percent_rounded,
                          valueColor: AppColors.error,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppConstants.spacingM),
            // Week summary
            Card(
              child: Padding(
                padding: const EdgeInsets.all(AppConstants.spacingM),
                child: Row(
                  children: [
                    Expanded(
                      child: _SummaryTile(
                        label: 'Esta semana',
                        value: CurrencyFormatter.format(weekTotal),
                        icon: Icons.date_range_rounded,
                      ),
                    ),
                    Container(
                      width: 1,
                      height: 48,
                      color: AppColors.divider,
                    ),
                    Expanded(
                      child: _SummaryTile(
                        label: 'Viajes totales',
                        value: '$weekTrips',
                        icon: Icons.route_rounded,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppConstants.spacingM),
            // 7-day bar chart
            Text(
              'Últimos 7 días',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppConstants.spacingM),
            SizedBox(
              height: 180,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: earnings.reversed
                    .map(
                      (e) => Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          child: _BarChartColumn(
                            earning: e,
                            maxValue: maxGross,
                            isToday: e.date.day == earnings.first.date.day,
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
            const SizedBox(height: AppConstants.spacingM),
            const Divider(),
            const SizedBox(height: AppConstants.spacingS),
            // Daily breakdown list
            Text(
              'Detalle diario',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppConstants.spacingS),
            ...earnings.map((e) => _DailyEarningRow(earning: e)),
          ],
        ),
      ),
    );
  }
}

// ── Sub-widgets ──────────────────────────────────────────────────────────────

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.label,
    required this.value,
    required this.icon,
    this.valueColor,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Icon(icon, size: 18, color: AppColors.textSecondary),
        const SizedBox(height: 4),
        Text(
          value,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w700,
            color: valueColor,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.textSecondary,
            fontSize: 10,
          ),
        ),
      ],
    );
  }
}

class _SummaryTile extends StatelessWidget {
  const _SummaryTile({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Icon(icon, color: AppColors.primary, size: 22),
        const SizedBox(height: 4),
        Text(
          value,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w700,
            color: AppColors.primary,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.bodySmall
              ?.copyWith(color: AppColors.textSecondary),
        ),
      ],
    );
  }
}

class _BarChartColumn extends StatelessWidget {
  const _BarChartColumn({
    required this.earning,
    required this.maxValue,
    required this.isToday,
  });

  final _DayEarning earning;
  final double maxValue;
  final bool isToday;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const maxHeight = 120.0;
    final barHeight = maxValue > 0
        ? (earning.grossEarnings / maxValue) * maxHeight
        : 4.0;

    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Container(
          width: double.infinity,
          height: barHeight,
          decoration: BoxDecoration(
            color: isToday
                ? AppColors.primary
                : AppColors.primary.withValues(alpha: 0.35),
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(AppConstants.radiusSmall),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          DateFormatter.formatShortDate(earning.date),
          style: theme.textTheme.bodySmall?.copyWith(
            fontSize: 9,
            fontWeight: isToday ? FontWeight.w700 : FontWeight.normal,
            color: isToday ? AppColors.primary : AppColors.textSecondary,
          ),
          textAlign: TextAlign.center,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }
}

class _DailyEarningRow extends StatelessWidget {
  const _DailyEarningRow({required this.earning});

  final _DayEarning earning;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: 4,
        ),
        leading: CircleAvatar(
          backgroundColor: AppColors.primary.withValues(alpha: 0.1),
          child: Text(
            earning.date.day.toString(),
            style: TextStyle(
              color: AppColors.primary,
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
          ),
        ),
        title: Text(
          DateFormatter.formatRelativeDate(earning.date),
          style: theme.textTheme.bodyMedium
              ?.copyWith(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          '${earning.totalTrips} viajes',
          style: theme.textTheme.bodySmall
              ?.copyWith(color: AppColors.textSecondary),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              CurrencyFormatter.format(earning.netEarnings),
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
              ),
            ),
            Text(
              'neto',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: AppColors.textSecondary, fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }
}
