import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';

/// Tarjeta inferior para el estado (b): conductor esperando / en el local.
///
/// Para transporte: cronómetro de espera + CTA "Iniciar viaje".
/// Para envíos: checklist de pasos + CTA "Fotografiar pedido" que abre
/// el PickupProofSheet antes de iniciar la entrega.
class WaitingPassengerCard extends StatelessWidget {
  const WaitingPassengerCard({
    super.key,
    required this.trip,
    this.isEnvios = false,
    this.isMandado = false,
    this.onStartTrip,
    this.onPickupConfirm,
  });

  final ActiveTripEntity trip;
  final bool isEnvios;
  final bool isMandado;
  final VoidCallback? onStartTrip;
  final VoidCallback? onPickupConfirm;

  @override
  Widget build(BuildContext context) {
    return isEnvios
        ? _buildEnviosCard(context)
        : _buildTransportCard(context);
  }

  Widget _buildTransportCard(BuildContext context) {
    final passenger = trip.request.passenger;
    final theme = Theme.of(context);
    final waitingTime = _formatTime(trip.waitingSeconds);

    return _CardShell(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            'Esperando a ${passenger.firstName}',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppConstants.spacingL),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppConstants.spacingXL,
              vertical: AppConstants.spacingM,
            ),
            decoration: BoxDecoration(
              color: AppColors.waiting.withValues(alpha: 0.08),
              borderRadius:
                  BorderRadius.circular(AppConstants.radiusLarge),
              border: Border.all(
                color: AppColors.waiting.withValues(alpha: 0.3),
                width: 1.5,
              ),
            ),
            child: Column(
              children: [
                Text(
                  waitingTime,
                  style: TextStyle(
                    fontSize: 48,
                    fontWeight: FontWeight.w800,
                    color: AppColors.waiting,
                    fontFeatures: const [
                      FontFeature.tabularFigures(),
                    ],
                    letterSpacing: 2,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'tiempo de espera',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: AppColors.textSecondary,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.notifications_active_outlined,
                size: 16,
                color: AppColors.textSecondary,
              ),
              const SizedBox(width: AppConstants.spacingXS),
              Text(
                'El pasajero fue notificado de tu llegada',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingL),
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: onStartTrip,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(
                    AppConstants.radiusMedium,
                  ),
                ),
                elevation: 2,
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.play_arrow_rounded, size: 24),
                  SizedBox(width: AppConstants.spacingS),
                  Text(
                    'Iniciar viaje',
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

  Widget _buildEnviosCard(BuildContext context) {
    final theme = Theme.of(context);
    final accent = isMandado ? AppColors.warning : AppColors.serviceEnvios;
    final headerIcon = isMandado ? Icons.run_circle_rounded : Icons.storefront_rounded;
    final headerTitle = isMandado ? 'Realizando el mandado' : 'En el local';
    final ctaLabel = isMandado
        ? 'Confirmar mandado · Iniciar entrega'
        : 'Fotografiar pedido · Iniciar entrega';
    final stepLabels = isMandado
        ? const [
            'Realiza el mandado / compras',
            'Fotografía la compra y el recibo',
            'Entrega al cliente en destino',
          ]
        : const [
            'Recibe el pedido del local',
            'Fotografía el pedido completo',
            'Entrega al cliente con firma',
          ];

    return _CardShell(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header ──────────────────────────────────────────────
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(headerIcon, color: accent, size: 20),
              ),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      headerTitle,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    Text(
                      trip.request.passenger.name,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: AppConstants.spacingM),

          // ── Step checklist ───────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(AppConstants.spacingM),
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
              border: Border.all(color: accent.withValues(alpha: 0.2)),
            ),
            child: Column(
              children: [
                _StepRow(number: '1', label: stepLabels[0], done: true, accent: accent),
                const SizedBox(height: AppConstants.spacingS),
                _StepRow(number: '2', label: stepLabels[1], done: false, accent: accent),
                const SizedBox(height: AppConstants.spacingS),
                _StepRow(number: '3', label: stepLabels[2], done: false, accent: accent, dimmed: true),
              ],
            ),
          ),

          const SizedBox(height: AppConstants.spacingM),

          // ── CTA ──────────────────────────────────────────────────
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton.icon(
              onPressed: onPickupConfirm,
              icon: const Icon(Icons.camera_alt_rounded, size: 22),
              style: ElevatedButton.styleFrom(
                backgroundColor: accent,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                ),
                elevation: 2,
              ),
              label: Text(
                ctaLabel,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Convierte segundos totales al formato MM:SS.
  String _formatTime(int totalSeconds) {
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:'
        '${seconds.toString().padLeft(2, '0')}';
  }
}

// ── Shared shell ──────────────────────────────────────────────────────────────

class _CardShell extends StatelessWidget {
  const _CardShell({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppConstants.radiusXLarge),
        ),
        boxShadow: [
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
        children: [
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(
              bottom: AppConstants.spacingM,
            ),
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          child,
        ],
      ),
    );
  }
}

// ── _StepRow ──────────────────────────────────────────────────────────────────

class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.number,
    required this.label,
    required this.done,
    required this.accent,
    this.dimmed = false,
  });

  final String number;
  final String label;
  final bool done;
  final Color accent;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final color = done
        ? accent
        : dimmed
            ? AppColors.textTertiary
            : AppColors.textPrimary;
    return Row(
      children: [
        Container(
          width: 22,
          height: 22,
          decoration: BoxDecoration(
            color: done
                ? accent
                : accent.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Center(
            child: done
                ? const Icon(
                    Icons.check_rounded,
                    size: 13,
                    color: Colors.white,
                  )
                : Text(
                    number,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: color,
                    ),
                  ),
          ),
        ),
        const SizedBox(width: AppConstants.spacingS),
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: done
                ? FontWeight.w600
                : FontWeight.w500,
            color: color,
            decoration: done
                ? TextDecoration.lineThrough
                : null,
            decorationColor:
                accent.withValues(alpha: 0.5),
          ),
        ),
      ],
    );
  }
}
