import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

// ── Core shimmer ─────────────────────────────────────────────────────────────

class SkeletonLoader extends StatefulWidget {
  const SkeletonLoader({required this.child, super.key});
  final Widget child;

  @override
  State<SkeletonLoader> createState() => _SkeletonLoaderState();
}

class _SkeletonLoaderState extends State<SkeletonLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final base =
        isDark ? const Color(0xFF2C2C2C) : const Color(0xFFE8E8E8);
    final highlight =
        isDark ? const Color(0xFF404040) : const Color(0xFFF5F5F5);

    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, child) {
        final t = _ctrl.value;
        return ShaderMask(
          shaderCallback: (Rect bounds) {
            return LinearGradient(
              begin: Alignment(-2.0 + t * 4, 0),
              end: Alignment(-1.0 + t * 4, 0),
              colors: [base, highlight, base],
              stops: const [0.0, 0.5, 1.0],
            ).createShader(bounds);
          },
          blendMode: BlendMode.srcATop,
          child: child,
        );
      },
      child: widget.child,
    );
  }
}

// ── Primitive shapes ─────────────────────────────────────────────────────────

class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    super.key,
    this.width,
    this.height = 14,
    this.radius = 8,
  });
  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: isDark
            ? const Color(0xFF2C2C2C)
            : const Color(0xFFE8E8E8),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

class SkeletonCircle extends StatelessWidget {
  const SkeletonCircle({required this.size, super.key});
  final double size;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: isDark
            ? const Color(0xFF2C2C2C)
            : const Color(0xFFE8E8E8),
        shape: BoxShape.circle,
      ),
    );
  }
}

// ── Prebuilt skeleton tiles ──────────────────────────────────────────────────

/// Mimics a trip history tile.
class SkeletonTripTile extends StatelessWidget {
  const SkeletonTripTile({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark
            ? AppColors.surfaceDark
            : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(
          AppConstants.radiusMedium,
        ),
        border: Border.all(
          color: isDark
              ? AppColors.outlineDark
              : AppColors.outlineLight,
        ),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SkeletonBox(width: 38, height: 38, radius: 10),
              SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SkeletonBox(width: 80, height: 11),
                    SizedBox(height: 5),
                    SkeletonBox(width: 60, height: 10),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  SkeletonBox(width: 64, height: 13),
                  SizedBox(height: 5),
                  SkeletonBox(width: 32, height: 10),
                ],
              ),
            ],
          ),
          SizedBox(height: AppConstants.spacingS),
          SkeletonBox(height: 10),
          SizedBox(height: 4),
          SkeletonBox(height: 10, width: 200),
          SizedBox(height: AppConstants.spacingS),
          Row(
            children: [
              SkeletonBox(width: 56, height: 10),
              SizedBox(width: AppConstants.spacingS),
              SkeletonBox(width: 48, height: 10),
            ],
          ),
        ],
      ),
    );
  }
}

/// Mimics a ratings comment card.
class SkeletonCommentCard extends StatelessWidget {
  const SkeletonCommentCard({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark
            ? AppColors.surfaceDark
            : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(
          AppConstants.radiusMedium,
        ),
        border: Border.all(
          color: isDark
              ? AppColors.outlineDark
              : AppColors.outlineLight,
        ),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SkeletonCircle(size: 38),
              SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SkeletonBox(width: 100, height: 12),
                    SizedBox(height: 5),
                    SkeletonBox(width: 72, height: 10),
                  ],
                ),
              ),
              SkeletonBox(width: 36, height: 10),
            ],
          ),
          SizedBox(height: AppConstants.spacingS),
          SkeletonBox(height: 10),
          SizedBox(height: 4),
          SkeletonBox(height: 10, width: 220),
        ],
      ),
    );
  }
}

/// Mimics an earnings stat row (3 cards).
class SkeletonStatRow extends StatelessWidget {
  const SkeletonStatRow({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cardColor =
        isDark ? AppColors.surfaceDark : AppColors.surfaceLight;
    final borderColor =
        isDark ? AppColors.outlineDark : AppColors.outlineLight;

    return Row(
      children: List.generate(3, (i) {
        return Expanded(
          child: Container(
            margin: EdgeInsets.only(right: i < 2 ? 8 : 0),
            padding: const EdgeInsets.all(AppConstants.spacingM),
            decoration: BoxDecoration(
              color: cardColor,
              borderRadius: BorderRadius.circular(
                AppConstants.radiusMedium,
              ),
              border: Border.all(color: borderColor),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBox(height: 10, width: 48),
                SizedBox(height: 6),
                SkeletonBox(height: 18),
                SizedBox(height: 4),
                SkeletonBox(height: 10, width: 36),
              ],
            ),
          ),
        );
      }),
    );
  }
}

/// Mimics an earnings bar chart.
class SkeletonBarChart extends StatelessWidget {
  const SkeletonBarChart({super.key, this.barCount = 7});
  final int barCount;

  static const _heights = [
    0.6, 0.9, 0.45, 1.0, 0.7, 0.85, 0.5,
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final barColor =
        isDark ? const Color(0xFF2C2C2C) : const Color(0xFFE8E8E8);

    return SizedBox(
      height: 120,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: List.generate(barCount, (i) {
          final h = (_heights[i % _heights.length] * 90)
              .roundToDouble();
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Container(
                    height: h,
                    decoration: BoxDecoration(
                      color: barColor,
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(4),
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  const SkeletonBox(height: 9, width: 16),
                ],
              ),
            ),
          );
        }),
      ),
    );
  }
}
