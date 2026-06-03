import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';

/// Hoja modal de calificación genérica, reutilizable por cualquier servicio
/// (intermunicipal, mandado, etc.). El llamador decide el título/subtítulo y
/// recibe las estrellas + comentario opcional vía [onSubmit] para persistirlas.
Future<void> showServiceRatingSheet(
  BuildContext context, {
  required String title,
  required String subtitle,
  required void Function(int stars, String? comment) onSubmit,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ServiceRatingSheet(
      title: title,
      subtitle: subtitle,
      onSubmit: onSubmit,
    ),
  );
}

class _ServiceRatingSheet extends StatefulWidget {
  const _ServiceRatingSheet({
    required this.title,
    required this.subtitle,
    required this.onSubmit,
  });

  final String title;
  final String subtitle;
  final void Function(int stars, String? comment) onSubmit;

  @override
  State<_ServiceRatingSheet> createState() => _ServiceRatingSheetState();
}

class _ServiceRatingSheetState extends State<_ServiceRatingSheet> {
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
    final comment = _commentController.text.trim();
    widget.onSubmit(_stars, comment.isEmpty ? null : comment);
    setState(() => _submitted = true);
    await Future<void>.delayed(const Duration(milliseconds: 1100));
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.cardDark : AppColors.surfaceLight,
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
      child: _submitted ? const _SuccessView() : _buildForm(isDark),
    );
  }

  Widget _buildForm(bool isDark) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ),
        const SizedBox(height: AppConstants.spacingL),
        Text(
          widget.title,
          style: const TextStyle(
            fontFamily: 'Inter',
            fontSize: 20,
            fontWeight: FontWeight.w800,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 4),
        Text(
          widget.subtitle,
          style: const TextStyle(
            fontFamily: 'Inter',
            fontSize: 14,
            color: AppColors.textSecondary,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: AppConstants.spacingL),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(5, (i) {
            final filled = i < _stars;
            return GestureDetector(
              onTap: () => setState(() => _stars = i + 1),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Icon(
                  filled ? Icons.star_rounded : Icons.star_outline_rounded,
                  size: 44,
                  color: filled ? AppColors.star : AppColors.textTertiary,
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: AppConstants.spacingL),
        TextField(
          controller: _commentController,
          maxLines: 3,
          maxLength: 200,
          style: const TextStyle(fontFamily: 'Inter', fontSize: 14),
          decoration: InputDecoration(
            hintText: 'Cuéntanos más (opcional)…',
            hintStyle: const TextStyle(
              fontFamily: 'Inter',
              fontSize: 14,
              color: AppColors.textTertiary,
            ),
            filled: true,
            fillColor:
                isDark ? AppColors.surfaceVariantDark : AppColors.surfaceLight,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
              borderSide: BorderSide(
                color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
              borderSide: BorderSide(
                color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
              ),
            ),
          ),
        ),
        const SizedBox(height: AppConstants.spacingM),
        SizedBox(
          height: AppConstants.minTouchTarget + 8,
          child: ElevatedButton(
            onPressed: _stars > 0 ? _submit : null,
            child: const Text('Enviar calificación'),
          ),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(
            'Omitir',
            style: TextStyle(
              fontFamily: 'Inter',
              color: isDark
                  ? AppColors.textSecondaryDark
                  : AppColors.textSecondary,
            ),
          ),
        ),
      ],
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
          Icon(Icons.check_circle_rounded, color: AppColors.primary, size: 56),
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

/// Muestra las estrellas de una calificación ya registrada.
class ServiceRatingDisplay extends StatelessWidget {
  const ServiceRatingDisplay({required this.rating, super.key, this.size = 22});

  final int rating;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        return Icon(
          i < rating ? Icons.star_rounded : Icons.star_outline_rounded,
          size: size,
          color: i < rating ? AppColors.star : AppColors.textTertiary,
        );
      }),
    );
  }
}
