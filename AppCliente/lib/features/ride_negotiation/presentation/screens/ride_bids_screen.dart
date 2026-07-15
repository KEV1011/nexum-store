import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/ride_negotiation/domain/entities/ride_entities.dart';
import 'package:nexum_client/features/ride_negotiation/presentation/providers/ride_negotiation_provider.dart';
import 'package:nexum_client/features/ride_negotiation/presentation/screens/ride_chat_screen.dart';

class RideBidsScreen extends ConsumerWidget {
  const RideBidsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(rideNegotiationProvider);
    final notifier = ref.read(rideNegotiationProvider.notifier);
    final ride = state.ride;

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        title: Text(ride?.status.label ?? 'Tu viaje'),
        backgroundColor: context.surfaceColor,
        foregroundColor: context.textPrimaryColor,
        elevation: 0,
      ),
      body: ride == null
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : ride.status == RideStatus.open
              ? _OpenBidsView(ride: ride, onAccept: notifier.acceptBid, onCancel: () {
                  notifier.cancel();
                  Navigator.of(context).maybePop();
                })
              : _MatchedView(ride: ride, onCancel: () {
                  notifier.cancel();
                  Navigator.of(context).maybePop();
                }),
    );
  }
}

class _OpenBidsView extends StatelessWidget {
  const _OpenBidsView({
    required this.ride,
    required this.onAccept,
    required this.onCancel,
  });

  final RideEntity ride;
  final void Function(String bidId) onAccept;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          color: AppColors.warningContainer,
          child: Column(
            children: [
              const SizedBox(
                height: 22,
                width: 22,
                child: CircularProgressIndicator(
                    strokeWidth: 2.5, color: AppColors.warning),
              ),
              const SizedBox(height: 10),
              Text(
                ride.bidCount == 0
                    ? 'Buscando conductores… tu oferta: ${CurrencyFormatter.format(ride.offeredFare)}'
                    : '${ride.bidCount} conductor(es) respondieron',
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: Color(0xFF92610A), fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
        Expanded(
          child: ride.bids.isEmpty
              ? Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: Text(
                      'Aún no hay ofertas. Espera unos segundos…',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: context.textSecondaryColor),
                    ),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: ride.bids.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (_, i) => _BidCard(
                    bid: ride.bids[i],
                    offeredFare: ride.offeredFare,
                    onAccept: () => onAccept(ride.bids[i].id),
                  ),
                ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: TextButton(
              onPressed: onCancel,
              child: const Text('Cancelar solicitud',
                  style: TextStyle(color: AppColors.error)),
            ),
          ),
        ),
      ],
    );
  }
}

class _BidCard extends StatelessWidget {
  const _BidCard({
    required this.bid,
    required this.offeredFare,
    required this.onAccept,
  });

  final RideBidEntity bid;
  final double offeredFare;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    final isCounter = bid.fare > offeredFare;
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
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: AppColors.primaryContainer,
                child: Text(
                  bid.driverName.isNotEmpty
                      ? bid.driverName[0].toUpperCase()
                      : '?',
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, color: AppColors.primaryDim),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(bid.driverName,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 15)),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        const Icon(Icons.star_rounded,
                            size: 15, color: Color(0xFFFFB300)),
                        const SizedBox(width: 2),
                        Text(bid.driverRating.toStringAsFixed(2),
                            style: TextStyle(
                                fontSize: 12.5, color: context.textSecondaryColor)),
                        const SizedBox(width: 8),
                        Text('${bid.driverTotalTrips} viajes',
                            style: TextStyle(
                                fontSize: 12.5, color: context.textSecondaryColor)),
                      ],
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(CurrencyFormatter.format(bid.fare),
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w800)),
                  Text('${bid.etaMinutes} min',
                      style: TextStyle(
                          fontSize: 12, color: context.textSecondaryColor)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(bid.vehicleDescription,
                style: TextStyle(
                    fontSize: 12.5, color: context.textSecondaryColor)),
          ),
          if (isCounter) ...[
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Contraoferta (pediste ${CurrencyFormatter.format(offeredFare)})',
                style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.warning,
                    fontWeight: FontWeight.w600),
              ),
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onAccept,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
              ),
              child: Text('Aceptar por ${CurrencyFormatter.format(bid.fare)}'),
            ),
          ),
        ],
      ),
    );
  }
}

class _MatchedView extends StatelessWidget {
  const _MatchedView({required this.ride, required this.onCancel});

  final RideEntity ride;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final bid = ride.acceptedBid;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: ride.status.color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text(
            ride.status.label,
            textAlign: TextAlign.center,
            style: TextStyle(
                color: ride.status.color, fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(height: 16),
        if (bid != null)
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: context.cardColor2,
              borderRadius: BorderRadius.circular(16),
              boxShadow: const [
                BoxShadow(
                    color: Color(0x0F000000), blurRadius: 8, offset: Offset(0, 2)),
              ],
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 26,
                      backgroundColor: AppColors.primaryContainer,
                      child: Text(
                        bid.driverName.isNotEmpty
                            ? bid.driverName[0].toUpperCase()
                            : '?',
                        style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: AppColors.primaryDim),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(bid.driverName,
                              style: const TextStyle(
                                  fontSize: 17, fontWeight: FontWeight.w800)),
                          Text(bid.vehicleDescription,
                              style: TextStyle(
                                  fontSize: 13, color: context.textSecondaryColor)),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              const Icon(Icons.star_rounded,
                                  size: 15, color: Color(0xFFFFB300)),
                              Text(' ${bid.driverRating.toStringAsFixed(2)}',
                                  style: const TextStyle(fontSize: 12.5)),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Text(CurrencyFormatter.format(bid.fare),
                        style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: AppColors.primaryDim)),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _call(bid.driverPhone),
                        icon: const Icon(Icons.call_rounded, size: 18),
                        label: const Text('Llamar'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => RideChatScreen(
                              rideId: ride.id,
                              peerName: bid.driverName,
                            ),
                          ),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                        ),
                        icon: const Icon(Icons.chat_bubble_rounded, size: 18),
                        label: const Text('Chat'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        const SizedBox(height: 16),
        _routeCard(context),
        const SizedBox(height: 16),
        if (ride.status != RideStatus.inProgress &&
            ride.status != RideStatus.completed)
          Center(
            child: TextButton(
              onPressed: onCancel,
              child: const Text('Cancelar viaje',
                  style: TextStyle(color: AppColors.error)),
            ),
          ),
      ],
    );
  }

  Widget _routeCard(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.cardColor2,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.outlineColor),
        ),
        child: Column(
          children: [
            Row(children: [
              const Icon(Icons.trip_origin_rounded,
                  size: 16, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(child: Text(ride.originAddress)),
            ]),
            Padding(
              padding: EdgeInsets.only(left: 7),
              child: SizedBox(
                height: 18,
                child: VerticalDivider(width: 1, color: context.outlineColor),
              ),
            ),
            Row(children: [
              const Icon(Icons.place_rounded, size: 16, color: AppColors.error),
              const SizedBox(width: 8),
              Expanded(child: Text(ride.destinationAddress)),
            ]),
          ],
        ),
      );

  Future<void> _call(String phone) async {
    final uri = Uri.parse('tel:${phone.replaceAll(' ', '')}');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }
}
