import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/passenger_rating_sheet.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';
import 'package:nexum_driver/features/trip_history/presentation/providers/trip_history_provider.dart';
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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(tripHistoryProvider.notifier).add(trip);
      Future.delayed(const Duration(milliseconds: 600), () {
        if (mounted) _openRating();
      });
    });
  }

  void _openRating() {
    PassengerRatingSheet.show(
      context,
      passengerName: trip.passengerName,
      subjectNoun: trip.isDeliveryTrip ? 'cliente' : 'pasajero',
      onSubmit: (rating, _) {
        ref.read(tripHistoryProvider.notifier).rate(trip.id, rating.toDouble());
      },
    );
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

              // ── Cadena de custodia ───────────────────────────────────────
              if (trip.isDeliveryTrip) ...[
                _ChainOfCustodyCard(trip: trip),
                const SizedBox(height: AppConstants.spacingM),
              ],

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

              // ── Calificar pasajero / cliente ─────────────────────────────
              OutlinedButton.icon(
                onPressed: _openRating,
                icon: const Icon(Icons.star_outline_rounded),
                label: Text(
                  trip.isDeliveryTrip
                      ? 'Calificar cliente'
                      : 'Calificar pasajero',
                ),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(
                    AppConstants.minTouchTarget,
                  ),
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

// ── Chain of custody ──────────────────────────────────────────────────────────

/// Amazon-style proof timeline for Envíos: shows the order photographed
/// at the store (pickup) and the proof captured at the customer's door
/// (delivery), each with a real photo thumbnail and timestamp.
///
/// This is the anti-Rappi differentiator: an immutable audit trail that
/// certifies the order left the establishment complete and arrived.
class _ChainOfCustodyCard extends StatelessWidget {
  const _ChainOfCustodyCard({required this.trip});
  final TripModel trip;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const accent = AppColors.serviceEnvios;
    final verified = trip.hasFullChainOfCustody;

    return Card(
      shape: RoundedRectangleBorder(
        borderRadius:
            BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header with verified badge ─────────────────────────
            Row(
              children: [
                const Icon(
                  Icons.shield_rounded,
                  color: accent,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Cadena de custodia',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: (verified
                            ? AppColors.success
                            : AppColors.warning)
                        .withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        verified
                            ? Icons.verified_rounded
                            : Icons.info_outline_rounded,
                        size: 12,
                        color: verified
                            ? AppColors.success
                            : AppColors.warning,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        verified ? 'Verificada' : 'Parcial',
                        style: TextStyle(
                          color: verified
                              ? AppColors.success
                              : AppColors.warning,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: AppConstants.spacingM),

            // ── Step 1: pickup at store ────────────────────────────
            _CustodyStep(
              icon: Icons.storefront_rounded,
              title: 'Recogido en el local',
              subtitle: trip.origin.address,
              timestamp: trip.pickedUpAt,
              photoPath: trip.pickupPhotoPath,
              orderRef: trip.pickupOrderRef,
              accent: accent,
              isFirst: true,
            ),

            // ── Connector ──────────────────────────────────────────
            const _CustodyConnector(accent: accent),

            // ── Step 2: delivery to customer ───────────────────────
            _CustodyStep(
              icon: Icons.home_rounded,
              title: 'Entregado al cliente',
              subtitle: trip.destination.address,
              timestamp: trip.finishedAt,
              photoPath: trip.deliveryPhotoPath,
              hasSignature: trip.hasSignature,
              accent: accent,
              isLast: true,
            ),
          ],
        ),
      ),
    );
  }
}

class _CustodyConnector extends StatelessWidget {
  const _CustodyConnector({required this.accent});
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 17),
      child: Row(
        children: [
          Container(
            width: 2,
            height: 22,
            color: accent.withValues(alpha: 0.3),
          ),
        ],
      ),
    );
  }
}

class _CustodyStep extends StatelessWidget {
  const _CustodyStep({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.timestamp,
    required this.accent,
    this.photoPath,
    this.orderRef,
    this.hasSignature = false,
    this.isFirst = false,
    this.isLast = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final DateTime? timestamp;
  final Color accent;
  final String? photoPath;
  final String? orderRef;
  final bool hasSignature;
  final bool isFirst;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasPhoto = photoPath != null;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Timeline node ──────────────────────────────────────────
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 18, color: accent),
        ),
        const SizedBox(width: AppConstants.spacingM),

        // ── Content ────────────────────────────────────────────────
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (timestamp != null)
                    Text(
                      DateFormatter.formatTime(timestamp!),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: accent,
                        fontWeight: FontWeight.w700,
                        fontFeatures: const [
                          FontFeature.tabularFigures(),
                        ],
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              if (orderRef != null) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(
                      Icons.receipt_long_rounded,
                      size: 12,
                      color: AppColors.textSecondary,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      orderRef!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: AppConstants.spacingS),

              // ── Photo + signature chips ──────────────────────────
              Row(
                children: [
                  if (hasPhoto)
                    _PhotoThumb(path: photoPath!, accent: accent)
                  else
                    _MissingProofChip(
                      label: 'Sin foto',
                    ),
                  if (hasSignature) ...[
                    const SizedBox(width: AppConstants.spacingS),
                    _SignatureChip(accent: accent),
                  ],
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PhotoThumb extends StatelessWidget {
  const _PhotoThumb({required this.path, required this.accent});
  final String path;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Stack(
        children: [
          Image.file(
            File(path),
            width: 64,
            height: 64,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Container(
              width: 64,
              height: 64,
              color: accent.withValues(alpha: 0.1),
              child: Icon(
                Icons.image_rounded,
                color: accent,
                size: 24,
              ),
            ),
          ),
          Positioned(
            right: 2,
            bottom: 2,
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: const BoxDecoration(
                color: AppColors.success,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.check_rounded,
                size: 10,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SignatureChip extends StatelessWidget {
  const _SignatureChip({required this.accent});
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: accent.withValues(alpha: 0.25),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.draw_rounded, size: 20, color: accent),
          const SizedBox(height: 2),
          Text(
            'Firmado',
            style: TextStyle(
              color: accent,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _MissingProofChip extends StatelessWidget {
  const _MissingProofChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      width: 64,
      decoration: BoxDecoration(
        color: AppColors.textSecondary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: AppColors.textSecondary.withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.image_not_supported_outlined,
            size: 18,
            color: AppColors.textSecondary,
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 9,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
