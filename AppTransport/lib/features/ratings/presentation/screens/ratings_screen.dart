import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

class RatingsScreen extends StatelessWidget {
  const RatingsScreen({super.key});

  static const double _overallRating = 4.87;
  static const int _totalRatings = 312;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Calificaciones')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          // Overall rating card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(AppConstants.spacingL),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        _overallRating.toStringAsFixed(2),
                        style: theme.textTheme.displayMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.star,
                        ),
                      ),
                      const Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(' / 5.0',
                            style: TextStyle(color: AppColors.textSecondary)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  _StarRow(rating: _overallRating, size: 28),
                  const SizedBox(height: 4),
                  Text(
                    'Basado en $_totalRatings calificaciones',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: AppColors.textSecondary),
                  ),
                  const SizedBox(height: AppConstants.spacingL),
                  // Distribution bars
                  ...[5, 4, 3, 2, 1].map(
                    (star) => _RatingBar(
                      star: star,
                      percentage: _distribution[star] ?? 0,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingL),

          // Performance metrics
          Text(
            'Métricas de desempeño',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppConstants.spacingM),
          _MetricCard(
            label: 'Tasa de aceptación',
            value: '94%',
            icon: Icons.check_circle_outline_rounded,
            color: AppColors.success,
            subtitle: 'Meta: >85%',
          ),
          const SizedBox(height: AppConstants.spacingS),
          _MetricCard(
            label: 'Tasa de cancelación',
            value: '2.1%',
            icon: Icons.cancel_outlined,
            color: AppColors.error,
            subtitle: 'Límite: <5%',
          ),
          const SizedBox(height: AppConstants.spacingS),
          _MetricCard(
            label: 'Puntualidad',
            value: '97%',
            icon: Icons.access_time_filled_rounded,
            color: AppColors.info,
            subtitle: 'Llegadas a tiempo',
          ),
          const SizedBox(height: AppConstants.spacingS),
          _MetricCard(
            label: 'Viajes completados',
            value: '312',
            icon: Icons.local_taxi_rounded,
            color: AppColors.primary,
            subtitle: 'Total histórico',
          ),
          const SizedBox(height: AppConstants.spacingL),

          // Recent comments
          Text(
            'Comentarios recientes',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppConstants.spacingM),
          ..._mockComments.map((c) => _CommentCard(comment: c)),
        ],
      ),
    );
  }
}

const _distribution = {5: 0.82, 4: 0.12, 3: 0.04, 2: 0.01, 1: 0.01};

class _StarRow extends StatelessWidget {
  const _StarRow({required this.rating, this.size = 16});

  final double rating;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        final filled = i < rating.floor();
        final half = !filled && i < rating;
        return Icon(
          half ? Icons.star_half_rounded : Icons.star_rounded,
          size: size,
          color: (filled || half) ? AppColors.star : AppColors.divider,
        );
      }),
    );
  }
}

class _RatingBar extends StatelessWidget {
  const _RatingBar({required this.star, required this.percentage});

  final int star;
  final double percentage;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 24,
            child: Text(
              '$star',
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textSecondary),
            ),
          ),
          const Icon(Icons.star_rounded, size: 12, color: AppColors.star),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: percentage,
                backgroundColor: AppColors.outlineLight,
                valueColor:
                    const AlwaysStoppedAnimation<Color>(AppColors.star),
                minHeight: 8,
              ),
            ),
          ),
          const SizedBox(width: AppConstants.spacingS),
          SizedBox(
            width: 36,
            child: Text(
              '${(percentage * 100).round()}%',
              style: const TextStyle(
                  fontSize: 11, color: AppColors.textSecondary),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    required this.subtitle,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
            ),
            child: Icon(icon, size: 20, color: color),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(
                  subtitle,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          Text(
            value,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _CommentCard extends StatelessWidget {
  const _CommentCard({required this.comment});

  final _DriverComment comment;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _StarRow(rating: comment.stars.toDouble(), size: 14),
              Text(
                comment.date,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: AppColors.textSecondary),
              ),
            ],
          ),
          if (comment.text.isNotEmpty) ...[
            const SizedBox(height: AppConstants.spacingS),
            Text(comment.text, style: theme.textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}

class _DriverComment {
  const _DriverComment({
    required this.stars,
    required this.text,
    required this.date,
  });

  final int stars;
  final String text;
  final String date;
}

const _mockComments = [
  _DriverComment(
    stars: 5,
    text: 'Muy puntual y amable. El mejor servicio que he recibido.',
    date: 'Hoy',
  ),
  _DriverComment(
    stars: 5,
    text: 'Llegó rápido y condujo con cuidado.',
    date: 'Ayer',
  ),
  _DriverComment(
    stars: 4,
    text: 'Buen servicio.',
    date: 'Lun',
  ),
  _DriverComment(
    stars: 5,
    text: '',
    date: 'Dom',
  ),
];
