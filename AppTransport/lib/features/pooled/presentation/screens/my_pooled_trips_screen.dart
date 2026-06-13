import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/features/pooled/domain/entities/pooled_trip_entity.dart';
import 'package:nexum_driver/features/pooled/presentation/providers/pooled_driver_provider.dart';

const _kPooledColor = Color(0xFF1E3A8A);

class MyPooledTripsScreen extends ConsumerStatefulWidget {
  const MyPooledTripsScreen({super.key});

  @override
  ConsumerState<MyPooledTripsScreen> createState() =>
      _MyPooledTripsScreenState();
}

class _MyPooledTripsScreenState extends ConsumerState<MyPooledTripsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => ref.read(pooledDriverProvider.notifier).loadMine(),
    );
  }

  Future<void> _confirm(String title, String body, VoidCallback onYes) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('No')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Sí')),
        ],
      ),
    );
    if (ok == true) onYes();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(pooledDriverProvider);
    final notifier = ref.read(pooledDriverProvider.notifier);

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: _kPooledColor,
        foregroundColor: Colors.white,
        title: const Text('Mis viajes compartidos'),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _kPooledColor,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Publicar'),
        onPressed: () => context.push('/pooled-publish'),
      ),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator(color: _kPooledColor))
          : state.trips.isEmpty
              ? _empty()
              : RefreshIndicator(
                  color: _kPooledColor,
                  onRefresh: () => notifier.loadMine(),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                    itemCount: state.trips.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) {
                      final trip = state.trips[i];
                      return _PooledTripCard(
                        trip: trip,
                        onDepart: () => _confirm(
                          'Iniciar viaje',
                          '¿Marcar este viaje como en camino? Ya no se podrán reservar puestos.',
                          () => notifier.depart(trip.id),
                        ),
                        onComplete: () => _confirm(
                          'Finalizar viaje',
                          '¿Confirmas que el viaje terminó?',
                          () => notifier.complete(trip.id),
                        ),
                        onCancel: () => _confirm(
                          'Cancelar viaje',
                          'Se cancelará el viaje y se notificará a los pasajeros.',
                          () => notifier.cancel(trip.id),
                        ),
                      );
                    },
                  ),
                ),
    );
  }

  Widget _empty() => ListView(
        children: [
          const SizedBox(height: 100),
          const Icon(Icons.groups_rounded,
              size: 64, color: AppColors.textSecondary),
          const SizedBox(height: 16),
          const Center(
            child: Text('Aún no has publicado viajes compartidos.',
                style: TextStyle(color: AppColors.textSecondary)),
          ),
          const SizedBox(height: 16),
          Center(
            child: TextButton.icon(
              onPressed: () => context.push('/pooled-publish'),
              icon: const Icon(Icons.add_rounded, color: _kPooledColor),
              label: const Text('Publicar tu primer viaje',
                  style: TextStyle(color: _kPooledColor)),
            ),
          ),
        ],
      );
}

class _PooledTripCard extends StatelessWidget {
  const _PooledTripCard({
    required this.trip,
    required this.onDepart,
    required this.onComplete,
    required this.onCancel,
  });

  final PooledTripEntity trip;
  final VoidCallback onDepart;
  final VoidCallback onComplete;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final d = trip.departureTime;
    final dtLabel =
        '${d.day}/${d.month} · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardLight,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(color: Color(0x0F000000), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${trip.origin.displayName} → ${trip.destination.displayName}',
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w800),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: trip.status.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(trip.status.label,
                    style: TextStyle(
                        color: trip.status.color,
                        fontWeight: FontWeight.w700,
                        fontSize: 12)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.schedule_rounded,
                  size: 15, color: AppColors.textSecondary),
              const SizedBox(width: 6),
              Text(dtLabel,
                  style: const TextStyle(
                      fontSize: 13, color: AppColors.textSecondary)),
              const Spacer(),
              Text('${CurrencyFormatter.format(trip.farePerSeat)} / puesto',
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, color: _kPooledColor)),
            ],
          ),
          const SizedBox(height: 10),

          // Vehicle type + description
          Row(
            children: [
              Icon(trip.vehicleType.icon, size: 15, color: AppColors.textSecondary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '${trip.vehicleType.label} · ${trip.vehicleDescription}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 13, color: AppColors.textSecondary),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Occupancy
          Row(
            children: [
              const Icon(Icons.event_seat_rounded, size: 16, color: _kPooledColor),
              const SizedBox(width: 6),
              Text(
                '${trip.bookedSeats} de ${trip.totalSeats} puestos reservados',
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: trip.totalSeats == 0 ? 0 : trip.bookedSeats / trip.totalSeats,
              minHeight: 7,
              backgroundColor: AppColors.surfaceVariantLight,
              valueColor: const AlwaysStoppedAnimation(_kPooledColor),
            ),
          ),

          if (trip.bookings.isNotEmpty) ...[
            const SizedBox(height: 12),
            ...trip.bookings.map((b) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: [
                      const Icon(Icons.person_rounded,
                          size: 15, color: AppColors.textSecondary),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          '${b.passengerName} · ${b.seatsBooked} puesto(s)'
                          '${b.pickupAddress != null && b.pickupAddress!.isNotEmpty ? " · ${b.pickupAddress}" : ""}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 12.5, color: AppColors.textSecondary),
                        ),
                      ),
                    ],
                  ),
                )),
          ],

          const SizedBox(height: 12),
          _actions(),
        ],
      ),
    );
  }

  Widget _actions() {
    switch (trip.status) {
      case PooledTripStatus.open:
      case PooledTripStatus.full:
        return Row(
          children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: onDepart,
                icon: const Icon(Icons.play_arrow_rounded, size: 18),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kPooledColor,
                  foregroundColor: Colors.white,
                ),
                label: const Text('Iniciar'),
              ),
            ),
            const SizedBox(width: 10),
            OutlinedButton(
              onPressed: onCancel,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.error,
                side: const BorderSide(color: AppColors.error),
              ),
              child: const Text('Cancelar'),
            ),
          ],
        );
      case PooledTripStatus.departed:
        return SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: onComplete,
            icon: const Icon(Icons.flag_rounded, size: 18),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.success,
              foregroundColor: Colors.white,
            ),
            label: const Text('Finalizar viaje'),
          ),
        );
      case PooledTripStatus.completed:
      case PooledTripStatus.cancelled:
        return const SizedBox.shrink();
    }
  }
}
