import 'package:flutter/material.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/mock_data/driver_mock.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';

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

// ── Mock data ─────────────────────────────────────────────────────────────────

const _acceptanceRate = 0.94;
const _completionRate = 0.97;
const _onTimeRate = 0.91;
const _weeklyHours = 38.5;
const _streak = 7;
const _weeklyTrips = 47;
const _weeklyEarnings = 234000.0;

// ── Screen ────────────────────────────────────────────────────────────────────

class PerformanceScreen extends StatefulWidget {
  const PerformanceScreen({super.key});

  @override
  State<PerformanceScreen> createState() => _PerformanceScreenState();
}

class _PerformanceScreenState extends State<PerformanceScreen>
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
    final tier = _tierFrom(DriverMock.totalTrips);

    return Scaffold(
      appBar: AppBar(title: const Text('Mi rendimiento')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          // ── Tier card ────────────────────────────────────────────────────
          _TierCard(
            tier: tier,
            totalTrips: DriverMock.totalTrips,
            anim: _anim,
          ),
          const SizedBox(height: AppConstants.spacingL),

          // ── Metric gauges ─────────────────────────────────────────────────
          Text(
            'Métricas clave',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _Gauge(
                label: 'Aceptación',
                value: _acceptanceRate,
                anim: _anim,
                color: AppColors.success,
              ),
              _Gauge(
                label: 'Completación',
                value: _completionRate,
                anim: _anim,
                color: AppColors.info,
              ),
              _Gauge(
                label: 'A tiempo',
                value: _onTimeRate,
                anim: _anim,
                color: AppColors.warning,
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingL),

          // ── Weekly stats ──────────────────────────────────────────────────
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
                  icon: Icons.access_time_rounded,
                  label: 'Horas en línea',
                  value: '${_weeklyHours.toStringAsFixed(1)} h',
                ),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: _StatTile(
                  icon: Icons.local_fire_department_rounded,
                  label: 'Racha activa',
                  value: '$_streak días',
                  accent: AppColors.error,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingS),
          Row(
            children: [
              Expanded(
                child: _StatTile(
                  icon: Icons.two_wheeler_rounded,
                  label: 'Viajes',
                  value: '$_weeklyTrips',
                ),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: _StatTile(
                  icon: Icons.payments_rounded,
                  label: 'Ganancias',
                  value: CurrencyFormatter.format(_weeklyEarnings),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingL),

          // ── Tips ──────────────────────────────────────────────────────────
          _TipsSection(
            acceptance: _acceptanceRate,
            completion: _completionRate,
            onTime: _onTimeRate,
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
    required this.anim,
  });

  final _Tier tier;
  final int totalTrips;
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
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                '⭐ ${DriverMock.rating}',
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
                    color: AppColors.textSecondary,
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

class _Gauge extends StatelessWidget {
  const _Gauge({
    required this.label,
    required this.value,
    required this.anim,
    required this.color,
  });

  final String label;
  final double value;
  final Animation<double> anim;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          width: 90,
          height: 90,
          child: AnimatedBuilder(
            animation: anim,
            builder: (_, __) {
              final v = value * anim.value;
              return Stack(
                alignment: Alignment.center,
                children: [
                  CircularProgressIndicator(
                    value: v,
                    strokeWidth: 7,
                    backgroundColor: Colors.grey.shade200,
                    valueColor: AlwaysStoppedAnimation<Color>(color),
                  ),
                  Text(
                    '${(v * 100).toInt()}%',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                ],
              );
            },
          ),
        ),
        const SizedBox(height: AppConstants.spacingS),
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w500,
          ),
          textAlign: TextAlign.center,
        ),
      ],
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
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
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

class _TipsSection extends StatelessWidget {
  const _TipsSection({
    required this.acceptance,
    required this.completion,
    required this.onTime,
  });

  final double acceptance;
  final double completion;
  final double onTime;

  @override
  Widget build(BuildContext context) {
    final tips = <String>[
      if (acceptance < 0.85)
        'Acepta más solicitudes para mejorar tu tasa '
            'de aceptación.',
      if (completion < 0.95)
        'Evita cancelar viajes en curso para subir tu '
            'tasa de completación.',
      if (onTime < 0.90)
        'Llega puntualmente al pickup para mejorar tu '
            'calificación a tiempo.',
    ];

    if (tips.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        decoration: BoxDecoration(
          color: AppColors.successContainer,
          borderRadius:
              BorderRadius.circular(AppConstants.radiusMedium),
        ),
        child: const Row(
          children: [
            Icon(
              Icons.check_circle_rounded,
              color: AppColors.success,
              size: 18,
            ),
            SizedBox(width: AppConstants.spacingS),
            Expanded(
              child: Text(
                '¡Excelente rendimiento! Sigue así para '
                'mantener tu nivel.',
                style: TextStyle(
                  color: AppColors.success,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Consejos para mejorar',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: AppConstants.spacingS),
        ...tips.map(
          (tip) => Padding(
            padding: const EdgeInsets.only(
              bottom: AppConstants.spacingS,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.lightbulb_outline_rounded,
                  size: 16,
                  color: AppColors.warning,
                ),
                const SizedBox(width: AppConstants.spacingS),
                Expanded(
                  child: Text(
                    tip,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
