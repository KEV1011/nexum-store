import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';

/// Tarjeta inferior para el estado (a): conductor yendo al punto de recogida.
///
/// Para envíos: muestra el restaurante/local como destino de recogida.
/// Para transporte: muestra al pasajero.
class GoingToPassengerCard extends ConsumerWidget {
  const GoingToPassengerCard({
    super.key,
    required this.trip,
    this.routeProgress = 0.0,
    this.isEnvios = false,
    this.onArrived,
    this.onCancelled,
  });

  final ActiveTripEntity trip;
  final double routeProgress;
  final bool isEnvios;
  final VoidCallback? onArrived;
  final VoidCallback? onCancelled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final passenger = trip.request.passenger;
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: context.surfaceColor,
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
                    valueColor: AlwaysStoppedAnimation<Color>(
                      isEnvios
                          ? AppColors.serviceEnvios
                          : AppColors.pickupMarker,
                    ),
                    minHeight: 5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${(value * 100).round()}% hacia '
                  '${isEnvios ? 'el local' : 'el pasajero'}',
                  style: TextStyle(
                    fontSize: 11,
                    color: context.textSecondaryColor,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: AppConstants.spacingM),

          // ── Info row (passenger OR business) ─────────────────────────────
          if (isEnvios)
            _EnviosPickupInfo(trip: trip, theme: theme)
          else
            _PassengerInfo(
              passenger: passenger,
              theme: theme,
              // Privacy: the passenger's real number stays hidden. Direct dialing
              // is disabled until a call-proxy is integrated; chat is the channel.
              onCall: () => AppSnackbar.showInfo(
                context,
                'Por privacidad, el número del pasajero está protegido. '
                'Comunícate por el chat in-app.',
              ),
              onMessage: () => AppSnackbar.showInfo(
                context,
                'Abriendo chat con ${passenger.firstName}...',
              ),
            ),

          const SizedBox(height: AppConstants.spacingM),
          const Divider(color: AppColors.divider, height: 1),
          const SizedBox(height: AppConstants.spacingM),

          // ── Pickup address ───────────────────────────────────────────────
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                isEnvios
                    ? Icons.storefront_rounded
                    : Icons.radio_button_checked,
                color: isEnvios
                    ? AppColors.serviceEnvios
                    : AppColors.primary,
                size: 20,
              ),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isEnvios
                          ? 'Dirección del local'
                          : 'Punto de recogida',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: context.textSecondaryColor,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      trip.request.origin.address,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: context.textPrimaryColor,
                      ),
                    ),
                    if (trip.request.origin.reference != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        trip.request.origin.reference!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: context.textSecondaryColor,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: AppConstants.spacingM),

          // ── Cancel button (text) ─────────────────────────────────────────
          Center(
            child: TextButton(
              onPressed: () => _confirmCancel(context, ref),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.error,
              ),
              child: const Text(
                'Cancelar viaje',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
            ),
          ),

          const SizedBox(height: AppConstants.spacingS),

          // ── CTA ──────────────────────────────────────────────────────────
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton.icon(
              onPressed: onArrived,
              icon: Icon(
                isEnvios
                    ? Icons.storefront_rounded
                    : Icons.location_on_rounded,
                size: 20,
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: isEnvios
                    ? AppColors.serviceEnvios
                    : AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(
                    AppConstants.radiusMedium,
                  ),
                ),
                elevation: 2,
              ),
              label: Text(
                isEnvios
                    ? 'Llegué al local'
                    : 'He llegado',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmCancel(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Cancelar viaje?'),
        content: const Text(
          'Si cancelas, la solicitud será devuelta y podrías recibir una penalización.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('No, continuar'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Sí, cancelar'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      onCancelled?.call();
    }
  }
}

// ── _PassengerInfo ────────────────────────────────────────────────────────────

class _PassengerInfo extends StatelessWidget {
  const _PassengerInfo({
    required this.passenger,
    required this.theme,
    required this.onCall,
    required this.onMessage,
  });

  final dynamic passenger;
  final ThemeData theme;
  final VoidCallback onCall;
  final VoidCallback onMessage;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        CircleAvatar(
          radius: 24,
          backgroundColor:
              AppColors.primary.withValues(alpha: 0.15),
          child: Text(
            (passenger.firstName as String).isNotEmpty
                ? (passenger.firstName as String)[0]
                    .toUpperCase()
                : 'P',
            style: const TextStyle(
              color: AppColors.primary,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        const SizedBox(width: AppConstants.spacingM),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                passenger.name as String,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: context.textPrimaryColor,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  const Icon(
                    Icons.star_rounded,
                    color: AppColors.star,
                    size: 16,
                  ),
                  const SizedBox(width: 2),
                  Text(
                    (passenger.rating as double)
                        .toStringAsFixed(1),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: context.textSecondaryColor,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        _ActionButton(
          icon: Icons.phone_outlined,
          color: AppColors.primary,
          tooltip: 'Llamar',
          onTap: onCall,
        ),
        const SizedBox(width: AppConstants.spacingS),
        _ActionButton(
          icon: Icons.chat_bubble_outline_rounded,
          color: AppColors.info,
          tooltip: 'Mensajes',
          onTap: onMessage,
        ),
      ],
    );
  }
}

// ── _EnviosPickupInfo ─────────────────────────────────────────────────────────

class _EnviosPickupInfo extends StatelessWidget {
  const _EnviosPickupInfo({
    required this.trip,
    required this.theme,
  });

  final ActiveTripEntity trip;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    const accent = AppColors.serviceEnvios;
    return Row(
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(
            Icons.storefront_rounded,
            color: accent,
            size: 24,
          ),
        ),
        const SizedBox(width: AppConstants.spacingM),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                trip.request.passenger.name,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: context.textPrimaryColor,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  Icon(
                    Icons.inventory_2_outlined,
                    size: 13,
                    color: context.textSecondaryColor,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Al llegar: fotografía el pedido',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: accent.withValues(alpha: 0.8),
                      fontWeight: FontWeight.w600,
                      fontSize: 11.5,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── _ActionButton ─────────────────────────────────────────────────────────────

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.color,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 22),
        ),
      ),
    );
  }
}
