import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/features/earnings/domain/entities/daily_earnings_entity.dart';

/// Tarjeta principal con el resumen de ganancias del día.
class EarningsSummaryCard extends StatelessWidget {
  const EarningsSummaryCard({super.key, required this.earnings});

  final DailyEarningsEntity earnings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Card(
      elevation: 4,
      shadowColor: AppColors.shadow,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
      ),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
          gradient: LinearGradient(
            colors: isDark
                ? [const Color(0xFF1B5E20), const Color(0xFF2E7D32)]
                : [AppColors.primary, AppColors.primaryDark],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        padding: const EdgeInsets.all(AppConstants.spacingL),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Total ganado
            const Text(
              'Ganancias de hoy',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 14,
              ),
            ),
            const SizedBox(height: AppConstants.spacingXS),
            Text(
              CurrencyFormatter.format(earnings.totalEarnings),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 40,
                fontWeight: FontWeight.bold,
                letterSpacing: -1,
              ),
            ),

            const SizedBox(height: AppConstants.spacingM),
            const Divider(color: Colors.white30),
            const SizedBox(height: AppConstants.spacingM),

            // Métricas secundarias
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _MetricItem(
                  icon: Icons.route_rounded,
                  label: 'Viajes',
                  value: earnings.totalTrips.toString(),
                ),
                _MetricItem(
                  icon: Icons.access_time_rounded,
                  label: 'En línea',
                  value: '${earnings.hoursOnline.toStringAsFixed(1)} h',
                ),
                _MetricItem(
                  icon: Icons.trending_up_rounded,
                  label: 'Promedio',
                  value: earnings.totalTrips > 0
                      ? CurrencyFormatter.format(earnings.averageFare)
                      : '\$0',
                ),
                _MetricItem(
                  icon: Icons.star_rounded,
                  label: 'Mejor viaje',
                  value: earnings.bestTripEarning > 0
                      ? CurrencyFormatter.format(earnings.bestTripEarning)
                      : '\$0',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricItem extends StatelessWidget {
  const _MetricItem({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: Colors.white70, size: 20),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 13,
          ),
        ),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white60,
            fontSize: 11,
          ),
        ),
      ],
    );
  }
}
