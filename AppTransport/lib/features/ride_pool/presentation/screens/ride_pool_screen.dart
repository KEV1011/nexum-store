import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/features/ride_pool/domain/entities/ride_entities.dart';
import 'package:nexum_driver/features/ride_pool/presentation/providers/ride_pool_provider.dart';
import 'package:nexum_driver/features/ride_pool/presentation/screens/ride_chat_screen.dart';

class RidePoolScreen extends ConsumerStatefulWidget {
  const RidePoolScreen({super.key});

  @override
  ConsumerState<RidePoolScreen> createState() => _RidePoolScreenState();
}

class _RidePoolScreenState extends ConsumerState<RidePoolScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(ridePoolProvider.notifier).register();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(ridePoolProvider);
    final notifier = ref.read(ridePoolProvider.notifier);

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        title: const Text('Solicitudes en vivo'),
        backgroundColor: AppColors.surfaceLight,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
      ),
      body: state.activeRide != null
          ? _ActiveRideView(
              ride: state.activeRide!,
              onAdvance: (s) => notifier.advance(state.activeRide!.id, s),
              onCancel: notifier.cancelActive,
            )
          : Column(
              children: [
                _poolBanner(state.openRides.length),
                Expanded(
                  child: state.openRides.isEmpty
                      ? _empty()
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                          itemCount: state.openRides.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (_, i) {
                            final ride = state.openRides[i];
                            return _RequestCard(
                              ride: ride,
                              myBid: notifier.myBids[ride.id],
                              onBid: (fare, eta) => notifier.bid(ride.id, fare, eta),
                              onWithdraw: () => notifier.withdraw(ride.id),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }

  Widget _poolBanner(int count) => Container(
        width: double.infinity,
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.primaryContainer,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            const Icon(Icons.bolt_rounded, color: AppColors.primaryDim),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                count == 0
                    ? 'Conectado al pool. Esperando solicitudes…'
                    : '$count solicitud(es) disponible(s). Haz tu oferta.',
                style: const TextStyle(
                    color: AppColors.primaryDim, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );

  Widget _empty() => ListView(
        children: const [
          SizedBox(height: 80),
          Icon(Icons.inbox_rounded, size: 60, color: AppColors.textTertiary),
          SizedBox(height: 12),
          Center(
            child: Text('No hay solicitudes por ahora.',
                style: TextStyle(color: AppColors.textSecondary)),
          ),
        ],
      );
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({
    required this.ride,
    required this.myBid,
    required this.onBid,
    required this.onWithdraw,
  });

  final RideEntity ride;
  final double? myBid;
  final void Function(double fare, int eta) onBid;
  final VoidCallback onWithdraw;

  @override
  Widget build(BuildContext context) {
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
              CircleAvatar(
                radius: 18,
                backgroundColor: AppColors.surfaceVariantLight,
                child: Text(
                  ride.clientName.isNotEmpty ? ride.clientName[0].toUpperCase() : '?',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(ride.clientName,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text('${ride.distanceKm.toStringAsFixed(1)} km · ${ride.etaMinutes} min',
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.textSecondary)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text('Ofrece',
                      style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                  Text(CurrencyFormatter.format(ride.offeredFare),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                          color: AppColors.primaryDim)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          _routeRow(Icons.trip_origin_rounded, ride.originAddress, AppColors.primary),
          const SizedBox(height: 4),
          _routeRow(Icons.place_rounded, ride.destinationAddress, AppColors.error),
          if (ride.notes != null && ride.notes!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('“${ride.notes}”',
                style: const TextStyle(
                    fontSize: 12.5,
                    fontStyle: FontStyle.italic,
                    color: AppColors.textSecondary)),
          ],
          const SizedBox(height: 14),
          if (myBid != null)
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.infoContainer,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text('Oferta enviada: ${CurrencyFormatter.format(myBid!)}',
                        style: const TextStyle(
                            color: AppColors.info, fontWeight: FontWeight.w700)),
                  ),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: onWithdraw,
                  child: const Text('Retirar',
                      style: TextStyle(color: AppColors.error)),
                ),
              ],
            )
          else
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => onBid(ride.offeredFare, ride.etaMinutes),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                    ),
                    child: Text('Aceptar ${CurrencyFormatter.format(ride.offeredFare)}'),
                  ),
                ),
                const SizedBox(width: 10),
                OutlinedButton(
                  onPressed: () => _showCounter(context),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primaryDim,
                    side: const BorderSide(color: AppColors.primaryDim),
                  ),
                  child: const Text('Contraoferta'),
                ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _routeRow(IconData icon, String text, Color color) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: const TextStyle(fontSize: 13),
                maxLines: 2,
                overflow: TextOverflow.ellipsis),
          ),
        ],
      );

  void _showCounter(BuildContext context) {
    final ctrl = TextEditingController(
      text: (ride.offeredFare + 1000).toStringAsFixed(0),
    );
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surfaceLight,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Tu contraoferta',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('El pasajero ofreció ${CurrencyFormatter.format(ride.offeredFare)}.',
                style: const TextStyle(color: AppColors.textSecondary)),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              keyboardType: TextInputType.number,
              autofocus: true,
              decoration: const InputDecoration(
                prefixText: r'$ ',
                labelText: 'Precio (COP)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: () {
                  final fare = double.tryParse(
                      ctrl.text.replaceAll(RegExp(r'[^0-9.]'), ''));
                  if (fare != null && fare > 0) {
                    onBid(fare, ride.etaMinutes);
                    Navigator.pop(ctx);
                  }
                },
                child: const Text('Enviar contraoferta'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActiveRideView extends StatelessWidget {
  const _ActiveRideView({
    required this.ride,
    required this.onAdvance,
    required this.onCancel,
  });

  final RideEntity ride;
  final void Function(String status) onAdvance;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(18),
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
                    child: Text(ride.clientName,
                        style: const TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w800)),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: ride.status.color.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(ride.status.label,
                        style: TextStyle(
                            color: ride.status.color,
                            fontWeight: FontWeight.w700,
                            fontSize: 12)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text('Tarifa acordada: ${CurrencyFormatter.format(ride.offeredFare)}',
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, color: AppColors.primaryDim)),
              const SizedBox(height: 12),
              Row(children: [
                const Icon(Icons.trip_origin_rounded,
                    size: 16, color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(child: Text(ride.originAddress)),
              ]),
              const SizedBox(height: 4),
              Row(children: [
                const Icon(Icons.place_rounded, size: 16, color: AppColors.error),
                const SizedBox(width: 8),
                Expanded(child: Text(ride.destinationAddress)),
              ]),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => RideChatScreen(
                      rideId: ride.id,
                      peerName: ride.clientName,
                    ),
                  ),
                ),
                icon: const Icon(Icons.chat_bubble_outline_rounded),
                label: const Text('Chatear con el pasajero'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _lifecycleButton(),
        const SizedBox(height: 8),
        if (ride.status != RideStatus.inProgress)
          TextButton(
            onPressed: onCancel,
            child: const Text('Cancelar viaje',
                style: TextStyle(color: AppColors.error)),
          ),
      ],
    );
  }

  Widget _lifecycleButton() {
    String? next;
    String label;
    switch (ride.status) {
      case RideStatus.matched:
        next = 'arriving';
        label = 'Voy en camino';
      case RideStatus.arriving:
        next = 'arrived';
        label = 'Llegué al punto';
      case RideStatus.arrived:
        next = 'in_progress';
        label = 'Iniciar viaje';
      case RideStatus.inProgress:
        next = 'completed';
        label = 'Finalizar viaje';
      default:
        return const SizedBox.shrink();
    }
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 15),
        ),
        onPressed: () => onAdvance(next!),
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }
}
