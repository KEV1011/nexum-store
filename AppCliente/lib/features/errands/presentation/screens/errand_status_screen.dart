import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/errands/domain/entities/errand_entity.dart';
import 'package:nexum_client/features/errands/presentation/providers/errand_provider.dart';

class ErrandStatusScreen extends ConsumerWidget {
  const ErrandStatusScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final errand = ref.watch(errandProvider.select((s) => s.active));

    if (errand == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) context.go('/home');
      });
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final accent = errand.category.color;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (_, __) => _handleBack(context, ref, errand),
      child: Scaffold(
        backgroundColor: context.backgroundColor,
        appBar: AppBar(
          title: const Text(
            'Mi envío',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          centerTitle: false,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: () => _handleBack(context, ref, errand),
          ),
          actions: [
            if (errand.status.canCancel)
              TextButton(
                onPressed: () => _confirmCancel(context, ref),
                child: const Text(
                  'Cancelar',
                  style: TextStyle(color: AppColors.error),
                ),
              ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ── Header de estado ─────────────────────────────────────────────
            _StatusHeader(errand: errand),
            const SizedBox(height: 18),

            // ── Línea de progreso ────────────────────────────────────────────
            _ProgressTimeline(status: errand.status),
            const SizedBox(height: 18),

            // ── Mensajero ────────────────────────────────────────────────────
            if (errand.hasMessenger) ...[
              _MessengerCard(errand: errand),
              const SizedBox(height: 12),
            ],

            // ── Detalle del encargo ──────────────────────────────────────────
            _ErrandDetailCard(errand: errand, accent: accent),
            const SizedBox(height: 12),

            // ── Costos ───────────────────────────────────────────────────────
            _CostCard(errand: errand),
            const SizedBox(height: 24),

            // ── Acción de entrega (cuando va en camino) ─────────────────────
            if (errand.status == ErrandStatus.onTheWay)
              SizedBox(
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: () {
                    HapticFeedback.mediumImpact();
                    // Marca entregado y se QUEDA en la pantalla: abajo aparece
                    // el resumen + la calificación (antes rebotaba a /home).
                    ref.read(errandProvider.notifier).markDelivered();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  icon: const Icon(Icons.check_circle_rounded),
                  label: const Text(
                    'Confirmar que recibí todo',
                    style: TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                ),
              ),

            // ── Envío entregado: calificación + cierre ──────────────────────
            if (errand.status == ErrandStatus.delivered) ...[
              _ErrandRatingSection(errand: errand),
              const SizedBox(height: 12),
              SizedBox(
                height: 52,
                child: OutlinedButton.icon(
                  onPressed: () {
                    ref.read(errandProvider.notifier).dismissDelivered();
                    context.go('/home');
                  },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: const BorderSide(color: AppColors.primary),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  icon: const Icon(Icons.home_rounded),
                  label: const Text(
                    'Volver al inicio',
                    style: TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _handleBack(
      BuildContext context, WidgetRef ref, ErrandEntity errand) {
    if (errand.status.canCancel) {
      _confirmCancel(context, ref);
    } else {
      // Si ya se entregó, archívalo antes de salir para no dejar la tarjeta
      // colgada en memoria.
      if (errand.status == ErrandStatus.delivered) {
        ref.read(errandProvider.notifier).dismissDelivered();
      }
      context.go('/home');
    }
  }

  Future<void> _confirmCancel(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Cancelar el envío?'),
        content: const Text('Se cancelará la búsqueda del mensajero.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Mantener'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Cancelar envío'),
          ),
        ],
      ),
    );
    if (confirmed == true && context.mounted) {
      ref.read(errandProvider.notifier).cancelErrand();
      context.go('/home');
    }
  }

}

// ── Calificación del mensajero (envío entregado) ──────────────────────────────

class _ErrandRatingSection extends ConsumerStatefulWidget {
  const _ErrandRatingSection({required this.errand});
  final ErrandEntity errand;

  @override
  ConsumerState<_ErrandRatingSection> createState() =>
      _ErrandRatingSectionState();
}

class _ErrandRatingSectionState extends ConsumerState<_ErrandRatingSection> {
  int _selected = 0;

  @override
  void initState() {
    super.initState();
    _selected = widget.errand.rating ?? 0;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.starContainer,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.star.withValues(alpha: 0.4)),
      ),
      child: Column(
        children: [
          Text(
            '¡Envío entregado! ¿Cómo estuvo ${widget.errand.messengerName ?? 'el mensajero'}?',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final filled = i < _selected;
              return GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _selected = i + 1);
                  ref.read(errandProvider.notifier).rateActiveErrand(i + 1);
                },
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(
                    filled ? Icons.star_rounded : Icons.star_outline_rounded,
                    color: AppColors.star,
                    size: 36,
                  ),
                ),
              );
            }),
          ),
          if (_selected > 0) ...[
            const SizedBox(height: 8),
            Text(
              '¡Gracias por calificar!',
              style: TextStyle(color: context.textSecondaryColor, fontSize: 13),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Status header ─────────────────────────────────────────────────────────────

class _StatusHeader extends StatelessWidget {
  const _StatusHeader({required this.errand});
  final ErrandEntity errand;

  @override
  Widget build(BuildContext context) {
    final status = errand.status;
    final isSearching = status == ErrandStatus.searching;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: status.color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: status.color.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          if (isSearching)
            SizedBox(
              width: 36,
              height: 36,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                color: status.color,
              ),
            )
          else
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: status.color.withValues(alpha: 0.18),
                shape: BoxShape.circle,
              ),
              child: Icon(status.icon, color: status.color, size: 24),
            ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  status.label,
                  style: TextStyle(
                    color: status.color,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  status.description,
                  style: TextStyle(
                    color: context.textSecondaryColor,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Progress timeline ─────────────────────────────────────────────────────────

class _ProgressTimeline extends StatelessWidget {
  const _ProgressTimeline({required this.status});
  final ErrandStatus status;

  static const _steps = [
    (ErrandStatus.searching, 'Solicitado', Icons.search_rounded),
    (ErrandStatus.accepted, 'Asignado', Icons.directions_run_rounded),
    (ErrandStatus.shopping, 'En gestión', Icons.shopping_cart_rounded),
    (ErrandStatus.onTheWay, 'En camino', Icons.two_wheeler_rounded),
    (ErrandStatus.delivered, 'Entregado', Icons.check_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final currentStep = status.step;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.outlineColor),
      ),
      child: Row(
        children: List.generate(_steps.length * 2 - 1, (i) {
          if (i.isOdd) {
            // Conector
            final beforeIdx = i ~/ 2;
            final done = beforeIdx < currentStep;
            return Expanded(
              child: Container(
                height: 2,
                color: done ? AppColors.primary : context.outlineColor,
              ),
            );
          }
          final idx = i ~/ 2;
          final step = _steps[idx];
          final done = idx < currentStep;
          final active = idx == currentStep;
          final color = (done || active)
              ? AppColors.primary
              : context.textTertiaryColor;

          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: active
                      ? AppColors.primary
                      : done
                          ? AppColors.primary.withValues(alpha: 0.15)
                          : context.surfaceVariantColor,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: (done || active)
                        ? AppColors.primary
                        : context.outlineColor,
                    width: 1.5,
                  ),
                ),
                child: Icon(
                  done ? Icons.check_rounded : step.$3,
                  size: 16,
                  color: active ? Colors.white : color,
                ),
              ),
              const SizedBox(height: 5),
              SizedBox(
                width: 52,
                child: Text(
                  step.$2,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 9.5,
                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                    color: (done || active)
                        ? context.textPrimaryColor
                        : context.textTertiaryColor,
                  ),
                ),
              ),
            ],
          );
        }),
      ),
    );
  }
}

// ── Messenger card ────────────────────────────────────────────────────────────

class _MessengerCard extends StatelessWidget {
  const _MessengerCard({required this.errand});
  final ErrandEntity errand;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.outlineColor),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: AppColors.secondaryContainer,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.person_rounded,
                color: AppColors.secondary, size: 26),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  errand.messengerName ?? 'Mensajero',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: context.textPrimaryColor,
                  ),
                ),
                Row(
                  children: [
                    const Icon(Icons.star_rounded,
                        size: 14, color: AppColors.star),
                    const SizedBox(width: 3),
                    Text(
                      errand.messengerRating?.toStringAsFixed(1) ?? '—',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: context.textSecondaryColor,
                      ),
                    ),
                    Text(
                      '  ·  Tu mensajero Nexum',
                      style: TextStyle(
                          fontSize: 12, color: context.textSecondaryColor),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (errand.messengerPhone != null)
            GestureDetector(
              onTap: () {},
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.phone_rounded,
                    color: AppColors.primary, size: 20),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Errand detail card ────────────────────────────────────────────────────────

class _ErrandDetailCard extends StatelessWidget {
  const _ErrandDetailCard({required this.errand, required this.accent});
  final ErrandEntity errand;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.outlineColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(errand.category.icon, size: 17, color: accent),
              ),
              const SizedBox(width: 10),
              Text(
                errand.category.label,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  color: accent,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            errand.description,
            style: TextStyle(
              fontSize: 14,
              height: 1.4,
              color: context.textPrimaryColor,
            ),
          ),
          const SizedBox(height: 14),
          const Divider(height: 1),
          const SizedBox(height: 14),
          _DetailRow(
            icon: Icons.store_mall_directory_rounded,
            label: 'Recogida',
            value: errand.pickupAddress,
            iconColor: accent,
          ),
          const SizedBox(height: 10),
          _DetailRow(
            icon: Icons.home_rounded,
            label: 'Entrega',
            value: errand.dropoffAddress,
            iconColor: AppColors.primary,
          ),
          if (errand.notes != null) ...[
            const SizedBox(height: 10),
            _DetailRow(
              icon: Icons.sticky_note_2_rounded,
              label: 'Notas',
              value: errand.notes!,
              iconColor: context.textTertiaryColor,
            ),
          ],
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.iconColor,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 17, color: iconColor),
        const SizedBox(width: 10),
        SizedBox(
          width: 64,
          child: Text(
            label,
            style: TextStyle(
                fontSize: 12, color: context.textSecondaryColor),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: context.textPrimaryColor,
            ),
          ),
        ),
      ],
    );
  }
}

// ── Cost card ─────────────────────────────────────────────────────────────────

class _CostCard extends StatelessWidget {
  const _CostCard({required this.errand});
  final ErrandEntity errand;

  @override
  Widget build(BuildContext context) {
    final hasActual = errand.actualPurchaseCost != null;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.outlineColor),
      ),
      child: Column(
        children: [
          _row(context, 'Servicio del mensajero',
              CurrencyFormatter.format(errand.serviceFee)),
          if (errand.hasBudget) ...[
            const SizedBox(height: 8),
            _row(
              context,
              hasActual ? 'Compras (costo real)' : 'Compras (presupuesto)',
              CurrencyFormatter.format(
                errand.actualPurchaseCost ?? errand.purchaseBudget!,
              ),
              highlight: hasActual,
            ),
            if (hasActual &&
                errand.actualPurchaseCost! < errand.purchaseBudget!) ...[
              const SizedBox(height: 8),
              _row(
                context,
                'Te devolvemos',
                CurrencyFormatter.format(
                  errand.purchaseBudget! - errand.actualPurchaseCost!,
                ),
                positive: true,
              ),
            ],
          ],
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Divider(height: 1),
          ),
          _row(
            context,
            hasActual ? 'Total a pagar' : 'Total estimado',
            CurrencyFormatter.format(errand.actualTotal),
            isBold: true,
          ),
        ],
      ),
    );
  }

  Widget _row(
    BuildContext context,
    String label,
    String value, {
    bool isBold = false,
    bool highlight = false,
    bool positive = false,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: isBold ? 15 : 13,
            fontWeight: isBold ? FontWeight.w700 : FontWeight.w500,
            color:
                isBold ? context.textPrimaryColor : context.textSecondaryColor,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: isBold ? 17 : 13,
            fontWeight: isBold ? FontWeight.w800 : FontWeight.w600,
            color: positive
                ? AppColors.success
                : isBold
                    ? AppColors.primary
                    : highlight
                        ? AppColors.secondary
                        : context.textPrimaryColor,
          ),
        ),
      ],
    );
  }
}
