import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/passenger_rating_sheet.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

/// Pantalla de resumen de viaje completado.
/// Recibe un [TripModel] como `extra` desde el router tras finalizar el viaje.
class TripSummaryScreen extends ConsumerStatefulWidget {
  const TripSummaryScreen({required this.trip, super.key});

  final TripModel trip;

  @override
  ConsumerState<TripSummaryScreen> createState() => _TripSummaryScreenState();
}

class _TripSummaryScreenState extends ConsumerState<TripSummaryScreen> {
  TripModel get trip => widget.trip;

  @override
  void initState() {
    super.initState();
    if (!trip.isDeliveryTrip) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        Future.delayed(const Duration(milliseconds: 600), () {
          if (mounted) {
            PassengerRatingSheet.show(
              context,
              passengerName: trip.passengerName,
            );
          }
        });
      });
    }
  }

  @override
  Widget build(BuildContext context) {
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
                  decoration: BoxDecoration(
                    color: trip.isDeliveryTrip
                        ? AppColors.serviceEnvios
                        : AppColors.primary,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    trip.isDeliveryTrip
                        ? Icons.inventory_2_rounded
                        : Icons.check_rounded,
                    color: Colors.white,
                    size: 48,
                  ),
                ),
              ),
              const SizedBox(height: AppConstants.spacingM),

              Text(
                trip.isDeliveryTrip
                    ? '¡Entrega completada!'
                    : '¡Viaje completado!',
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
                        label: trip.isDeliveryTrip
                            ? 'Destinatario'
                            : 'Pasajero',
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

              // ── Prueba de entrega ────────────────────────────────────────
              if (trip.isDeliveryTrip)
                Card(
                  shape: RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.circular(AppConstants.radiusMedium),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(AppConstants.spacingM),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.verified_rounded,
                              color: AppColors.serviceEnvios,
                              size: 18,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'Prueba de entrega',
                              style: theme.textTheme.titleSmall
                                  ?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppConstants.spacingM),
                        _ProofItem(
                          icon: Icons.photo_camera_rounded,
                          label: 'Foto del paquete',
                          captured: trip.hasDeliveryPhoto,
                        ),
                        _ProofItem(
                          icon: Icons.draw_rounded,
                          label: 'Firma del destinatario',
                          captured: trip.hasSignature,
                        ),
                      ],
                    ),
                  ),
                ),

              if (trip.isDeliveryTrip)
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
                      color: AppColors.primary.withValues(alpha: 0.25),
                    ),
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
                        color: AppColors.primary.withValues(alpha: 0.2),
                      ),
                      _SessionStat(
                        icon: Icons.payments_outlined,
                        label: 'Ganancias hoy',
                        value: CurrencyFormatter.format(
                          driverStatus.dailyEarnings,
                        ),
                      ),
                    ],
                  ),
                ),

              const SizedBox(height: AppConstants.spacingXL),

              // ── Calificar pasajero (solo viajes de personas) ─────────────
              if (!trip.isDeliveryTrip) ...[
                OutlinedButton.icon(
                  onPressed: () => PassengerRatingSheet.show(
                    context,
                    passengerName: trip.passengerName,
                  ),
                  icon: const Icon(Icons.star_outline_rounded),
                  label: const Text('Calificar pasajero'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(
                      AppConstants.minTouchTarget,
                    ),
                  ),
                ),
                const SizedBox(height: AppConstants.spacingM),
              ],

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
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
            ),
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
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
            ),
          ),
          Expanded(
            child: Text(
              value,
              style:
                  const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _ProofItem extends StatelessWidget {
  const _ProofItem({
    required this.icon,
    required this.label,
    required this.captured,
  });

  final IconData icon;
  final String label;
  final bool captured;

  @override
  Widget build(BuildContext context) {
    final color =
        captured ? AppColors.serviceEnvios : AppColors.textSecondary;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: 8,
              vertical: 3,
            ),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              captured ? '✓ Capturado' : 'Sin captura',
              style: TextStyle(
                color: color,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
