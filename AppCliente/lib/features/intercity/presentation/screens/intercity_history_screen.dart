import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart';
import 'package:nexum_client/features/intercity/presentation/providers/intercity_provider.dart';

const _kInterColor = AppColors.intercityBrand;

/// Historial de viajes intermunicipales: completados y cancelados,
/// con calificación post-viaje para los completados.
class IntercityHistoryScreen extends ConsumerStatefulWidget {
  const IntercityHistoryScreen({super.key});

  @override
  ConsumerState<IntercityHistoryScreen> createState() =>
      _IntercityHistoryScreenState();
}

class _IntercityHistoryScreenState
    extends ConsumerState<IntercityHistoryScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(intercityProvider.notifier).loadHistory();
    });
  }

  Future<void> _openRatingSheet(IntercityRequestEntity trip) async {
    final rated = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _RatingSheet(trip: trip),
    );
    if ((rated ?? false) && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('¡Gracias por calificar tu viaje!'),
          backgroundColor: AppColors.success,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final past = ref.watch(intercityProvider).past;

    return Scaffold(
      backgroundColor: AppColors.intercityBg,
      appBar: AppBar(
        backgroundColor: AppColors.intercityBg,
        foregroundColor: Colors.white,
        title: const Text(
          'Mis viajes intermunicipales',
          style: TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 17,
            color: Colors.white,
          ),
        ),
        centerTitle: false,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          // safeBack: al llegar desde el viaje recién completado (context.go)
          // la pila está vacía y un pop() a secas cerraría la app.
          onPressed: () => safeBack(context),
        ),
      ),
      body: past.isEmpty
          ? const _DarkEmptyState()
          : RefreshIndicator(
              color: _kInterColor,
              onRefresh: () =>
                  ref.read(intercityProvider.notifier).loadHistory(),
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: past.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (_, i) => _HistoryCard(
                  trip: past[i],
                  onRate: () => _openRatingSheet(past[i]),
                ),
              ),
            ),
    );
  }
}

// ── Estado vacío (tema oscuro del módulo) ────────────────────────────────────

class _DarkEmptyState extends StatelessWidget {
  const _DarkEmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.route_rounded,
              size: 64,
              color: AppColors.intercityOutlineSoft,
            ),
            const SizedBox(height: 16),
            const Text(
              'Aún no tienes viajes',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Cuando completes un viaje intermunicipal aparecerá aquí.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.intercityTextDim,
                fontSize: 13,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 20),
            OutlinedButton(
              onPressed: () => context.go('/intercity/booking'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.intercityAccent,
                side: const BorderSide(color: AppColors.intercityOutline),
              ),
              child: const Text('Reservar un viaje'),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Tarjeta de viaje pasado ──────────────────────────────────────────────────

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.trip, required this.onRate});

  final IntercityRequestEntity trip;
  final VoidCallback onRate;

  @override
  Widget build(BuildContext context) {
    final d = trip.departureTime;
    final dateLabel = '${d.day}/${d.month}/${d.year} · '
        '${d.hour.toString().padLeft(2, '0')}:'
        '${d.minute.toString().padLeft(2, '0')}';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.intercitySurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.intercityOutline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${trip.origin.displayName} → '
                  '${trip.destination.displayName}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
              ),
              _StatusChip(status: trip.status),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '$dateLabel · ${trip.seats.label}',
            style: const TextStyle(color: AppColors.intercityTextDim, fontSize: 12),
          ),
          if (trip.driverName != null) ...[
            const SizedBox(height: 2),
            Text(
              '${trip.driverName}'
              '${trip.driverVehicle != null ? ' · ${trip.driverVehicle}' : ''}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: AppColors.intercityTextMuted, fontSize: 12),
            ),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              Text(
                CurrencyFormatter.format(
                  trip.counterFare ?? trip.offeredFare,
                ),
                style: const TextStyle(
                  color: AppColors.intercityAccent,
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
              const Spacer(),
              if (trip.myRating != null)
                Row(
                  children: [
                    for (var s = 1; s <= 5; s++)
                      Icon(
                        s <= trip.myRating!
                            ? Icons.star_rounded
                            : Icons.star_outline_rounded,
                        size: 18,
                        color: AppColors.star,
                      ),
                  ],
                )
              else if (trip.canRate)
                TextButton.icon(
                  onPressed: onRate,
                  icon: const Icon(Icons.star_outline_rounded, size: 18),
                  label: const Text('Calificar'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.star,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final IntercityStatus status;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: status.color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        status.label,
        style: TextStyle(
          color: status.color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

// ── Hoja de calificación ─────────────────────────────────────────────────────

class _RatingSheet extends ConsumerStatefulWidget {
  const _RatingSheet({required this.trip});
  final IntercityRequestEntity trip;

  @override
  ConsumerState<_RatingSheet> createState() => _RatingSheetState();
}

class _RatingSheetState extends ConsumerState<_RatingSheet> {
  int _stars = 0;
  final _commentCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_stars == 0) return;
    setState(() => _submitting = true);
    final err = await ref.read(intercityProvider.notifier).rateTrip(
          widget.trip.id,
          _stars,
          comment: _commentCtrl.text,
        );
    if (!mounted) return;
    if (err == null) {
      unawaited(HapticFeedback.mediumImpact());
      Navigator.of(context).pop(true);
    } else {
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err), backgroundColor: AppColors.error),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final trip = widget.trip;

    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.intercitySurface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.intercityOutline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              '¿Cómo estuvo tu viaje?',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${trip.origin.displayName} → '
              '${trip.destination.displayName}'
              '${trip.driverName != null ? ' con ${trip.driverName}' : ''}',
              style: const TextStyle(color: AppColors.intercityTextDim, fontSize: 13),
            ),
            const SizedBox(height: 20),
            Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var s = 1; s <= 5; s++)
                    IconButton(
                      onPressed: () {
                        HapticFeedback.selectionClick();
                        setState(() => _stars = s);
                      },
                      iconSize: 40,
                      icon: Icon(
                        s <= _stars
                            ? Icons.star_rounded
                            : Icons.star_outline_rounded,
                        color: s <= _stars
                            ? AppColors.star
                            : AppColors.intercityOutlineSoft,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _commentCtrl,
              maxLines: 2,
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                hintText: 'Cuéntanos más (opcional)',
                hintStyle:
                    const TextStyle(color: AppColors.intercityOutlineSoft, fontSize: 13),
                filled: true,
                fillColor: AppColors.intercityBg,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.intercityOutline),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.intercityOutline),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide:
                      const BorderSide(color: _kInterColor, width: 1.5),
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _stars == 0 || _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kInterColor,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: AppColors.intercityOutline,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'Enviar calificación',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
