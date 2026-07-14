import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';

/// Tarjeta inferior para el estado (c): viaje en curso hacia el destino.
///
/// Muestra: destino, tarifa acumulada en tiempo real, tiempo/distancia estimada
/// y CTA "Finalizar viaje" con diálogo de confirmación.
class TripInProgressCard extends StatelessWidget {
  const TripInProgressCard({
    super.key,
    required this.trip,
    this.routeProgress = 0.0,
    this.onFinishTrip,
  });

  final ActiveTripEntity trip;
  final double routeProgress;
  final VoidCallback? onFinishTrip;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final remainingMinutes =
        (trip.request.durationMinutes - trip.elapsedTripMinutes)
            .clamp(0, trip.request.durationMinutes);
    final distanceKm = trip.request.distanceKm;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(AppConstants.radiusXLarge),
        ),
        boxShadow: const [
          BoxShadow(
            color: AppColors.shadow,
            blurRadius: 16,
            offset: Offset(0, -4),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(
        AppConstants.spacingM,
        AppConstants.spacingM,
        AppConstants.spacingM,
        AppConstants.spacingL,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Drag handle ──────────────────────────────────────────────────
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: AppConstants.spacingM),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // ── Route progress bar ───────────────────────────────────────────
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0.0, end: routeProgress),
            duration: const Duration(milliseconds: 700),
            curve: Curves.easeOut,
            builder: (_, value, __) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: value,
                    backgroundColor: context.outlineColor,
                    valueColor: const AlwaysStoppedAnimation<Color>(
                        AppColors.primary),
                    minHeight: 5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${(value * 100).round()}% del trayecto recorrido',
                  style: TextStyle(
                    fontSize: 11,
                    color: context.textSecondaryColor,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: AppConstants.spacingM),

          // ── Status chip ──────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppConstants.spacingS,
              vertical: 4,
            ),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: AppConstants.spacingXS),
                Text(
                  'En camino al destino',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: AppConstants.spacingM),

          // ── Destination row ──────────────────────────────────────────────
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.location_on_rounded,
                color: AppColors.destinationMarker,
                size: 22,
              ),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Destino',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: context.textSecondaryColor,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      trip.request.destination.address,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: context.textPrimaryColor,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: AppConstants.spacingM),
          const Divider(color: AppColors.divider, height: 1),
          const SizedBox(height: AppConstants.spacingM),

          // ── Accumulated fare ─────────────────────────────────────────────
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Tarifa acumulada',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: context.textSecondaryColor,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    CurrencyFormatter.format(trip.accumulatedFare),
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primary,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),

              // Stats
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _StatChip(
                    icon: Icons.access_time_rounded,
                    label: remainingMinutes <= 0
                        ? 'Llegando'
                        : '~$remainingMinutes min',
                    color: AppColors.info,
                  ),
                  const SizedBox(height: 4),
                  _StatChip(
                    icon: Icons.route_rounded,
                    label: '${distanceKm.toStringAsFixed(1)} km',
                    color: AppColors.secondary,
                  ),
                ],
              ),
            ],
          ),

          const SizedBox(height: AppConstants.spacingL),

          // ── CTA: Finalizar viaje ─────────────────────────────────────────
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: () => _confirmFinish(context),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius:
                      BorderRadius.circular(AppConstants.radiusMedium),
                ),
                elevation: 2,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: const [
                  Icon(Icons.flag_rounded, size: 22),
                  SizedBox(width: AppConstants.spacingS),
                  Text(
                    'Finalizar viaje',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmFinish(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Confirmar finalización del viaje?'),
        content: Text(
          '¿Has llegado al destino?\n\n${trip.request.destination.address}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
            ),
            child: const Text('Confirmar'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      onFinishTrip?.call();
    }
  }
}

// ── _StatChip ─────────────────────────────────────────────────────────────────

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ],
    );
  }
}
