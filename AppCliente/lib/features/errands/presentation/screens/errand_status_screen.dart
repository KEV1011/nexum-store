import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
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
        backgroundColor: AppColors.backgroundLight,
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
                    ref.read(errandProvider.notifier).markDelivered();
                    _showRatingHint(context);
                    context.go('/home');
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

  void _showRatingHint(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('¡Envío completado! Gracias por usar Nexum.'),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
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
                  style: const TextStyle(
                    color: AppColors.textSecondary,
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
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.outlineLight),
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
                color: done ? AppColors.primary : AppColors.outlineLight,
              ),
            );
          }
          final idx = i ~/ 2;
          final step = _steps[idx];
          final done = idx < currentStep;
          final active = idx == currentStep;
          final color = (done || active)
              ? AppColors.primary
              : AppColors.textTertiary;

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
                          : AppColors.surfaceVariantLight,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: (done || active)
                        ? AppColors.primary
                        : AppColors.outlineLight,
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
                        ? AppColors.textPrimary
                        : AppColors.textTertiary,
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
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.outlineLight),
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
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: AppColors.textPrimary,
                  ),
                ),
                Row(
                  children: [
                    const Icon(Icons.star_rounded,
                        size: 14, color: AppColors.star),
                    const SizedBox(width: 3),
                    Text(
                      errand.messengerRating?.toStringAsFixed(1) ?? '—',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const Text(
                      '  ·  Tu mensajero Nexum',
                      style: TextStyle(
                          fontSize: 12, color: AppColors.textSecondary),
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
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.outlineLight),
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
            style: const TextStyle(
              fontSize: 14,
              height: 1.4,
              color: AppColors.textPrimary,
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
              iconColor: AppColors.textTertiary,
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
            style: const TextStyle(
                fontSize: 12, color: AppColors.textSecondary),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: AppColors.textPrimary,
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
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.outlineLight),
      ),
      child: Column(
        children: [
          _row('Servicio del mensajero',
              CurrencyFormatter.format(errand.serviceFee)),
          if (errand.hasBudget) ...[
            const SizedBox(height: 8),
            _row(
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
            hasActual ? 'Total a pagar' : 'Total estimado',
            CurrencyFormatter.format(errand.actualTotal),
            isBold: true,
          ),
        ],
      ),
    );
  }

  Widget _row(
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
                isBold ? AppColors.textPrimary : AppColors.textSecondary,
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
                        : AppColors.textPrimary,
          ),
        ),
      ],
    );
  }
}
