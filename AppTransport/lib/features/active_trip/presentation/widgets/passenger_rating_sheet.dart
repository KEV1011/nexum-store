import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

/// Hoja modal para calificar al pasajero al finalizar un viaje.
///
/// Muestra estrellas animadas, etiquetas rápidas que cambian según la
/// puntuación, un comentario opcional y un estado de éxito con confeti.
class PassengerRatingSheet extends StatefulWidget {
  const PassengerRatingSheet({required this.passengerName, super.key});

  final String passengerName;

  /// Presenta la hoja de calificación como modal de pantalla inferior.
  static Future<void> show(
    BuildContext context, {
    required String passengerName,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => PassengerRatingSheet(passengerName: passengerName),
    );
  }

  @override
  State<PassengerRatingSheet> createState() => _PassengerRatingSheetState();
}

class _PassengerRatingSheetState extends State<PassengerRatingSheet>
    with TickerProviderStateMixin {
  int _rating = 0;
  int? _tappedStar;
  final Set<String> _selectedTags = {};
  final TextEditingController _comment = TextEditingController();
  bool _submitted = false;

  late final AnimationController _confettiController;

  static const _positiveTags = [
    'Puntual',
    'Amable',
    'Buena conversación',
    'Respetuoso',
    'Pago correcto',
    'Equipaje ligero',
  ];

  static const _negativeTags = [
    'Impuntual',
    'Maleducado',
    'Equipaje excesivo',
    'Ubicación incorrecta',
    'Esperó mucho',
    'Otro',
  ];

  @override
  void initState() {
    super.initState();
    _confettiController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
  }

  @override
  void dispose() {
    _confettiController.dispose();
    _comment.dispose();
    super.dispose();
  }

  List<String> get _currentTags =>
      _rating >= 4 ? _positiveTags : _negativeTags;

  String get _ratingHint => switch (_rating) {
        0 => 'Toca una estrella para calificar',
        1 => 'Muy mala',
        2 => 'Mala',
        3 => 'Regular',
        4 => 'Buena',
        _ => '¡Excelente!',
      };

  void _setRating(int value) {
    HapticFeedback.selectionClick();
    setState(() {
      _rating = value;
      _tappedStar = value;
      // Tags differ by sentiment bucket — clear when crossing the boundary.
      _selectedTags.clear();
    });
  }

  void _toggleTag(String tag) {
    setState(() {
      if (_selectedTags.contains(tag)) {
        _selectedTags.remove(tag);
      } else {
        _selectedTags.add(tag);
      }
    });
  }

  void _submit() {
    if (_rating == 0) return;
    HapticFeedback.mediumImpact();
    setState(() => _submitted = true);
    _confettiController.forward(from: 0);
    // Auto-dismiss after the success animation settles.
    Future.delayed(const Duration(milliseconds: 2200), () {
      if (mounted) Navigator.of(context).maybePop();
    });
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Stack(
      children: [
        AnimatedPadding(
          duration: const Duration(milliseconds: 150),
          padding: EdgeInsets.only(bottom: bottomInset),
          child: Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: BorderRadius.vertical(
                top: Radius.circular(AppConstants.radiusXLarge),
              ),
            ),
            padding: const EdgeInsets.fromLTRB(
              AppConstants.spacingL,
              AppConstants.spacingS,
              AppConstants.spacingL,
              AppConstants.spacingL,
            ),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 350),
              child: _submitted ? _buildSuccess() : _buildForm(),
            ),
          ),
        ),
        if (_submitted)
          Positioned.fill(
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _confettiController,
                builder: (_, __) => CustomPaint(
                  painter: _ConfettiPainter(_confettiController.value),
                ),
              ),
            ),
          ),
      ],
    );
  }

  // ── Form state ─────────────────────────────────────────────────────────────

  Widget _buildForm() {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      key: const ValueKey('form'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(bottom: AppConstants.spacingM),
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Passenger avatar + name
          CircleAvatar(
            radius: 30,
            backgroundColor: AppColors.primaryContainer,
            child: Text(
              widget.passengerName.isNotEmpty
                  ? widget.passengerName[0].toUpperCase()
                  : 'P',
              style: theme.textTheme.headlineSmall?.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),
          Text(
            'Califica a ${widget.passengerName}',
            style: theme.textTheme.titleLarge
                ?.copyWith(fontWeight: FontWeight.w800),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppConstants.spacingXS),
          Text(
            '¿Cómo fue tu experiencia con este pasajero?',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: context.textSecondaryColor),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppConstants.spacingM),

          // Stars
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final value = i + 1;
              final filled = value <= _rating;
              return GestureDetector(
                onTap: () => _setRating(value),
                child: TweenAnimationBuilder<double>(
                  tween: Tween<double>(
                    begin: 1,
                    end: _tappedStar == value ? 1.3 : 1,
                  ),
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.elasticOut,
                  onEnd: () {
                    if (_tappedStar == value && mounted) {
                      setState(() => _tappedStar = null);
                    }
                  },
                  builder: (_, scale, child) =>
                      Transform.scale(scale: scale, child: child),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Icon(
                      filled
                          ? Icons.star_rounded
                          : Icons.star_outline_rounded,
                      color: AppColors.star,
                      size: 44,
                    ),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: AppConstants.spacingXS),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            child: Text(
              _ratingHint,
              key: ValueKey(_rating),
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: _rating == 0
                    ? context.textSecondaryColor
                    : _rating >= 4
                        ? AppColors.success
                        : AppColors.warning,
              ),
            ),
          ),

          // Quick tags (appear once a rating is chosen)
          AnimatedSize(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
            child: _rating == 0
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding:
                        const EdgeInsets.only(top: AppConstants.spacingM),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      alignment: WrapAlignment.center,
                      children: _currentTags.map((tag) {
                        final selected = _selectedTags.contains(tag);
                        return _TagChip(
                          label: tag,
                          selected: selected,
                          positive: _rating >= 4,
                          onTap: () => _toggleTag(tag),
                        );
                      }).toList(),
                    ),
                  ),
          ),

          const SizedBox(height: AppConstants.spacingM),

          // Optional comment
          TextField(
            controller: _comment,
            maxLines: 2,
            maxLength: 160,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              hintText: 'Comentario (opcional)',
              counterText: '',
              border: OutlineInputBorder(
                borderRadius:
                    BorderRadius.circular(AppConstants.radiusMedium),
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // Actions
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                  ),
                  child: const Text('Omitir'),
                ),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                flex: 2,
                child: ElevatedButton.icon(
                  onPressed: _rating == 0 ? null : _submit,
                  icon: const Icon(Icons.send_rounded, size: 18),
                  label: const Text('Enviar calificación'),
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ── Success state ────────────────────────────────────────────────────────

  Widget _buildSuccess() {
    final theme = Theme.of(context);
    return Padding(
      key: const ValueKey('success'),
      padding: const EdgeInsets.symmetric(vertical: AppConstants.spacingL),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TweenAnimationBuilder<double>(
            tween: Tween<double>(begin: 0, end: 1),
            duration: const Duration(milliseconds: 450),
            curve: Curves.elasticOut,
            builder: (_, scale, child) =>
                Transform.scale(scale: scale, child: child),
            child: Container(
              width: 76,
              height: 76,
              decoration: const BoxDecoration(
                color: AppColors.success,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.check_rounded,
                color: Colors.white,
                size: 44,
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          Text(
            '¡Gracias por tu calificación!',
            style: theme.textTheme.titleLarge
                ?.copyWith(fontWeight: FontWeight.w800),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppConstants.spacingXS),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              return Icon(
                i < _rating
                    ? Icons.star_rounded
                    : Icons.star_outline_rounded,
                color: AppColors.star,
                size: 24,
              );
            }),
          ),
          if (_selectedTags.isNotEmpty) ...[
            const SizedBox(height: AppConstants.spacingS),
            Text(
              _selectedTags.join(' · '),
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: context.textSecondaryColor),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}

// ── Tag chip ─────────────────────────────────────────────────────────────────

class _TagChip extends StatelessWidget {
  const _TagChip({
    required this.label,
    required this.selected,
    required this.positive,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final bool positive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final accent = positive ? AppColors.success : AppColors.warning;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? accent.withValues(alpha: 0.15) : Colors.transparent,
          borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
          border: Border.all(
            color: selected ? accent : context.outlineColor,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (selected) ...[
              Icon(Icons.check_rounded, size: 14, color: accent),
              const SizedBox(width: 4),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? accent : context.textSecondaryColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Confetti ─────────────────────────────────────────────────────────────────

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter(this.progress);

  final double progress;

  static const _count = 28;
  static const _colors = [
    AppColors.primary,
    AppColors.secondary,
    AppColors.star,
    AppColors.info,
    AppColors.success,
  ];

  @override
  void paint(Canvas canvas, Size size) {
    if (progress == 0) return;
    final rng = math.Random(7);
    final origin = Offset(size.width / 2, size.height * 0.42);
    final paint = Paint();

    for (var i = 0; i < _count; i++) {
      // Launch angle spread across a fan, with randomized speed.
      final angle = -math.pi / 2 + (rng.nextDouble() - 0.5) * math.pi * 1.1;
      final speed = 140 + rng.nextDouble() * 220;
      final vx = math.cos(angle) * speed;
      final vy = math.sin(angle) * speed;

      // Projectile motion with gravity.
      const gravity = 520.0;
      final t = progress;
      final dx = vx * t;
      final dy = vy * t + 0.5 * gravity * t * t;

      final pos = origin + Offset(dx, dy);
      final fade = (1 - progress).clamp(0.0, 1.0);
      paint.color = _colors[i % _colors.length].withValues(alpha: fade);

      // Spin each piece as it travels.
      final rot = progress * (6 + i % 5) + i;
      final w = 6 + (i % 3) * 2.0;
      canvas
        ..save()
        ..translate(pos.dx, pos.dy)
        ..rotate(rot)
        ..drawRect(
          Rect.fromCenter(center: Offset.zero, width: w, height: w * 0.5),
          paint,
        )
        ..restore();
    }
  }

  @override
  bool shouldRepaint(covariant _ConfettiPainter oldDelegate) =>
      oldDelegate.progress != progress;
}
