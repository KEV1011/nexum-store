import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';

class PromotionsScreen extends StatelessWidget {
  const PromotionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Promociones e incentivos')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          // Active bonus
          _ActiveBonusCard(
            title: 'Bono de horas pico',
            subtitle: 'Gana x1.5 de 6–9 am y 5–8 pm',
            progress: 0.65,
            progressLabel: '13 de 20 viajes completados',
            reward: 25000,
            expiresIn: 'Hoy, 23:59',
            color: AppColors.serviceTaxi,
            icon: Icons.bolt_rounded,
          ),
          const SizedBox(height: AppConstants.spacingM),
          _ActiveBonusCard(
            title: 'Reto semanal',
            subtitle: 'Completa 50 viajes esta semana',
            progress: 0.62,
            progressLabel: '31 de 50 viajes',
            reward: 50000,
            expiresIn: 'Dom, 23:59',
            color: AppColors.secondary,
            icon: Icons.emoji_events_rounded,
          ),
          const SizedBox(height: AppConstants.spacingL),

          Text(
            'Incentivos disponibles',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppConstants.spacingM),
          ..._promotions.map((p) => _PromotionCard(promo: p)),
          const SizedBox(height: AppConstants.spacingL),

          Text(
            'Zonas de alta demanda',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppConstants.spacingS),
          Text(
            'Dirígete a estas zonas para aumentar tus ganancias ahora mismo.',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: context.textSecondaryColor),
          ),
          const SizedBox(height: AppConstants.spacingM),
          ..._hotZones.map((z) => _HotZoneTile(zone: z)),
        ],
      ),
    );
  }
}

class _ActiveBonusCard extends StatelessWidget {
  const _ActiveBonusCard({
    required this.title,
    required this.subtitle,
    required this.progress,
    required this.progressLabel,
    required this.reward,
    required this.expiresIn,
    required this.color,
    required this.icon,
  });

  final String title;
  final String subtitle;
  final double progress;
  final String progressLabel;
  final double reward;
  final String expiresIn;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
        border: Border.all(color: color.withValues(alpha: 0.3)),
        color: color.withValues(alpha: 0.06),
      ),
      padding: const EdgeInsets.all(AppConstants.spacingM),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius:
                      BorderRadius.circular(AppConstants.radiusMedium),
                ),
                child: Icon(icon, color: color, size: 20),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: color,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.textSecondaryColor,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    CurrencyFormatter.format(reward),
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: color,
                    ),
                  ),
                  Text(
                    'Premio',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: context.textSecondaryColor),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: color.withValues(alpha: 0.15),
              valueColor: AlwaysStoppedAnimation<Color>(color),
              minHeight: 8,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                progressLabel,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.textSecondaryColor,
                  fontSize: 11,
                ),
              ),
              Text(
                'Vence: $expiresIn',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.warning,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PromotionCard extends StatelessWidget {
  const _PromotionCard({required this.promo});

  final _Promotion promo;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : context.surfaceColor,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : context.outlineColor,
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.primaryContainer,
              borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
            ),
            child: Icon(promo.icon, size: 22, color: AppColors.primary),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  promo.title,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(
                  promo.description,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: context.textSecondaryColor),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppConstants.spacingS),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppConstants.spacingS,
              vertical: 4,
            ),
            decoration: BoxDecoration(
              color: AppColors.primaryContainer,
              borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
            ),
            child: Text(
              promo.badge,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppColors.primaryDim,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HotZoneTile extends StatelessWidget {
  const _HotZoneTile({required this.zone});

  final _HotZone zone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListTile(
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: AppColors.errorContainer,
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        ),
        child: const Icon(Icons.local_fire_department_rounded,
            color: AppColors.error, size: 20),
      ),
      title: Text(
        zone.name,
        style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        zone.distance,
        style: theme.textTheme.bodySmall
            ?.copyWith(color: context.textSecondaryColor),
      ),
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.errorContainer,
          borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
        ),
        child: Text(
          '${zone.multiplier}x',
          style: const TextStyle(
            color: AppColors.error,
            fontWeight: FontWeight.w800,
            fontSize: 13,
          ),
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(
        vertical: 4,
        horizontal: AppConstants.spacingS,
      ),
    );
  }
}

class _Promotion {
  const _Promotion({
    required this.icon,
    required this.title,
    required this.description,
    required this.badge,
  });

  final IconData icon;
  final String title;
  final String description;
  final String badge;
}

class _HotZone {
  const _HotZone({
    required this.name,
    required this.distance,
    required this.multiplier,
  });

  final String name;
  final String distance;
  final double multiplier;
}

const _promotions = [
  _Promotion(
    icon: Icons.star_rounded,
    title: 'Conductor estrella',
    description: 'Mantén +4.8 estrellas por 2 semanas',
    badge: '+\$30.000',
  ),
  _Promotion(
    icon: Icons.nightlight_round,
    title: 'Conductor nocturno',
    description: 'Completa 10 viajes entre 9pm y 5am',
    badge: 'x1.3',
  ),
  _Promotion(
    icon: Icons.groups_rounded,
    title: 'Referido de conductor',
    description: 'Invita un amigo y gana por sus primeros viajes',
    badge: '+\$20.000',
  ),
];

const _hotZones = [
  _HotZone(
    name: 'Parque Agueda Gallardo',
    distance: '0.8 km · Alta demanda ahora',
    multiplier: 1.5,
  ),
  _HotZone(
    name: 'Terminal de Transportes',
    distance: '1.2 km · Muy alta demanda',
    multiplier: 2.0,
  ),
  _HotZone(
    name: 'Mercado Central',
    distance: '0.5 km · Demanda moderada',
    multiplier: 1.3,
  ),
];
