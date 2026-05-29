import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/'
    'business_order_entity.dart';
import 'package:nexum_driver/features/business_portal/presentation/providers/'
    'business_portal_provider.dart';
import 'package:nexum_driver/shared/widgets/skeleton_loader.dart';

class BusinessPortalScreen extends ConsumerStatefulWidget {
  const BusinessPortalScreen({super.key});

  @override
  ConsumerState<BusinessPortalScreen> createState() =>
      _BusinessPortalScreenState();
}

class _BusinessPortalScreenState
    extends ConsumerState<BusinessPortalScreen> {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final orders = ref.watch(businessOrdersProvider);

    return Scaffold(
      backgroundColor: isDark
          ? AppColors.backgroundDark
          : AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor:
            isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Portal del Negocio',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(
              'Restaurante El Sabor Pamplonés',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.serviceEnvios,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () =>
                ref.read(businessOrdersProvider.notifier).refresh(),
            tooltip: 'Actualizar pedidos',
          ),
        ],
      ),
      body: orders.when(
        loading: _buildSkeleton,
        error: (e, _) => _buildError(e),
        data: (orderList) => _buildContent(
          context: context,
          theme: theme,
          isDark: isDark,
          orders: orderList,
          stats: ref.watch(orderStatsProvider),
        ),
      ),
    );
  }

  // ── Skeleton ──────────────────────────────────────────────────────────────

  Widget _buildSkeleton() {
    return SkeletonLoader(
      child: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          const SkeletonBox(height: 88, radius: AppConstants.radiusMedium),
          const SizedBox(height: AppConstants.spacingM),
          const SkeletonBox(height: 64, radius: AppConstants.radiusMedium),
          const SizedBox(height: AppConstants.spacingM),
          ...List.generate(
            4,
            (_) => const Padding(
              padding: EdgeInsets.only(bottom: AppConstants.spacingS),
              child: SkeletonBox(
                height: 96,
                radius: AppConstants.radiusMedium,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  Widget _buildError(Object e) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.error_outline,
            size: 48,
            color: AppColors.error,
          ),
          const SizedBox(height: AppConstants.spacingS),
          Text(
            'No se pudieron cargar los pedidos',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          TextButton(
            onPressed: () =>
                ref.read(businessOrdersProvider.notifier).refresh(),
            child: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }

  // ── Content ───────────────────────────────────────────────────────────────

  Widget _buildContent({
    required BuildContext context,
    required ThemeData theme,
    required bool isDark,
    required List<BusinessOrderEntity> orders,
    required OrderStats stats,
  }) {
    return RefreshIndicator(
      color: AppColors.serviceEnvios,
      onRefresh: () =>
          ref.read(businessOrdersProvider.notifier).refresh(),
      child: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          _StatsCard(stats: stats, isDark: isDark, theme: theme),
          const SizedBox(height: AppConstants.spacingM),
          _LiveIndicator(orders: orders, isDark: isDark, theme: theme),
          const SizedBox(height: AppConstants.spacingM),
          Text(
            'Pedidos de hoy',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: isDark
                  ? AppColors.textOnDark
                  : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),
          ...orders.map(
            (order) => Padding(
              padding: const EdgeInsets.only(
                bottom: AppConstants.spacingS,
              ),
              child: _OrderCard(
                order: order,
                isDark: isDark,
                theme: theme,
                onTap: () => context.push(
                  '/business-portal/order/${order.id}',
                  extra: order,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Stats card ───────────────────────────────────────────────────────────────

class _StatsCard extends StatelessWidget {
  const _StatsCard({
    required this.stats,
    required this.isDark,
    required this.theme,
  });

  final OrderStats stats;
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final pct = (stats.fullCustodyRate * 100).toStringAsFixed(0);

    return Container(
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
              const Icon(
                Icons.storefront_rounded,
                size: 18,
                color: AppColors.serviceEnvios,
              ),
              const SizedBox(width: 6),
              Text(
                'Resumen del día',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: AppColors.serviceEnvios,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
              const Spacer(),
              Text(
                DateFormatter.formatDate(DateTime.now()),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textTertiary,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),
          Row(
            children: [
              _StatCell(
                value: '${stats.total}',
                label: 'Total',
                color: AppColors.serviceEnvios,
                theme: theme,
              ),
              _StatCell(
                value: '${stats.inTransit}',
                label: 'En camino',
                color: AppColors.warning,
                theme: theme,
              ),
              _StatCell(
                value: '${stats.delivered}',
                label: 'Entregados',
                color: AppColors.success,
                theme: theme,
              ),
              _StatCell(
                value: '$pct%',
                label: 'Cadena OK',
                color: stats.fullCustodyRate >= 0.8
                    ? AppColors.success
                    : AppColors.warning,
                theme: theme,
              ),
            ],
          ),
          if (stats.delivered > 0) ...[
            const SizedBox(height: AppConstants.spacingM),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: stats.fullCustodyRate,
                backgroundColor: isDark
                    ? AppColors.outlineDark
                    : AppColors.outlineLight,
                color: stats.fullCustodyRate >= 0.8
                    ? AppColors.success
                    : AppColors.warning,
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '$pct% de pedidos con cadena de custodia completa',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StatCell extends StatelessWidget {
  const _StatCell({
    required this.value,
    required this.label,
    required this.color,
    required this.theme,
  });

  final String value;
  final String label;
  final Color color;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Live indicator ───────────────────────────────────────────────────────────

class _LiveIndicator extends StatelessWidget {
  const _LiveIndicator({
    required this.orders,
    required this.isDark,
    required this.theme,
  });

  final List<BusinessOrderEntity> orders;
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final active = orders
        .where(
          (o) =>
              o.status == BusinessOrderStatus.inTransit ||
              o.status == BusinessOrderStatus.pending ||
              o.status == BusinessOrderStatus.atPickup,
        )
        .toList();

    if (active.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        decoration: BoxDecoration(
          color: AppColors.successContainer.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        ),
        child: Row(
          children: [
            const Icon(
              Icons.check_circle_rounded,
              color: AppColors.success,
              size: 20,
            ),
            const SizedBox(width: 8),
            Text(
              'Sin pedidos activos en este momento',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.success,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.warningContainer.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: AppColors.warning.withValues(alpha: 0.4),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: AppColors.warning,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${active.length} pedido${active.length > 1 ? 's' : ''}'
                ' en curso',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: AppColors.warning,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ...active.map(
            (o) => Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '${o.orderRef} · ${o.customerName} · '
                '${_statusLabel(o.status)}',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textPrimary,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _statusLabel(BusinessOrderStatus status) {
    switch (status) {
      case BusinessOrderStatus.pending:
        return 'Conductor en camino al local';
      case BusinessOrderStatus.atPickup:
        return 'En el local';
      case BusinessOrderStatus.inTransit:
        return 'En camino al cliente';
      case BusinessOrderStatus.delivered:
        return 'Entregado';
    }
  }
}

// ── Order card ───────────────────────────────────────────────────────────────

class _OrderCard extends StatelessWidget {
  const _OrderCard({
    required this.order,
    required this.isDark,
    required this.theme,
    required this.onTap,
  });

  final BusinessOrderEntity order;
  final bool isDark;
  final ThemeData theme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (statusColor, statusBg, statusLabel) = _statusMeta(order.status);

    return Material(
      color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          decoration: BoxDecoration(
            border: Border.all(
              color: isDark
                  ? AppColors.outlineDark
                  : AppColors.outlineLight,
            ),
            borderRadius: BorderRadius.circular(
              AppConstants.radiusMedium,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    order.orderRef,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: statusBg,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      statusLabel,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: statusColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Text(
                    CurrencyFormatter.format(order.grossFare),
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: AppColors.serviceEnvios,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                order.customerName,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w500,
                ),
              ),
              Text(
                order.customerAddress,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  _CustodyDot(
                    filled: order.pickedUpAt != null,
                    label: 'Recogido',
                    theme: theme,
                  ),
                  _CustodyLine(
                    filled: order.pickedUpAt != null &&
                        order.isDelivered,
                  ),
                  _CustodyDot(
                    filled: order.isDelivered,
                    label: 'Entregado',
                    theme: theme,
                  ),
                  const Spacer(),
                  if (order.isDelivered)
                    _CustodyBadge(
                      full: order.hasFullCustody,
                      theme: theme,
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                DateFormatter.formatTime(order.createdAt),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textTertiary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  (Color, Color, String) _statusMeta(BusinessOrderStatus status) {
    switch (status) {
      case BusinessOrderStatus.pending:
        return (
          AppColors.warning,
          AppColors.warningContainer,
          'Pendiente',
        );
      case BusinessOrderStatus.atPickup:
        return (
          AppColors.info,
          AppColors.infoContainer,
          'En el local',
        );
      case BusinessOrderStatus.inTransit:
        return (
          AppColors.serviceEnvios,
          AppColors.serviceEnviosContainer,
          'En tránsito',
        );
      case BusinessOrderStatus.delivered:
        return (
          AppColors.success,
          AppColors.successContainer,
          'Entregado',
        );
    }
  }
}

class _CustodyDot extends StatelessWidget {
  const _CustodyDot({
    required this.filled,
    required this.label,
    required this.theme,
  });

  final bool filled;
  final String label;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: filled ? AppColors.success : AppColors.outlineLight,
            border: Border.all(
              color: filled
                  ? AppColors.success
                  : AppColors.textTertiary,
              width: 1.5,
            ),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.textTertiary,
            fontSize: 9,
          ),
        ),
      ],
    );
  }
}

class _CustodyLine extends StatelessWidget {
  const _CustodyLine({required this.filled});

  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        height: 2,
        margin: const EdgeInsets.only(bottom: 14),
        color: filled
            ? AppColors.success.withValues(alpha: 0.5)
            : AppColors.outlineLight,
      ),
    );
  }
}

class _CustodyBadge extends StatelessWidget {
  const _CustodyBadge({
    required this.full,
    required this.theme,
  });

  final bool full;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: full
            ? AppColors.successContainer
            : AppColors.warningContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            full
                ? Icons.verified_rounded
                : Icons.warning_amber_rounded,
            size: 10,
            color: full ? AppColors.success : AppColors.warning,
          ),
          const SizedBox(width: 3),
          Text(
            full ? 'Verificada' : 'Parcial',
            style: theme.textTheme.labelSmall?.copyWith(
              color: full ? AppColors.success : AppColors.warning,
              fontWeight: FontWeight.w600,
              fontSize: 9,
            ),
          ),
        ],
      ),
    );
  }
}
