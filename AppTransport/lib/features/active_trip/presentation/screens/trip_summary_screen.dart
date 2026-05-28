import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

/// Pantalla de resumen de viaje completado.
/// Recibe un [TripModel] como `extra` desde el router tras finalizar el viaje.
class TripSummaryScreen extends ConsumerWidget {
  const TripSummaryScreen({required this.trip, super.key});

  final TripModel trip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final driverStatus = ref.watch(driverStatusProvider);

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

              // ── Ícono de éxito ──────────────────────────────────────────
              Center(
                child: Container(
                  width: 84,
                  height: 84,
                  decoration: const BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.check_rounded,
                    color: Colors.white,
                    size: 48,
                  ),
                ),
              ),
              const SizedBox(height: AppConstants.spacingM),

              Text(
                '¡Viaje completado!',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppConstants.spacingXS),
              Text(
                DateFormatter.formatDateTime(trip.finishedAt),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: AppConstants.spacingXL),

              // ── Tarjeta de ganancias ─────────────────────────────────────
              Card(
                elevation: 3,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(AppConstants.spacingL),
                  child: Column(
                    children: [
                      Text(
                        'Tus ganancias',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: AppConstants.spacingS),
                      Text(
                        CurrencyFormatter.format(trip.netEarning),
                        style: theme.textTheme.displaySmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.primary,
                        ),
                      ),
                      const SizedBox(height: AppConstants.spacingM),
                      Divider(color: AppColors.primary.withOpacity(0.15)),
                      const SizedBox(height: AppConstants.spacingS),
                      _FareRow(
                        label: 'Tarifa bruta',
                        value: CurrencyFormatter.format(trip.grossFare),
                      ),
                      _FareRow(
                        label: 'Comisión Nexum (${(AppConstants.platformCommissionRate * 100).toInt()}%)',
                        value: '- ${CurrencyFormatter.format(trip.commission)}',
                        valueColor: AppColors.error,
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: AppConstants.spacingM),

              // ── Detalles del viaje ─────────────────────────────────────────
              Card(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(AppConstants.spacingM),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Detalles del viaje',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
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
                        value: trip.origin.address,
                        color: AppColors.pickupMarker,
                      ),
                      _DetailRow(
                        icon: Icons.location_on_rounded,
                        label: 'Destino',
                        value: trip.destination.address,
                        color: AppColors.destinationMarker,
                      ),
                      _DetailRow(
                        icon: Icons.straighten_rounded,
                        label: 'Distancia',
                        value: '${trip.distanceKm.toStringAsFixed(1)} km',
                      ),
                      _DetailRow(
                        icon: Icons.timer_rounded,
                        label: 'Duración',
                        value: '${trip.durationMinutes} min',
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: AppConstants.spacingM),

              // ── Sesión de hoy ────────────────────────────────────────────
              if (driverStatus.dailyTrips > 0)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppConstants.spacingM,
                    vertical: AppConstants.spacingM,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.08),
                    borderRadius:
                        BorderRadius.circular(AppConstants.radiusMedium),
                    border: Border.all(
                        color: AppColors.primary.withValues(alpha: 0.25)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _SessionStat(
                        icon: Icons.two_wheeler_rounded,
                        label: 'Viajes hoy',
                        value: driverStatus.dailyTrips.toString(),
                      ),
                      Container(
                          width: 1,
                          height: 36,
                          color: AppColors.primary.withValues(alpha: 0.2)),
                      _SessionStat(
                        icon: Icons.payments_outlined,
                        label: 'Ganancias hoy',
                        value: CurrencyFormatter.format(
                            driverStatus.dailyEarnings),
                      ),
                    ],
                  ),
                ),

              const SizedBox(height: AppConstants.spacingXL),

              // ── Calificar pasajero ──────────────────────────────────────
              OutlinedButton.icon(
                onPressed: () => _showRatingDialog(context, ref),
                icon: const Icon(Icons.star_outline_rounded),
                label: const Text('Calificar pasajero'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(AppConstants.minTouchTarget),
                ),
              ),
              const SizedBox(height: AppConstants.spacingM),

              // ── Volver al inicio ─────────────────────────────────────────
              ElevatedButton.icon(
                onPressed: () => context.go('/home'),
                icon: const Icon(Icons.home_rounded),
                label: const Text('Volver al inicio'),
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                ),
              ),
              const SizedBox(height: AppConstants.spacingM),
            ],
          ),
        ),
      ),
    );
  }

  void _showRatingDialog(BuildContext context, WidgetRef ref) {
    var selectedRating = 5;
    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('Calificar pasajero'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('¿Cómo fue tu experiencia con ${trip.passengerName}?'),
              const SizedBox(height: AppConstants.spacingM),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (i) {
                  return IconButton(
                    onPressed: () => setState(() => selectedRating = i + 1),
                    icon: Icon(
                      i < selectedRating
                          ? Icons.star_rounded
                          : Icons.star_outline_rounded,
                      color: AppColors.star,
                      size: 32,
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    constraints: const BoxConstraints(),
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
                    content: Text('¡Calificación enviada! Gracias.'),
                    backgroundColor: AppColors.success,
                  ),
                );
              },
              child: const Text('Enviar'),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _FareRow extends StatelessWidget {
  const _FareRow({required this.label, required this.value, this.valueColor});
  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          Text(
            value,
            style: TextStyle(
              color: valueColor ?? AppColors.textPrimary,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

class _SessionStat extends StatelessWidget {
  const _SessionStat({
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
        Icon(icon, size: 16, color: AppColors.primary),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 15,
            color: AppColors.primary,
          ),
        ),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: AppColors.textSecondary,
          ),
        ),
      ],
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
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color ?? AppColors.textSecondary),
          const SizedBox(width: AppConstants.spacingS),
          Text(
            '$label: ',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
