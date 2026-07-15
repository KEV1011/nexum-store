import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/features/profile_verification/presentation/providers/driver_profile_provider.dart';
import 'package:nexum_driver/features/trip_history/presentation/providers/trip_history_provider.dart';

// ── Tier system ───────────────────────────────────────────────────────────────

enum _Tier { bronce, plata, oro, elite }

extension _TierX on _Tier {
  String get label => switch (this) {
        _Tier.bronce => 'Bronce',
        _Tier.plata => 'Plata',
        _Tier.oro => 'Oro',
        _Tier.elite => 'Élite',
      };

  Color get color => switch (this) {
        _Tier.bronce => const Color(0xFFCD7F32),
        _Tier.plata => const Color(0xFF9E9E9E),
        _Tier.oro => const Color(0xFFFFB300),
        _Tier.elite => AppColors.primary,
      };

  Color get bgColor => switch (this) {
        _Tier.bronce => const Color(0xFFFFF8F0),
        _Tier.plata => const Color(0xFFF5F5F5),
        _Tier.oro => const Color(0xFFFFFDE7),
        _Tier.elite => AppColors.primaryContainer,
      };

  IconData get icon => switch (this) {
        _Tier.bronce || _Tier.plata =>
          Icons.workspace_premium_rounded,
        _Tier.oro => Icons.stars_rounded,
        _Tier.elite => Icons.diamond_rounded,
      };

  int get minTrips => switch (this) {
        _Tier.bronce => 0,
        _Tier.plata => 50,
        _Tier.oro => 200,
        _Tier.elite => 500,
      };

  _Tier? get next => switch (this) {
        _Tier.bronce => _Tier.plata,
        _Tier.plata => _Tier.oro,
        _Tier.oro => _Tier.elite,
        _Tier.elite => null,
      };
}

_Tier _tierFrom(int trips) {
  if (trips >= 500) return _Tier.elite;
  if (trips >= 200) return _Tier.oro;
  if (trips >= 50) return _Tier.plata;
  return _Tier.bronce;
}

// ── Screen ────────────────────────────────────────────────────────────────────

class PerformanceScreen extends ConsumerStatefulWidget {
  const PerformanceScreen({super.key});

  @override
  ConsumerState<PerformanceScreen> createState() =>
      _PerformanceScreenState();
}

class _PerformanceScreenState extends ConsumerState<PerformanceScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..forward();
    _anim = CurvedAnimation(
      parent: _ctrl,
      curve: Curves.easeOutCubic,
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Datos reales: perfil del backend (viajes/calificación) e historial
    // liquidado (/earnings/history) para las cifras de la semana.
    final profile = ref.watch(driverProfileProvider).profile;
    final history = ref.watch(tripHistoryProvider);
    final totalTrips = profile?.totalTrips ?? 0;
    final rating = profile?.rating ?? 0;
    final tier = _tierFrom(totalTrips);

    final weekAgo = DateTime.now().subtract(const Duration(days: 7));
    final weekTrips =
        history.where((t) => t.finishedAt.isAfter(weekAgo)).toList();
    final weeklyEarnings =
        weekTrips.fold<double>(0, (sum, t) => sum + t.netEarning);

    return Scaffold(
      appBar: AppBar(title: const Text('Mi rendimiento')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          // ── Tier card ────────────────────────────────────────────────────
          _TierCard(
            tier: tier,
            totalTrips: totalTrips,
            rating: rating,
            anim: _anim,
          ),
          const SizedBox(height: AppConstants.spacingL),

          // ── Weekly stats (historial real) ─────────────────────────────────
          Text(
            'Esta semana',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          Row(
            children: [
              Expanded(
                child: _StatTile(
                  icon: Icons.two_wheeler_rounded,
                  label: 'Viajes',
                  value: '${weekTrips.length}',
                ),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: _StatTile(
                  icon: Icons.payments_rounded,
                  label: 'Ganancias',
                  value: CurrencyFormatter.format(weeklyEarnings),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingL),

          // ── Totales de la carrera ─────────────────────────────────────────
          Text(
            'Histórico',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          Row(
            children: [
              Expanded(
                child: _StatTile(
                  icon: Icons.route_rounded,
                  label: 'Viajes totales',
                  value: '$totalTrips',
                ),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: _StatTile(
                  icon: Icons.star_rounded,
                  label: 'Calificación',
                  value: rating.toStringAsFixed(2),
                  accent: AppColors.star,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),
        ],
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _TierCard extends StatelessWidget {
  const _TierCard({
    required this.tier,
    required this.totalTrips,
    required this.rating,
    required this.anim,
  });

  final _Tier tier;
  final int totalTrips;
  final double rating;
  final Animation<double> anim;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final next = tier.next;
    final progress = next == null
        ? 1.0
        : (totalTrips - tier.minTrips) /
            (next.minTrips - tier.minTrips);

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingL),
      decoration: BoxDecoration(
        color: tier.bgColor,
        borderRadius:
            BorderRadius.circular(AppConstants.radiusLarge),
        border: Border.all(
          color: tier.color.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: tier.color.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(tier.icon, color: tier.color, size: 26),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Nivel ${tier.label}',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: tier.color,
                      ),
                    ),
                    Text(
                      '$totalTrips viajes totales',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.textSecondaryColor,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                '⭐ ${rating.toStringAsFixed(2)}',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: tier.color,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),
          if (next != null) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${next.minTrips - totalTrips} para ${next.label}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.textSecondaryColor,
                  ),
                ),
                Text(
                  '$totalTrips / ${next.minTrips}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: tier.color,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingXS),
            AnimatedBuilder(
              animation: anim,
              builder: (_, __) => ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress * anim.value,
                  minHeight: 8,
                  backgroundColor:
                      tier.color.withValues(alpha: 0.15),
                  valueColor: AlwaysStoppedAnimation<Color>(
                    tier.color,
                  ),
                ),
              ),
            ),
          ] else
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingM,
                vertical: AppConstants.spacingXS,
              ),
              decoration: BoxDecoration(
                color: tier.color.withValues(alpha: 0.15),
                borderRadius:
                    BorderRadius.circular(AppConstants.radiusSmall),
              ),
              child: Text(
                '¡Nivel máximo alcanzado!',
                style: TextStyle(
                  color: tier.color,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.icon,
    required this.label,
    required this.value,
    this.accent,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final color = accent ?? AppColors.primary;
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius:
            BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: color.withValues(alpha: 0.15),
        ),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: color,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    color: context.textSecondaryColor,
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