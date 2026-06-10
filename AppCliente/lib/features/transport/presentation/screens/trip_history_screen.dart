import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/utils/date_formatter.dart';
import 'package:nexum_client/core/widgets/empty_state.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';

/// Historial completo de viajes y envíos del cliente.
class TripHistoryScreen extends ConsumerWidget {
  const TripHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(tripHistoryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis viajes'),
        leading: const BackButton(),
      ),
      body: historyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const EmptyState(
          icon: Icons.cloud_off_rounded,
          title: 'No se pudo cargar',
          message: 'Revisa tu conexión e intenta de nuevo.',
        ),
        data: (trips) {
          if (trips.isEmpty) {
            return const EmptyState(
              icon: Icons.route_rounded,
              title: 'Sin viajes todavía',
              message: 'Cuando completes un viaje o envío aparecerá aquí.',
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(tripHistoryProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: trips.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (_, i) => _TripCard(trip: trips[i]),
            ),
          );
        },
      ),
    );
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({required this.trip});

  final TransportRequestEntity trip;

  @override
  Widget build(BuildContext context) {
    final cancelled = trip.isCancelled;
    final color = cancelled ? AppColors.textTertiary : _serviceColor(trip.serviceType);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.outlineLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(_serviceIcon(trip.serviceType), color: color, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      trip.serviceType.label,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      DateFormatter.formatRelativeDate(trip.createdAt),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textTertiary,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    CurrencyFormatter.format(trip.estimatedFare),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: cancelled ? AppColors.textTertiary : null,
                      decoration: cancelled ? TextDecoration.lineThrough : null,
                    ),
                  ),
                  _StatusChip(cancelled: cancelled),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          _RouteLine(
            icon: Icons.trip_origin_rounded,
            iconColor: AppColors.primary,
            text: trip.originAddress,
          ),
          const SizedBox(height: 6),
          _RouteLine(
            icon: Icons.place_rounded,
            iconColor: AppColors.error,
            text: trip.destinationAddress,
          ),
          if (trip.driverName != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(Icons.person_outline_rounded,
                    size: 16, color: AppColors.textSecondary),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    trip.driverVehicle != null
                        ? '${trip.driverName} · ${trip.driverVehicle}'
                        : trip.driverName!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
                if (trip.rating != null) ...[
                  const Icon(Icons.star_rounded,
                      size: 16, color: Color(0xFFFFB300)),
                  Text(
                    '${trip.rating}',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _RouteLine extends StatelessWidget {
  const _RouteLine({
    required this.icon,
    required this.iconColor,
    required this.text,
  });

  final IconData icon;
  final Color iconColor;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 14, color: iconColor),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13),
          ),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.cancelled});

  final bool cancelled;

  @override
  Widget build(BuildContext context) {
    final color = cancelled ? AppColors.error : AppColors.primary;
    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        cancelled ? 'Cancelado' : 'Completado',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

IconData _serviceIcon(TransportServiceType t) => switch (t) {
      TransportServiceType.transporte => Icons.directions_car_rounded,
      TransportServiceType.moto => Icons.two_wheeler_rounded,
      TransportServiceType.envios => Icons.inventory_2_rounded,
    };

Color _serviceColor(TransportServiceType t) => switch (t) {
      TransportServiceType.transporte => AppColors.serviceParticular,
      TransportServiceType.moto => AppColors.serviceMoto,
      TransportServiceType.envios => AppColors.serviceEnvios,
    };
