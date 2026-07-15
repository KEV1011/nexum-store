import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';
import 'package:nexum_client/features/orders/presentation/providers/'
    'orders_provider.dart';

Future<void> showRatingSheet(
  BuildContext context,
  CustomerOrderEntity order,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _RatingSheet(order: order),
  );
}

class _RatingSheet extends ConsumerStatefulWidget {
  const _RatingSheet({required this.order});

  final CustomerOrderEntity order;

  @override
  ConsumerState<_RatingSheet> createState() => _RatingSheetState();
}

class _RatingSheetState extends ConsumerState<_RatingSheet> {
  int _stars = 0;
  final _commentController = TextEditingController();
  bool _submitted = false;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_stars == 0) return;
    ref.read(ordersProvider.notifier).rateOrder(
      widget.order.id,
      _stars,
      comment: _commentController.text.trim().isEmpty
          ? null
          : _commentController.text.trim(),
    );
    setState(() => _submitted = true);
    await Future<void>.delayed(const Duration(milliseconds: 1100));
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.cardDark : context.surfaceColor,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(AppConstants.radiusXLarge),
        ),
      ),
      padding: EdgeInsets.only(
        left: AppConstants.spacingL,
        right: AppConstants.spacingL,
        top: AppConstants.spacingM,
        bottom:
            MediaQuery.of(context).viewInsets.bottom + AppConstants.spacingXL,
      ),
      child: _submitted
          ? const _SuccessView()
          : _FormView(
              order: widget.order,
              stars: _stars,
              commentController: _commentController,
              onStarTap: (s) => setState(() => _stars = s),
              onSubmit: _submit,
              onSkip: () => Navigator.of(context).pop(),
              isDark: isDark,
            ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  const _SuccessView();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      height: 200,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.check_circle_rounded,
            color: AppColors.primary,
            size: 56,
          ),
          SizedBox(height: AppConstants.spacingM),
          Text(
            '¡Gracias por tu calificación!',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _FormView extends StatelessWidget {
  const _FormView({
    required this.order,
    required this.stars,
    required this.commentController,
    required this.onStarTap,
    required this.onSubmit,
    required this.onSkip,
    required this.isDark,
  });

  final CustomerOrderEntity order;
  final int stars;
  final TextEditingController commentController;
  final ValueChanged<int> onStarTap;
  final VoidCallback onSubmit;
  final VoidCallback onSkip;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: isDark ? AppColors.outlineDark : context.outlineColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ),
        const SizedBox(height: AppConstants.spacingL),
        const Text(
          '¿Cómo fue tu pedido?',
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 20,
            fontWeight: FontWeight.w800,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 4),
        Text(
          order.businessName,
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 14,
            color: context.textSecondaryColor,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: AppConstants.spacingL),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(5, (i) {
            final filled = i < stars;
            return GestureDetector(
              onTap: () => onStarTap(i + 1),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Icon(
                  filled ? Icons.star_rounded : Icons.star_outline_rounded,
                  size: 44,
                  color: filled ? AppColors.star : context.textTertiaryColor,
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: AppConstants.spacingL),
        TextField(
          controller: commentController,
          maxLines: 3,
          maxLength: 200,
          style: const TextStyle(fontFamily: 'Inter', fontSize: 14),
          decoration: InputDecoration(
            hintText: 'Cuéntanos más (opcional)…',
            hintStyle: TextStyle(
              fontFamily: 'Inter',
              fontSize: 14,
              color: context.textTertiaryColor,
            ),
            filled: true,
            fillColor:
                isDark ? AppColors.surfaceVariantDark : context.surfaceColor,
            border: OutlineInputBorder(
              borderRadius:
                  BorderRadius.circular(AppConstants.radiusMedium),
              borderSide: BorderSide(
                color:
                    isDark ? AppColors.outlineDark : context.outlineColor,
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius:
                  BorderRadius.circular(AppConstants.radiusMedium),
              borderSide: BorderSide(
                color:
                    isDark ? AppColors.outlineDark : context.outlineColor,
              ),
            ),
          ),
        ),
        const SizedBox(height: AppConstants.spacingM),
        SizedBox(
          height: AppConstants.minTouchTarget + 8,
          child: ElevatedButton(
            onPressed: stars > 0 ? onSubmit : null,
            child: const Text('Enviar calificación'),
          ),
        ),
        TextButton(
          onPressed: onSkip,
          child: Text(
            'Omitir',
            style: TextStyle(
              fontFamily: 'Inter',
              color: isDark
                  ? AppColors.textSecondaryDark
                  : context.textSecondaryColor,
            ),
          ),
        ),
      ],
    );
  }
}

/// Muestra las estrellas de una calificación ya registrada.
class RatingDisplay extends StatelessWidget {
  const RatingDisplay({required this.rating, super.key, this.small = false});

  final int rating;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final size = small ? 16.0 : 22.0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        return Icon(
          i < rating ? Icons.star_rounded : Icons.star_outline_rounded,
          size: size,
          color: i < rating ? AppColors.star : context.textTertiaryColor,
        );
      }),
    );
  }
}
