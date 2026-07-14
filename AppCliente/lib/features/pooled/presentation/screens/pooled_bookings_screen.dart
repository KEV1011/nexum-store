import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/pooled/domain/entities/pooled_trip_entity.dart';
import 'package:nexum_client/features/pooled/presentation/providers/pooled_provider.dart';

const _kPooledColor = Color(0xFF1E3A8A);

class PooledBookingsScreen extends ConsumerStatefulWidget {
  const PooledBookingsScreen({super.key});

  @override
  ConsumerState<PooledBookingsScreen> createState() =>
      _PooledBookingsScreenState();
}

class _PooledBookingsScreenState extends ConsumerState<PooledBookingsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => ref.read(pooledProvider.notifier).loadMyBookings(),
    );
  }

  Future<void> _callDriver(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  Future<void> _cancel(PooledTripEntity trip) async {
    final booking = trip.myBooking;
    if (booking == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Cancelar reserva?'),
        content: Text(
          'Vas a liberar tus ${booking.seatsBooked} puesto(s) en el viaje '
          '${trip.origin.displayName} → ${trip.destination.displayName}.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('No')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Sí, cancelar'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final err = await ref.read(pooledProvider.notifier).cancelBooking(booking.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(err ?? 'Reserva cancelada'),
        backgroundColor: err == null ? AppColors.success : AppColors.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(pooledProvider);
    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: _kPooledColor,
        foregroundColor: Colors.white,
        title: const Text('Mis reservas'),
      ),
      body: state.isLoadingBookings
          ? const Center(child: CircularProgressIndicator(color: _kPooledColor))
          : state.myBookings.isEmpty
              ? _empty()
              : RefreshIndicator(
                  color: _kPooledColor,
                  onRefresh: () =>
                      ref.read(pooledProvider.notifier).loadMyBookings(),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: state.myBookings.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => _BookingCard(
                      trip: state.myBookings[i],
                      onCall: () => _callDriver(state.myBookings[i].driverPhone),
                      onCancel: () => _cancel(state.myBookings[i]),
                    ),
                  ),
                ),
    );
  }

  Widget _empty() => ListView(
        children: [
          SizedBox(height: 100),
          Icon(Icons.confirmation_number_outlined,
              size: 64, color: context.textSecondaryColor),
          SizedBox(height: 16),
          Center(
            child: Text('Aún no tienes reservas de viajes compartidos.',
                style: TextStyle(color: context.textSecondaryColor)),
          ),
        ],
      );
}

class _BookingCard extends StatelessWidget {
  const _BookingCard({
    required this.trip,
    required this.onCall,
    required this.onCancel,
  });

  final PooledTripEntity trip;
  final VoidCallback onCall;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final booking = trip.myBooking;
    final t = trip.departureTime;
    final timeLabel =
        '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    final seats = booking?.seatsBooked ?? 1;
    final canCancel = trip.status == PooledTripStatus.open ||
        trip.status == PooledTripStatus.full;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor2,
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
          _row(Icons.schedule_rounded,
              '$timeLabel · ${t.day}/${t.month}/${t.year}'),
          _row(Icons.event_seat_rounded,
              '$seats puesto(s) · ${CurrencyFormatter.format(trip.farePerSeat * seats)}'),
          _row(Icons.directions_car_rounded,
              '${trip.driverName} · ${trip.vehicleDescription}'),
          if (booking?.pickupAddress != null && booking!.pickupAddress!.isNotEmpty)
            _row(Icons.my_location_rounded, booking.pickupAddress!),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onCall,
                  icon: const Icon(Icons.phone_rounded, size: 18),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _kPooledColor,
                    side: const BorderSide(color: _kPooledColor),
                  ),
                  label: const Text('Llamar'),
                ),
              ),
              if (canCancel) ...[
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onCancel,
                    icon: const Icon(Icons.close_rounded, size: 18),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.error,
                      side: const BorderSide(color: AppColors.error),
                    ),
                    label: const Text('Cancelar'),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _row(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          children: [
            Icon(icon, size: 15, color: context.textSecondaryColor),
            const SizedBox(width: 8),
            Expanded(
              child: Text(text,
                  style: TextStyle(
                      fontSize: 13, color: context.textSecondaryColor)),
            ),
          ],
        ),
      );
}
