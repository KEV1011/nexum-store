import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/profile_verification/presentation/providers/driver_profile_provider.dart';
import 'package:nexum_driver/features/trip_history/presentation/providers/trip_history_provider.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';
import 'package:nexum_driver/shared/widgets/skeleton_loader.dart';

/// Calificaciones del conductor con datos 100 % reales: el promedio de
/// carrera viene del perfil (`/driver/profile`) y la distribución por
/// estrellas se calcula del historial liquidado (`/earnings/history`).
/// Los comentarios escritos de pasajeros aún no existen en el backend,
/// así que esa sección muestra un estado vacío honesto (nada inventado).
class RatingsScreen extends ConsumerStatefulWidget {
  const RatingsScreen({super.key});

  @override
  ConsumerState<RatingsScreen> createState() => _RatingsScreenState();
}

class _RatingsScreenState extends ConsumerState<RatingsScreen> {
  int _periodIndex = 0;
  static const _periods = ['Esta semana', 'Este mes', 'Total'];

  List<TripModel> _tripsForPeriod(List<TripModel> history) {
    final now = DateTime.now();
    return switch (_periodIndex) {
      0 => history
          .where(
            (t) => t.finishedAt.isAfter(
              now.subtract(const Duration(days: 7)),
            ),
          )
          .toList(),
      1 => history
          .where(
            (t) => t.finishedAt.isAfter(
              now.subtract(const Duration(days: 30)),
            ),
          )
          .toList(),
      _ => history,
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final profileState = ref.watch(driverProfileProvider);
    final history = ref.watch(tripHistoryProvider);

    if (profileState.isLoading && profileState.profile == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Calificaciones')),
        body: SkeletonLoader(
          child: ListView(
            padding: const EdgeInsets.all(AppConstants.spacingM),
            children: const [
              SkeletonBox(height: 130, radius: 12),
              SizedBox(height: AppConstants.spacingM),
              SkeletonBox(height: 160, radius: 12),
              SizedBox(height: AppConstants.spacingM),
              SkeletonBox(height: 120, radius: 12),
            ],
          ),
        ),
      );
    }

    final profile = profileState.profile;
    final trips = _tripsForPeriod(history);
    final rated = trips.where((t) => t.rating != null).toList();

    // Promedio: en "Total" manda el promedio de carrera del perfil; en los
    // períodos cortos, el promedio real de los viajes calificados del rango.
    final double avg;
    if (_periodIndex == 2 && profile != null) {
      avg = profile.rating;
    } else if (rated.isNotEmpty) {
      avg = rated.fold<double>(0, (s, t) => s + (t.rating ?? 0)) /
          rated.length;
    } else {
      avg = profile?.rating ?? 0;
    }
    final tripCount =
        _periodIndex == 2 ? (profile?.totalTrips ?? trips.length) : trips.length;

    // Distribución 5→1 estrellas de las calificaciones reales del período.
    final dist = <int, int>{for (var s = 1; s <= 5; s++) s: 0};
    for (final t in rated) {
      final s = (t.rating ?? 0).round().clamp(1, 5);
      dist[s] = (dist[s] ?? 0) + 1;
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Calificaciones')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          // ── Filtro de período ────────────────────────────────────────────
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

          // ── Promedio ─────────────────────────────────────────────────────
          Card(
            child: Padding(
              padding: const EdgeInsets.all(AppConstants.spacingL),
              child: Column(
                children: [
                  Text(
                    avg.toStringAsFixed(2),
                    style: theme.textTheme.displayMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.star,
                    ),
                  ),
                  const SizedBox(height: 4),
                  _Stars(rating: avg, size: 22),
                  const SizedBox(height: AppConstants.spacingS),
                  Text(
                    _periodIndex == 2
                        ? '$tripCount viajes completados'
                        : '$tripCount viajes en el período',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // ── Distribución por estrellas (viajes calificados reales) ───────
          if (rated.isNotEmpty) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(AppConstants.spacingM),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Distribución',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingM),
                    for (var stars = 5; stars >= 1; stars--)
                      _DistRow(
                        stars: stars,
                        count: dist[stars] ?? 0,
                        total: rated.length,
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppConstants.spacingM),
          ],

          // ── Comentarios (aún sin backend: estado vacío honesto) ──────────
          Card(
            child: Padding(
              padding: const EdgeInsets.all(AppConstants.spacingL),
              child: Column(
                children: [
                  Icon(
                    Icons.forum_outlined,
                    size: 40,
                    color: AppColors.textTertiary,
                  ),
                  const SizedBox(height: AppConstants.spacingS),
                  Text(
                    'Aún no hay comentarios',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Cuando tus pasajeros dejen comentarios al '
                    'calificarte, aparecerán aquí.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
        ],
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _Stars extends StatelessWidget {
  const _Stars({required this.rating, this.size = 16});
  final double rating;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        final filled = i < rating.floor();
        final half = !filled && i < rating && (rating - i) >= 0.5;
        return Icon(
          filled
              ? Icons.star_rounded
              : half
                  ? Icons.star_half_rounded
                  : Icons.star_outline_rounded,
          color: AppColors.star,
          size: size,
        );
      }),
    );
  }
}

class _DistRow extends StatelessWidget {
  const _DistRow({
    required this.stars,
    required this.count,
    required this.total,
  });

  final int stars;
  final int count;
  final int total;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fraction = total == 0 ? 0.0 : count / total;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 14,
            child: Text(
              '$stars',
              style: theme.textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const Icon(Icons.star_rounded, size: 12, color: AppColors.star),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: fraction,
                minHeight: 6,
                backgroundColor: AppColors.star.withValues(alpha: 0.15),
                valueColor:
                    const AlwaysStoppedAnimation<Color>(AppColors.star),
              ),
            ),
          ),
          const SizedBox(width: AppConstants.spacingS),
          SizedBox(
            width: 28,
            child: Text(
              '$count',
              textAlign: TextAlign.end,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
