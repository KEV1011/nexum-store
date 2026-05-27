import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

/// Tile expandible que muestra el resumen de un viaje completado.
/// Colapsado: ruta + tarifa + hora.
/// Expandido: distancia, duración, tarifa bruta, comisión y ganancia neta.
class TripHistoryTile extends StatelessWidget {
  const TripHistoryTile({super.key, required this.trip, required this.index});

  final TripModel trip;
  final int index;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(
        horizontal: AppConstants.spacingM,
        vertical: AppConstants.spacingXS,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: ExpansionTile(
        leading: CircleAvatar(
          backgroundColor: AppColors.primary.withOpacity(0.12),
          child: Text(
            '#${index + 1}',
            style: TextStyle(
              color: AppColors.primary,
              fontWeight: FontWeight.bold,
              fontSize: 12,
            ),
          ),
        ),
        title: Text(
          '${trip.origin.address} → ${trip.destination.address}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Text(
          DateFormatter.formatTime(trip.startedAt),
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              CurrencyFormatter.format(trip.netEarning),
              style: theme.textTheme.titleSmall?.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.bold,
              ),
            ),
            const Icon(Icons.expand_more, size: 16, color: Colors.grey),
          ],
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppConstants.spacingM,
              0,
              AppConstants.spacingM,
              AppConstants.spacingM,
            ),
            child: Column(
              children: [
                const Divider(),
                _DetailRow(
                  label: 'Pasajero',
                  value: trip.passengerName,
                  icon: Icons.person_rounded,
                ),
                _DetailRow(
                  label: 'Distancia',
                  value: '${trip.distanceKm.toStringAsFixed(1)} km',
                  icon: Icons.straighten_rounded,
                ),
                _DetailRow(
                  label: 'Duración',
                  value: '${trip.durationMinutes} min',
                  icon: Icons.timer_rounded,
                ),
                const Divider(),
                _DetailRow(
                  label: 'Tarifa bruta',
                  value: CurrencyFormatter.format(trip.grossFare),
                  icon: Icons.receipt_rounded,
                ),
                _DetailRow(
                  label: 'Comisión Nexum (15%)',
                  value: '- ${CurrencyFormatter.format(trip.commission)}',
                  icon: Icons.percent_rounded,
                  valueColor: AppColors.error,
                ),
                _DetailRow(
                  label: 'Tu ganancia',
                  value: CurrencyFormatter.format(trip.netEarning),
                  icon: Icons.savings_rounded,
                  valueColor: AppColors.primary,
                  isBold: true,
                ),
                if (trip.rating != null) ...[
                  const Divider(),
                  _DetailRow(
                    label: 'Calificación recibida',
                    value: '${trip.rating!.toStringAsFixed(1)} ⭐',
                    icon: Icons.star_rounded,
                    valueColor: AppColors.star,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    required this.icon,
    this.valueColor,
    this.isBold = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color? valueColor;
  final bool isBold;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.textSecondary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: AppColors.textSecondary,
                fontSize: 13,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: valueColor ?? AppColors.textPrimary,
              fontWeight: isBold ? FontWeight.bold : FontWeight.w500,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}
