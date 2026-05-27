import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/features/active_trip/presentation/screens/active_trip_screen.dart';

/// Pantalla de resumen de viaje completado.
///
/// Recibe un [CompletedTrip] como `extra` desde el router.
class TripSummaryScreen extends ConsumerWidget {
  const TripSummaryScreen({this.completedTrip, super.key});

  final Object? completedTrip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final trip = completedTrip is CompletedTrip
        ? completedTrip as CompletedTrip
        : null;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(
            horizontal: AppConstants.spacingL,
            vertical: AppConstants.spacingL,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: AppConstants.spacingL),
              // Success icon
              Center(
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: const BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.check_rounded,
                    color: AppColors.textOnPrimary,
                    size: 44,
                  ),
                ),
              ),
              const SizedBox(height: AppConstants.spacingM),
              Text(
                '¡Viaje completado!',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
                textAlign: TextAlign.center,
              ),
              if (trip != null) ...[
                const SizedBox(height: AppConstants.spacingXS),
                Text(
                  DateFormatter.formatDateTime(trip.completedAt),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
              const SizedBox(height: AppConstants.spacingXL),
              // Earnings card
              if (trip != null) ...[
                _EarningsCard(trip: trip),
                const SizedBox(height: AppConstants.spacingM),
                _TripDetailsCard(trip: trip),
              ] else ...[
                Center(
                  child: Text(
                    'No se encontraron datos del viaje.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: AppConstants.spacingXL),
              // Rate passenger
              OutlinedButton.icon(
                onPressed: () => _showRatingDialog(context),
                icon: const Icon(Icons.star_outline_rounded),
                label: const Text('Calificar pasajero'),
              ),
              const SizedBox(height: AppConstants.spacingM),
              // Go home
              ElevatedButton.icon(
                onPressed: () => context.go('/home'),
                icon: const Icon(Icons.home_rounded),
                label: const Text('Volver al inicio'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showRatingDialog(BuildContext context) {
    int selectedRating = 5;
    showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            return AlertDialog(
              title: const Text('Calificar pasajero'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('¿Cómo fue tu experiencia?'),
                  const SizedBox(height: AppConstants.spacingM),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(5, (i) {
                      return IconButton(
                        onPressed: () =>
                            setDialogState(() => selectedRating = i + 1),
                        icon: Icon(
                          i < selectedRating
                              ? Icons.star_rounded
                              : Icons.star_outline_rounded,
                          color: AppColors.star,
                          size: 32,
                        ),
                        constraints: const BoxConstraints(),
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                      );
                    }),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: const Text('Cancelar'),
                ),
                ElevatedButton(
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Calificación enviada. ¡Gracias!'),
                        backgroundColor: AppColors.success,
                      ),
                    );
                  },
                  child: const Text('Enviar'),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _EarningsCard extends StatelessWidget {
  const _EarningsCard({required this.trip});

  final CompletedTrip trip;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingL),
        child: Column(
          children: [
            Text(
              'Tus ganancias',
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: AppColors.textSecondary),
            ),
            const SizedBox(height: AppConstants.spacingS),
            Text(
              CurrencyFormatter.format(trip.netEarning),
              style: theme.textTheme.displaySmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(height: AppConstants.spacingS),
            Divider(
              color: AppColors.primary.withValues(alpha: 0.2),
            ),
            const SizedBox(height: AppConstants.spacingS),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Tarifa bruta',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: AppColors.textSecondary),
                ),
                Text(
                  CurrencyFormatter.format(trip.grossFare),
                  style: theme.textTheme.bodySmall
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Comisión plataforma (${(AppConstants.platformCommissionRate * 100).toInt()}%)',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: AppColors.textSecondary),
                ),
                Text(
                  '- ${CurrencyFormatter.format(trip.commission)}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.error,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _TripDetailsCard extends StatelessWidget {
  const _TripDetailsCard({required this.trip});

  final CompletedTrip trip;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Detalles del viaje',
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppConstants.spacingM),
            _DetailRow(
              icon: Icons.person_rounded,
              label: 'Pasajero',
              value: trip.passengerName,
            ),
            _DetailRow(
              icon: Icons.radio_button_checked_rounded,
              label: 'Origen',
              value: trip.pickupAddress,
              color: AppColors.pickupMarker,
            ),
            _DetailRow(
              icon: Icons.location_on_rounded,
              label: 'Destino',
              value: trip.destinationAddress,
              color: AppColors.destinationMarker,
            ),
            _DetailRow(
              icon: Icons.straighten_rounded,
              label: 'Distancia',
              value: '${trip.distanceKm.toStringAsFixed(1)} km',
            ),
            _DetailRow(
              icon: Icons.access_time_rounded,
              label: 'Duración',
              value: '${trip.durationMinutes} min',
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
    this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(
            icon,
            size: 16,
            color: color ?? AppColors.textSecondary,
          ),
          const SizedBox(width: AppConstants.spacingS),
          Text(
            '$label: ',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: AppColors.textSecondary),
          ),
          Expanded(
            child: Text(
              value,
              style: theme.textTheme.bodySmall
                  ?.copyWith(fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
