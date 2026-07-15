import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/safe_back.dart';
import 'package:nexum_driver/features/pro/presentation/providers/pro_status_provider.dart';

/// Nexum Pro: nivel del conductor (Bronce → Diamante) calculado por el
/// backend con servicios liquidados y calificación reales. Nada inventado:
/// un conductor nuevo ve Bronce con 0 servicios.
class ProStatusScreen extends ConsumerStatefulWidget {
  const ProStatusScreen({super.key});

  @override
  ConsumerState<ProStatusScreen> createState() => _ProStatusScreenState();
}

class _ProStatusScreenState extends ConsumerState<ProStatusScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(proStatusProvider.notifier).load());
  }

  Color _levelColor(String level) => switch (level) {
        'PLATA' => const Color(0xFF64748B),
        'ORO' => const Color(0xFFF59E0B),
        'DIAMANTE' => const Color(0xFF0EA5E9),
        _ => const Color(0xFFB45309),
      };

  IconData _levelIcon(String level) => switch (level) {
        'PLATA' => Icons.military_tech_rounded,
        'ORO' => Icons.emoji_events_rounded,
        'DIAMANTE' => Icons.diamond_rounded,
        _ => Icons.workspace_premium_rounded,
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = ref.watch(proStatusProvider);
    final status = state.status;

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        title: const Text('Nexum Pro'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => safeBack(context),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(proStatusProvider.notifier).load(),
        child: state.isLoading && status == null
            ? const Center(child: CircularProgressIndicator())
            : state.error != null && status == null
                ? ListView(
                    children: [
                      const SizedBox(height: 120),
                      Icon(Icons.wifi_off_rounded,
                          size: 48, color: context.textTertiaryColor),
                      const SizedBox(height: AppConstants.spacingM),
                      Text(
                        state.error!,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(color: context.textSecondaryColor),
                      ),
                    ],
                  )
                : status == null
                    ? const SizedBox.shrink()
                    : ListView(
                        padding: const EdgeInsets.all(AppConstants.spacingM),
                        children: [
                          _buildHeader(theme, status),
                          const SizedBox(height: AppConstants.spacingM),
                          _buildStats(theme, status),
                          if (status.next != null) ...[
                            const SizedBox(height: AppConstants.spacingM),
                            _buildNextLevel(theme, status),
                          ],
                          const SizedBox(height: AppConstants.spacingL),
                          Text(
                            'NIVELES',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: context.textTertiaryColor,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.2,
                            ),
                          ),
                          const SizedBox(height: AppConstants.spacingS),
                          for (final def in status.levels)
                            _buildLevelCard(theme, status, def),
                          const SizedBox(height: AppConstants.spacingXL),
                        ],
                      ),
      ),
    );
  }

  Widget _buildHeader(ThemeData theme, ProStatus status) {
    final color = _levelColor(status.level);
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingL),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color, Color.lerp(color, Colors.black, 0.35)!],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
      ),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.18),
              shape: BoxShape.circle,
            ),
            child: Icon(_levelIcon(status.level), color: Colors.white, size: 34),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Tu nivel',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: Colors.white.withOpacity(0.85)),
                ),
                Text(
                  status.levelLabel,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStats(ThemeData theme, ProStatus status) {
    Widget stat(String value, String label, IconData icon) => Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(
              vertical: AppConstants.spacingM,
            ),
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
              border: Border.all(color: context.outlineColor),
            ),
            child: Column(
              children: [
                Icon(icon, size: 20, color: AppColors.primary),
                const SizedBox(height: 6),
                Text(
                  value,
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                Text(
                  label,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: context.textSecondaryColor),
                ),
              ],
            ),
          ),
        );

    return Row(
      children: [
        stat(status.rating.toStringAsFixed(2), 'Calificación',
            Icons.star_rounded),
        const SizedBox(width: AppConstants.spacingS),
        stat('${status.totalServices}', 'Servicios', Icons.route_rounded),
        const SizedBox(width: AppConstants.spacingS),
        stat('${status.monthServices}', 'Este mes',
            Icons.calendar_month_rounded),
      ],
    );
  }

  Widget _buildNextLevel(ThemeData theme, ProStatus status) {
    final next = status.next!;
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(color: context.outlineColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Camino a ${next.label}',
            style:
                theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppConstants.spacingS),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: next.progress,
              minHeight: 8,
              backgroundColor: context.surfaceVariantColor,
              valueColor:
                  const AlwaysStoppedAnimation<Color>(AppColors.primary),
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),
          Text(
            next.servicesNeeded > 0
                ? 'Te faltan ${next.servicesNeeded} servicios · calificación mínima ${next.minRating.toStringAsFixed(2)}'
                : 'Mantén tu calificación en ${next.minRating.toStringAsFixed(2)} o más para subir',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: context.textSecondaryColor),
          ),
        ],
      ),
    );
  }

  Widget _buildLevelCard(ThemeData theme, ProStatus status, ProLevelDef def) {
    final color = _levelColor(def.level);
    final isCurrent = def.level == status.level;
    return Container(
      margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isCurrent ? color : context.outlineColor,
          width: isCurrent ? 1.6 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(_levelIcon(def.level), color: color, size: 20),
              const SizedBox(width: AppConstants.spacingS),
              Text(
                def.label,
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const Spacer(),
              if (isCurrent)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    'Tu nivel',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: color,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            def.minServices > 0
                ? 'Desde ${def.minServices} servicios y calificación ${def.minRating.toStringAsFixed(2)}+'
                : 'Nivel de entrada — todos los conductores',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: context.textSecondaryColor),
          ),
          const SizedBox(height: 6),
          for (final perk in def.perks)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.check_rounded, size: 16, color: color),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      perk,
                      style: theme.textTheme.bodySmall,
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
