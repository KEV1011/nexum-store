import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

// ── Comment model ─────────────────────────────────────────────────────────────

class _DriverComment {
  const _DriverComment({
    required this.stars,
    required this.text,
    required this.date,
    required this.passengerName,
  });

  final int stars;
  final String text;
  final String date;
  final String passengerName;

  String get initials {
    final parts = passengerName.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return passengerName[0].toUpperCase();
  }
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const _distribution = {5: 0.82, 4: 0.12, 3: 0.04, 2: 0.01, 1: 0.01};

// 7-day trend: (day label, avg rating)
const _weekTrend = [
  ('L', 4.7),
  ('M', 4.9),
  ('X', 4.8),
  ('J', 5.0),
  ('V', 4.9),
  ('S', 4.8),
  ('D', 4.87),
];

const _mockComments = [
  _DriverComment(
    stars: 5,
    text: 'Muy puntual y amable. El mejor servicio que he recibido.',
    date: 'Hoy',
    passengerName: 'Valentina R.',
  ),
  _DriverComment(
    stars: 5,
    text: 'Llegó rápido y condujo con cuidado. Muy profesional.',
    date: 'Hoy',
    passengerName: 'Luis M.',
  ),
  _DriverComment(
    stars: 4,
    text: 'Buen servicio, llegó un poco tarde pero manejó bien.',
    date: 'Ayer',
    passengerName: 'Jorge H.',
  ),
  _DriverComment(
    stars: 5,
    text: 'El conductor fue muy respetuoso y conocía las calles perfectamente.',
    date: 'Ayer',
    passengerName: 'Marcela T.',
  ),
  _DriverComment(
    stars: 5,
    text: '',
    date: 'Lun',
    passengerName: 'Andrés F.',
  ),
  _DriverComment(
    stars: 4,
    text: 'Buen viaje. La moto estaba limpia y el conductor amable.',
    date: 'Dom',
    passengerName: 'Carolina P.',
  ),
  _DriverComment(
    stars: 5,
    text: 'Excelente. Llegó antes de lo esperado y el trayecto fue seguro.',
    date: 'Sáb',
    passengerName: 'Claudia V.',
  ),
  _DriverComment(
    stars: 3,
    text: 'El servicio fue regular. Tardó más de lo indicado.',
    date: 'Vie',
    passengerName: 'Ricardo B.',
  ),
];

// ── Screen ────────────────────────────────────────────────────────────────────

class RatingsScreen extends StatefulWidget {
  const RatingsScreen({super.key});

  @override
  State<RatingsScreen> createState() => _RatingsScreenState();
}

class _RatingsScreenState extends State<RatingsScreen> {
  static const double _overallRating = 4.87;
  static const int _totalRatings = 287;

  int _periodIndex = 0;
  static const _periods = ['Esta semana', 'Este mes', 'Total'];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Calificaciones')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          // ── Period filter ────────────────────────────────────────────────
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _periods.length,
              separatorBuilder: (_, __) =>
                  const SizedBox(width: AppConstants.spacingS),
              itemBuilder: (_, i) => ChoiceChip(
                label: Text(_periods[i]),
                selected: _periodIndex == i,
                onSelected: (_) => setState(() => _periodIndex = i),
                selectedColor: AppColors.starContainer,
                labelStyle: TextStyle(
                  color: _periodIndex == i
                      ? AppColors.star
                      : AppColors.textSecondary,
                  fontWeight: _periodIndex == i
                      ? FontWeight.w700
                      : FontWeight.w400,
                  fontSize: 13,
                ),
                showCheckmark: false,
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // ── Overall rating card ──────────────────────────────────────────
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
                            style:
                                TextStyle(color: AppColors.textSecondary)),
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
                    (star) => _RatingDistBar(
                      star: star,
                      percentage: _distribution[star] ?? 0,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // ── Weekly trend chart ───────────────────────────────────────────
          Card(
            child: Padding(
              padding: const EdgeInsets.all(AppConstants.spacingM),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.trending_up_rounded,
                          color: AppColors.star, size: 18),
                      const SizedBox(width: AppConstants.spacingS),
                      Text(
                        'Tendencia semanal',
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.successContainer,
                          borderRadius: BorderRadius.circular(
                              AppConstants.radiusCircular),
                        ),
                        child: const Text(
                          '+0.17 vs semana ant.',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: AppColors.success,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppConstants.spacingM),
                  _WeeklyTrendChart(data: _weekTrend),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // ── Performance metrics ──────────────────────────────────────────
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
            value: '342',
            icon: Icons.local_taxi_rounded,
            color: AppColors.primary,
            subtitle: 'Total histórico',
          ),
          const SizedBox(height: AppConstants.spacingL),

          // ── Recent comments ──────────────────────────────────────────────
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

// ── Weekly trend chart ────────────────────────────────────────────────────────

class _WeeklyTrendChart extends StatelessWidget {
  const _WeeklyTrendChart({required this.data});
  final List<(String, double)> data;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const minRating = 4.5;
    const maxRating = 5.0;
    const chartHeight = 80.0;

    return SizedBox(
      height: chartHeight + 32,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: data.map((entry) {
          final (day, rating) = entry;
          final isToday = day == 'D';
          final fraction =
              ((rating - minRating) / (maxRating - minRating)).clamp(0.1, 1.0);
          final barH = fraction * chartHeight;

          return Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                // Rating label on top of bar
                Text(
                  rating.toStringAsFixed(1),
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color:
                        isToday ? AppColors.star : AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 2),
                // Bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: AnimatedContainer(
                    duration: AppConstants.mediumAnimation,
                    height: barH,
                    decoration: BoxDecoration(
                      color: isToday
                          ? AppColors.star
                          : AppColors.star.withValues(alpha: 0.35),
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(4),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                // Day label
                Text(
                  day,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 11,
                    fontWeight:
                        isToday ? FontWeight.w700 : FontWeight.normal,
                    color: isToday
                        ? AppColors.star
                        : AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

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

class _RatingDistBar extends StatelessWidget {
  const _RatingDistBar({required this.star, required this.percentage});
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
                Text(label,
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w600)),
                Text(subtitle,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: AppColors.textSecondary)),
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

    // Pick a deterministic hue for the avatar based on the name
    final hue = (comment.passengerName.codeUnits
                .fold(0, (acc, c) => acc + c) %
            6) *
        60.0;
    final avatarColor = HSLColor.fromAHSL(1, hue, 0.5, 0.45).toColor();

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
            children: [
              // Passenger avatar
              CircleAvatar(
                radius: 16,
                backgroundColor: avatarColor.withValues(alpha: 0.18),
                child: Text(
                  comment.initials,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: avatarColor,
                  ),
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      comment.passengerName,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    Text(
                      comment.date,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
              // Stars
              Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(comment.stars, (_) => const Icon(
                  Icons.star_rounded,
                  size: 14,
                  color: AppColors.star,
                )),
              ),
            ],
          ),
          if (comment.text.isNotEmpty) ...[
            const SizedBox(height: AppConstants.spacingS),
            Text(
              comment.text,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
                height: 1.4,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
