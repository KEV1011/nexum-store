import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/features/business_portal/data/datasources/business_portal_datasource.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/business_earnings_entity.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/business_order_entity.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/business_product_entity.dart';
import 'package:nexum_driver/features/auth/presentation/providers/auth_provider.dart';
import 'package:nexum_driver/features/business_portal/presentation/providers/business_portal_provider.dart';
import 'package:nexum_driver/shared/widgets/skeleton_loader.dart';

// ─────────────────────────────────────────────────────────────────────────────
//  Portal principal
// ─────────────────────────────────────────────────────────────────────────────

class BusinessPortalScreen extends ConsumerStatefulWidget {
  const BusinessPortalScreen({super.key});

  @override
  ConsumerState<BusinessPortalScreen> createState() =>
      _BusinessPortalScreenState();
}

class _BusinessPortalScreenState extends ConsumerState<BusinessPortalScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tab;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 4, vsync: this);
    // Poll for incoming orders every 8 s in mock mode
    _pollTimer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (mounted) {
        ref.read(incomingOrderProvider.notifier).poll();
      }
    });
  }

  @override
  void dispose() {
    _tab.dispose();
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final settings = ref.watch(businessSettingsProvider);
    final businessName =
        settings.valueOrNull?.name ?? 'Portal del Negocio';
    final isOpen = settings.valueOrNull?.isOpen ?? true;

    return Scaffold(
      backgroundColor:
          isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor:
            isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              businessName,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            Row(
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isOpen ? AppColors.success : AppColors.error,
                  ),
                ),
                const SizedBox(width: 4),
                Text(
                  isOpen ? 'Abierto' : 'Cerrado',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: isOpen ? AppColors.success : AppColors.error,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              ref.read(businessOrdersProvider.notifier).refresh();
              ref.invalidate(businessEarningsProvider);
            },
          ),
        ],
        bottom: TabBar(
          controller: _tab,
          labelColor: AppColors.serviceEnvios,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.serviceEnvios,
          indicatorSize: TabBarIndicatorSize.label,
          labelStyle: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w700,
          ),
          tabs: const [
            Tab(icon: Icon(Icons.receipt_long_rounded, size: 20), text: 'Pedidos'),
            Tab(icon: Icon(Icons.menu_book_rounded, size: 20), text: 'Menú'),
            Tab(icon: Icon(Icons.bar_chart_rounded, size: 20), text: 'Ganancias'),
            Tab(icon: Icon(Icons.storefront_rounded, size: 20), text: 'Mi negocio'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _OrdersTab(isDark: isDark, theme: theme),
          _MenuTab(isDark: isDark, theme: theme),
          _EarningsTab(isDark: isDark, theme: theme),
          _MyBusinessTab(isDark: isDark, theme: theme),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  TAB 1 — Pedidos
// ─────────────────────────────────────────────────────────────────────────────

class _OrdersTab extends ConsumerWidget {
  const _OrdersTab({required this.isDark, required this.theme});
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final incoming = ref.watch(incomingOrderProvider);
    final orders = ref.watch(businessOrdersProvider);
    final stats = ref.watch(orderStatsProvider);

    return RefreshIndicator(
      color: AppColors.serviceEnvios,
      onRefresh: () => ref.read(businessOrdersProvider.notifier).refresh(),
      child: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          // Incoming order banner
          incoming.whenOrNull(
            data: (order) => order != null
                ? _IncomingOrderBanner(order: order, isDark: isDark, theme: theme)
                : const SizedBox.shrink(),
          ) ?? const SizedBox.shrink(),

          const SizedBox(height: AppConstants.spacingM),

          // Day stats
          _StatsRow(stats: stats, isDark: isDark, theme: theme),

          const SizedBox(height: AppConstants.spacingM),

          // Active orders section
          if (stats.inTransit > 0) ...[
            _SectionHeader(label: 'EN CURSO', count: stats.inTransit, theme: theme),
            const SizedBox(height: AppConstants.spacingS),
          ],

          orders.when(
            loading: () => const _OrdersSkeleton(),
            error: (e, _) => _ErrorCard(message: e.toString(), theme: theme, isDark: isDark),
            data: (list) {
              final active = list.where((o) => !o.isDelivered).toList();
              final done = list.where((o) => o.isDelivered).toList();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ...active.map((o) => Padding(
                    padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
                    child: _OrderCard(order: o, isDark: isDark, theme: theme,
                      onTap: () => context.push('/business-portal/order/${o.id}', extra: o)),
                  )),
                  if (done.isNotEmpty) ...[
                    const SizedBox(height: AppConstants.spacingS),
                    _SectionHeader(label: 'ENTREGADOS HOY', count: done.length, theme: theme),
                    const SizedBox(height: AppConstants.spacingS),
                    ...done.map((o) => Padding(
                      padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
                      child: _OrderCard(order: o, isDark: isDark, theme: theme,
                        onTap: () => context.push('/business-portal/order/${o.id}', extra: o)),
                    )),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _IncomingOrderBanner extends ConsumerStatefulWidget {
  const _IncomingOrderBanner({
    required this.order,
    required this.isDark,
    required this.theme,
  });
  final BusinessOrderEntity order;
  final bool isDark;
  final ThemeData theme;

  @override
  ConsumerState<_IncomingOrderBanner> createState() =>
      _IncomingOrderBannerState();
}

class _IncomingOrderBannerState extends ConsumerState<_IncomingOrderBanner>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulse;
  int _prepMinutes = 15;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (_, child) => Container(
        decoration: BoxDecoration(
          color: Color.lerp(
            AppColors.success.withValues(alpha: 0.12),
            AppColors.success.withValues(alpha: 0.22),
            _pulse.value,
          ),
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: Border.all(
            color: AppColors.success.withValues(alpha: 0.7),
            width: 1.5,
          ),
        ),
        child: child,
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.success,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '¡PEDIDO NUEVO!',
                    style: widget.theme.textTheme.labelSmall?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
                const Spacer(),
                Text(
                  widget.order.orderRef,
                  style: widget.theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: AppColors.success,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              widget.order.customerName,
              style: widget.theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              widget.order.customerAddress,
              style: widget.theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              CurrencyFormatter.format(widget.order.grossFare),
              style: widget.theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.success,
              ),
            ),
            const SizedBox(height: AppConstants.spacingM),
            // Prep time selector
            Row(
              children: [
                Text(
                  'Tiempo de preparación:',
                  style: widget.theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(width: 8),
                ...[10, 15, 20, 30].map((min) => Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: GestureDetector(
                    onTap: () => setState(() => _prepMinutes = min),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: _prepMinutes == min
                            ? AppColors.success
                            : AppColors.success.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        '${min}m',
                        style: widget.theme.textTheme.labelSmall?.copyWith(
                          color: _prepMinutes == min ? Colors.white : AppColors.success,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                )),
              ],
            ),
            const SizedBox(height: AppConstants.spacingM),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _loading
                        ? null
                        : () async {
                            setState(() => _loading = true);
                            await ref.read(incomingOrderProvider.notifier)
                                .reject(widget.order.id, 'No disponible');
                          },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.error,
                      side: const BorderSide(color: AppColors.error),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                      ),
                    ),
                    child: const Text('Rechazar'),
                  ),
                ),
                const SizedBox(width: AppConstants.spacingS),
                Expanded(
                  flex: 2,
                  child: ElevatedButton(
                    onPressed: _loading
                        ? null
                        : () async {
                            setState(() => _loading = true);
                            await ref.read(incomingOrderProvider.notifier)
                                .accept(widget.order.id, _prepMinutes);
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.success,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                      ),
                    ),
                    child: _loading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text('Aceptar · ${_prepMinutes}min'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.stats, required this.isDark, required this.theme});
  final OrderStats stats;
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
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
          _StatCell(value: '${stats.total}', label: 'Total', color: AppColors.serviceEnvios, theme: theme),
          _StatCell(value: '${stats.inTransit}', label: 'En curso', color: AppColors.warning, theme: theme),
          _StatCell(value: '${stats.delivered}', label: 'Entregados', color: AppColors.success, theme: theme),
          _StatCell(
            value: '${(stats.fullCustodyRate * 100).toStringAsFixed(0)}%',
            label: 'Custodia ✓',
            color: stats.fullCustodyRate >= 0.8 ? AppColors.success : AppColors.warning,
            theme: theme,
          ),
        ],
      ),
    );
  }
}

class _StatCell extends StatelessWidget {
  const _StatCell({required this.value, required this.label, required this.color, required this.theme});
  final String value;
  final String label;
  final Color color;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      children: [
        Text(value, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800, color: color)),
        Text(label, style: theme.textTheme.labelSmall?.copyWith(color: AppColors.textTertiary), textAlign: TextAlign.center),
      ],
    ),
  );
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label, required this.count, required this.theme});
  final String label;
  final int count;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Text(label, style: theme.textTheme.labelSmall?.copyWith(color: AppColors.textTertiary, fontWeight: FontWeight.w700, letterSpacing: 1)),
      const SizedBox(width: 6),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
        decoration: BoxDecoration(color: AppColors.serviceEnviosContainer, borderRadius: BorderRadius.circular(20)),
        child: Text('$count', style: theme.textTheme.labelSmall?.copyWith(color: AppColors.serviceEnvios, fontWeight: FontWeight.w700)),
      ),
    ],
  );
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.isDark, required this.theme, required this.onTap});
  final BusinessOrderEntity order;
  final bool isDark;
  final ThemeData theme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (statusColor, statusBg, statusLabel) = _statusMeta(order.status);
    final commission = order.grossFare * AppConstants.businessCommissionRate;
    final net = order.grossFare - commission;

    return Material(
      color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          decoration: BoxDecoration(
            border: Border.all(color: isDark ? AppColors.outlineDark : AppColors.outlineLight),
            borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(order.orderRef, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(color: statusBg, borderRadius: BorderRadius.circular(20)),
                    child: Text(statusLabel, style: theme.textTheme.labelSmall?.copyWith(color: statusColor, fontWeight: FontWeight.w600)),
                  ),
                  const Spacer(),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(CurrencyFormatter.format(order.grossFare),
                          style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary, decoration: TextDecoration.lineThrough)),
                      Text(CurrencyFormatter.format(net),
                          style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, color: AppColors.success)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(order.customerName, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
              Text(order.customerAddress, style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary), maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 6),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(color: AppColors.serviceEnviosContainer.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(12)),
                    child: Text('Nexum 19%: -${CurrencyFormatter.format(commission)}',
                        style: theme.textTheme.labelSmall?.copyWith(color: AppColors.serviceEnvios, fontWeight: FontWeight.w600)),
                  ),
                  const Spacer(),
                  Text(DateFormatter.formatTime(order.createdAt),
                      style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textTertiary)),
                  if (order.hasFullCustody) ...[
                    const SizedBox(width: 6),
                    const Icon(Icons.verified_rounded, size: 14, color: AppColors.success),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  (Color, Color, String) _statusMeta(BusinessOrderStatus status) => switch (status) {
    BusinessOrderStatus.pending => (AppColors.warning, AppColors.warningContainer, 'Conductor en camino'),
    BusinessOrderStatus.atPickup => (AppColors.info, AppColors.infoContainer, 'En el local'),
    BusinessOrderStatus.inTransit => (AppColors.serviceEnvios, AppColors.serviceEnviosContainer, 'En tránsito'),
    BusinessOrderStatus.delivered => (AppColors.success, AppColors.successContainer, 'Entregado'),
  };
}

class _OrdersSkeleton extends StatelessWidget {
  const _OrdersSkeleton();
  @override
  Widget build(BuildContext context) => SkeletonLoader(
    child: Column(children: List.generate(3, (_) => const Padding(
      padding: EdgeInsets.only(bottom: AppConstants.spacingS),
      child: SkeletonBox(height: 100, radius: AppConstants.radiusMedium),
    ))),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  TAB 2 — Menú
// ─────────────────────────────────────────────────────────────────────────────

class _MenuTab extends ConsumerStatefulWidget {
  const _MenuTab({required this.isDark, required this.theme});
  final bool isDark;
  final ThemeData theme;

  @override
  ConsumerState<_MenuTab> createState() => _MenuTabState();
}

class _MenuTabState extends ConsumerState<_MenuTab> {
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final settingsAsync = ref.watch(businessSettingsProvider);
    final productsAsync = ref.watch(businessProductsProvider);
    final isOpen = settingsAsync.valueOrNull?.isOpen ?? true;

    return Column(
      children: [
        // Open/Closed toggle
        Container(
          margin: const EdgeInsets.all(AppConstants.spacingM),
          padding: const EdgeInsets.symmetric(horizontal: AppConstants.spacingM, vertical: 12),
          decoration: BoxDecoration(
            color: isOpen ? AppColors.successContainer.withValues(alpha: 0.5) : AppColors.errorContainer.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
            border: Border.all(color: isOpen ? AppColors.success.withValues(alpha: 0.4) : AppColors.error.withValues(alpha: 0.4)),
          ),
          child: Row(
            children: [
              Icon(isOpen ? Icons.store_rounded : Icons.storefront_outlined,
                  color: isOpen ? AppColors.success : AppColors.error, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(isOpen ? 'Negocio abierto' : 'Negocio cerrado',
                        style: widget.theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700,
                            color: isOpen ? AppColors.success : AppColors.error)),
                    Text(isOpen ? 'Recibiendo pedidos' : 'No estás recibiendo pedidos',
                        style: widget.theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
                  ],
                ),
              ),
              Switch(
                value: isOpen,
                activeColor: AppColors.success,
                inactiveThumbColor: AppColors.error,
                onChanged: (v) => ref.read(businessSettingsProvider.notifier).toggleOpen(v),
              ),
            ],
          ),
        ),

        // Search + add
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppConstants.spacingM),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  onChanged: (v) => setState(() => _search = v.toLowerCase()),
                  decoration: InputDecoration(
                    hintText: 'Buscar producto...',
                    prefixIcon: const Icon(Icons.search_rounded, size: 20),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                      borderSide: BorderSide(color: widget.isDark ? AppColors.outlineDark : AppColors.outlineLight),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: AppConstants.spacingM, vertical: 10),
                  ),
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
              SizedBox(
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: () => context.push('/business-portal/add-product'),
                  icon: const Icon(Icons.add_rounded, size: 20),
                  label: const Text('Agregar'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.serviceEnvios,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppConstants.spacingS),

        // Product list
        Expanded(
          child: productsAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text(e.toString())),
            data: (products) {
              final filtered = _search.isEmpty
                  ? products
                  : products.where((p) => p.name.toLowerCase().contains(_search) || p.category.toLowerCase().contains(_search)).toList();

              // Group by category
              final grouped = <String, List<BusinessProductEntity>>{};
              for (final p in filtered) {
                grouped.putIfAbsent(p.category, () => []).add(p);
              }

              return ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: AppConstants.spacingM),
                itemCount: grouped.length,
                itemBuilder: (_, i) {
                  final category = grouped.keys.elementAt(i);
                  final items = grouped[category]!;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: AppConstants.spacingS),
                        child: Text(category, style: widget.theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.textTertiary, fontWeight: FontWeight.w700, letterSpacing: 1)),
                      ),
                      ...items.map((p) => _ProductTile(product: p, isDark: widget.isDark, theme: widget.theme)),
                    ],
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _ProductTile extends ConsumerWidget {
  const _ProductTile({required this.product, required this.isDark, required this.theme});
  final BusinessProductEntity product;
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Opacity(
      opacity: product.isAvailable ? 1.0 : 0.55,
      child: Container(
      margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(color: isDark ? AppColors.outlineDark : AppColors.outlineLight),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Flexible(child: Text(product.name, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis)),
                  if (product.requiresRx) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(color: AppColors.errorContainer, borderRadius: BorderRadius.circular(8)),
                      child: Text('Rx', style: theme.textTheme.labelSmall?.copyWith(color: AppColors.error, fontWeight: FontWeight.w800, fontSize: 9)),
                    ),
                  ],
                ]),
                if (product.description != null)
                  Text(product.description!, style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Row(children: [
                  Text(CurrencyFormatter.format(product.price),
                      style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700, color: AppColors.serviceEnvios)),
                  if (product.tracksStock) ...[
                    const SizedBox(width: 8),
                    Icon(Icons.inventory_2_outlined, size: 12,
                        color: product.isLowStock ? AppColors.warning : AppColors.textTertiary),
                    const SizedBox(width: 2),
                    Text('${product.stock}',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: product.isLowStock ? AppColors.warning : AppColors.textTertiary,
                          fontWeight: product.isLowStock ? FontWeight.w700 : FontWeight.w400,
                        )),
                  ],
                ]),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Switch(
                value: product.isAvailable,
                activeColor: AppColors.success,
                onChanged: (v) => ref.read(businessProductsProvider.notifier).toggle(product.id, v),
              ),
              Text(product.isAvailable ? 'Disponible' : 'No disponible',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: product.isAvailable ? AppColors.success : AppColors.textTertiary)),
            ],
          ),
        ],
      ),
    ),  // Opacity
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  TAB 3 — Ganancias
// ─────────────────────────────────────────────────────────────────────────────

class _EarningsTab extends ConsumerWidget {
  const _EarningsTab({required this.isDark, required this.theme});
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final period = ref.watch(selectedPeriodProvider);
    final earningsAsync = ref.watch(businessEarningsProvider(period));

    return ListView(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      children: [
        // Period selector
        Row(
          children: EarningsPeriod.values.map((p) {
            final label = switch (p) {
              EarningsPeriod.today => 'Hoy',
              EarningsPeriod.week => 'Semana',
              EarningsPeriod.month => 'Mes',
            };
            final selected = p == period;
            return Padding(
              padding: const EdgeInsets.only(right: AppConstants.spacingS),
              child: ChoiceChip(
                label: Text(label),
                selected: selected,
                selectedColor: AppColors.serviceEnvios,
                labelStyle: theme.textTheme.labelMedium?.copyWith(
                  color: selected ? Colors.white : AppColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
                onSelected: (_) => ref.read(selectedPeriodProvider.notifier).state = p,
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: AppConstants.spacingM),

        earningsAsync.when(
          loading: () => const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),
          error: (e, _) => Text(e.toString()),
          data: (e) => Column(
            children: [
              _EarningsSummaryCard(earnings: e, isDark: isDark, theme: theme),
              const SizedBox(height: AppConstants.spacingM),
              _LiquidationCard(earnings: e, isDark: isDark, theme: theme),
              const SizedBox(height: AppConstants.spacingM),
              _RappiComparisonCard(gross: e.grossRevenue, isDark: isDark, theme: theme),
              const SizedBox(height: AppConstants.spacingM),
              _SectionHeader(label: 'DETALLE POR PEDIDO', count: e.orders.length, theme: theme),
              const SizedBox(height: AppConstants.spacingS),
              ...e.orders.map((o) => _EarningsOrderTile(line: o, isDark: isDark, theme: theme)),
            ],
          ),
        ),
      ],
    );
  }
}

class _EarningsSummaryCard extends StatelessWidget {
  const _EarningsSummaryCard({required this.earnings, required this.isDark, required this.theme});
  final BusinessEarningsEntity earnings;
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(color: isDark ? AppColors.outlineDark : AppColors.outlineLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Text(earnings.periodLabel, style: theme.textTheme.labelMedium?.copyWith(
              color: AppColors.serviceEnvios, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
            const Spacer(),
            Text('${earnings.orderCount} pedidos', style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
          ]),
          const SizedBox(height: AppConstants.spacingM),
          // Gross
          _EarningsRow(
            label: 'Ingresos brutos',
            value: earnings.grossRevenue,
            valueColor: isDark ? AppColors.textOnDark : AppColors.textPrimary,
            theme: theme,
          ),
          // Commission
          _EarningsRow(
            label: 'Comisión Nexum (19%)',
            value: -earnings.commissionDeducted,
            valueColor: AppColors.error,
            theme: theme,
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppConstants.spacingS),
            child: Divider(height: 1),
          ),
          // Net
          Row(children: [
            Text('Tus ganancias netas', style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
            const Spacer(),
            Text(
              CurrencyFormatter.format(earnings.netEarnings),
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.success),
            ),
          ]),
          const SizedBox(height: AppConstants.spacingS),
          // Progress bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: 1 - AppConstants.businessCommissionRate,
              backgroundColor: AppColors.error.withValues(alpha: 0.2),
              color: AppColors.success,
              minHeight: 6,
            ),
          ),
          const SizedBox(height: 4),
          Text('Recibes el ${((1 - AppConstants.businessCommissionRate) * 100).toStringAsFixed(0)}% de cada pedido',
              style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

class _EarningsRow extends StatelessWidget {
  const _EarningsRow({required this.label, required this.value, required this.valueColor, required this.theme});
  final String label;
  final double value;
  final Color valueColor;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(
      children: [
        Text(label, style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
        const Spacer(),
        Text(
          value < 0 ? '-${CurrencyFormatter.format(-value)}' : CurrencyFormatter.format(value),
          style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600, color: valueColor),
        ),
      ],
    ),
  );
}

class _LiquidationCard extends StatelessWidget {
  const _LiquidationCard({required this.earnings, required this.isDark, required this.theme});
  final BusinessEarningsEntity earnings;
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final diff = earnings.nextLiquidationDate.difference(now);
    final days = diff.inDays;
    final label = days == 0
        ? 'Hoy'
        : days == 1
            ? 'Mañana'
            : 'En $days días';

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.serviceEnvios.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(color: AppColors.serviceEnvios.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.account_balance_wallet_rounded, color: AppColors.serviceEnvios, size: 24),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Próxima liquidación', style: theme.textTheme.labelMedium?.copyWith(
                    color: AppColors.serviceEnvios, fontWeight: FontWeight.w700)),
                Text('$label · ${DateFormatter.formatDate(earnings.nextLiquidationDate)}',
                    style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
                Text('Pago semanal cada martes', style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textTertiary)),
              ],
            ),
          ),
          Text(CurrencyFormatter.format(earnings.netEarnings),
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, color: AppColors.serviceEnvios)),
        ],
      ),
    );
  }
}

class _RappiComparisonCard extends StatelessWidget {
  const _RappiComparisonCard({required this.gross, required this.isDark, required this.theme});
  final double gross;
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final rappiRate = 0.27;
    final nexumRate = AppConstants.businessCommissionRate;
    final rappiDeduction = gross * rappiRate;
    final nexumDeduction = gross * nexumRate;
    final saving = rappiDeduction - nexumDeduction;

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.successContainer.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(color: AppColors.success.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Icon(Icons.emoji_events_rounded, color: AppColors.success, size: 18),
            const SizedBox(width: 6),
            Text('Ahorro vs Rappi (27%)', style: theme.textTheme.labelMedium?.copyWith(
                color: AppColors.success, fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: Column(children: [
              Text('Nexum 19%', style: theme.textTheme.labelSmall?.copyWith(color: AppColors.textSecondary)),
              Text('-${CurrencyFormatter.format(nexumDeduction)}',
                  style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700, color: AppColors.success)),
            ])),
            const Text('vs', style: TextStyle(color: AppColors.textTertiary)),
            Expanded(child: Column(children: [
              Text('Rappi 27%', style: theme.textTheme.labelSmall?.copyWith(color: AppColors.textSecondary)),
              Text('-${CurrencyFormatter.format(rappiDeduction)}',
                  style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700, color: AppColors.error)),
            ])),
            Expanded(child: Column(children: [
              Text('Ahorras', style: theme.textTheme.labelSmall?.copyWith(color: AppColors.success)),
              Text(CurrencyFormatter.format(saving),
                  style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.success)),
            ])),
          ]),
        ],
      ),
    );
  }
}

class _EarningsOrderTile extends StatelessWidget {
  const _EarningsOrderTile({required this.line, required this.isDark, required this.theme});
  final OrderEarningLine line;
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
    padding: const EdgeInsets.all(AppConstants.spacingM),
    decoration: BoxDecoration(
      color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      border: Border.all(color: isDark ? AppColors.outlineDark : AppColors.outlineLight),
    ),
    child: Row(
      children: [
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(line.orderRef, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
          if (line.customerName != null)
            Text(line.customerName!, style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
          Text(DateFormatter.formatTime(line.completedAt), style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textTertiary)),
        ]),
        const Spacer(),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(CurrencyFormatter.format(line.grossFare),
              style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary, decoration: TextDecoration.lineThrough)),
          Text('-${CurrencyFormatter.format(line.commissionAmount)}',
              style: theme.textTheme.labelSmall?.copyWith(color: AppColors.error)),
          Text(CurrencyFormatter.format(line.netFare),
              style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700, color: AppColors.success)),
        ]),
      ],
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  TAB 4 — Mi Negocio
// ─────────────────────────────────────────────────────────────────────────────

class _MyBusinessTab extends ConsumerStatefulWidget {
  const _MyBusinessTab({required this.isDark, required this.theme});
  final bool isDark;
  final ThemeData theme;

  @override
  ConsumerState<_MyBusinessTab> createState() => _MyBusinessTabState();
}

class _MyBusinessTabState extends ConsumerState<_MyBusinessTab> {
  @override
  Widget build(BuildContext context) {
    final settingsAsync = ref.watch(businessSettingsProvider);

    return settingsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(e.toString())),
      data: (settings) => ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          // Profile card
          _SettingsCard(isDark: widget.isDark, children: [
            Row(children: [
              Container(
                width: 52, height: 52,
                decoration: BoxDecoration(color: AppColors.serviceEnviosContainer, borderRadius: BorderRadius.circular(AppConstants.radiusMedium)),
                child: const Icon(Icons.restaurant_rounded, color: AppColors.serviceEnvios, size: 28),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(settings.name, style: widget.theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                Text(settings.category, style: widget.theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
                Text(settings.address, style: widget.theme.textTheme.bodySmall?.copyWith(color: AppColors.textTertiary), maxLines: 1, overflow: TextOverflow.ellipsis),
              ])),
            ]),
            const SizedBox(height: AppConstants.spacingM),
            Row(children: [
              const Icon(Icons.star_rounded, color: Colors.amber, size: 16),
              const SizedBox(width: 4),
              Text(settings.rating.toStringAsFixed(1), style: widget.theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(width: 4),
              Text('Calificación promedio', style: widget.theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
            ]),
          ]),

          const SizedBox(height: AppConstants.spacingM),

          // Commission info
          _SettingsCard(isDark: widget.isDark, children: [
            Row(children: [
              const Icon(Icons.percent_rounded, color: AppColors.serviceEnvios, size: 18),
              const SizedBox(width: 8),
              Text('Comisión Nexum', style: widget.theme.textTheme.labelMedium?.copyWith(
                  color: AppColors.serviceEnvios, fontWeight: FontWeight.w700)),
            ]),
            const SizedBox(height: 8),
            _CommissionRow(label: 'Nexum', pct: AppConstants.businessCommissionRate, color: AppColors.success, theme: widget.theme),
            _CommissionRow(label: 'Rappi', pct: 0.27, color: AppColors.error, theme: widget.theme),
            _CommissionRow(label: 'DiDi Food', pct: 0.22, color: AppColors.warning, theme: widget.theme),
            const SizedBox(height: 4),
            Text('Sin cargos ocultos. Sin comisiones en publicidad.',
                style: widget.theme.textTheme.bodySmall?.copyWith(color: AppColors.success, fontWeight: FontWeight.w500)),
          ]),

          const SizedBox(height: AppConstants.spacingM),

          // Prep time
          _SettingsCard(isDark: widget.isDark, children: [
            Row(children: [
              const Icon(Icons.timer_rounded, color: AppColors.serviceEnvios, size: 18),
              const SizedBox(width: 8),
              Text('Tiempo de preparación', style: widget.theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700)),
            ]),
            const SizedBox(height: 8),
            Text('Por defecto al aceptar un pedido', style: widget.theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [10, 15, 20, 30, 45].map((min) {
                final selected = settings.defaultPrepMinutes == min;
                return ChoiceChip(
                  label: Text('$min min'),
                  selected: selected,
                  selectedColor: AppColors.serviceEnvios,
                  labelStyle: widget.theme.textTheme.labelMedium?.copyWith(
                    color: selected ? Colors.white : AppColors.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                  onSelected: (_) => ref.read(businessSettingsProvider.notifier).setPrepMinutes(min),
                );
              }).toList(),
            ),
          ]),

          const SizedBox(height: AppConstants.spacingM),

          // WhatsApp notifications
          _SettingsCard(isDark: widget.isDark, children: [
            Row(children: [
              const Icon(Icons.chat_rounded, color: Color(0xFF25D366), size: 18),
              const SizedBox(width: 8),
              Text('Notificaciones WhatsApp', style: widget.theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700)),
            ]),
            const SizedBox(height: 8),
            Text('Recibes un mensaje al confirmar y entregar cada pedido',
                style: widget.theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
            const SizedBox(height: 8),
            Row(children: [
              const Icon(Icons.phone_rounded, size: 16, color: AppColors.textTertiary),
              const SizedBox(width: 6),
              Text(settings.whatsappNumber, style: widget.theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
              const Spacer(),
              TextButton(onPressed: () {}, child: const Text('Cambiar')),
            ]),
          ]),

          const SizedBox(height: AppConstants.spacingM),

          // Support
          _SettingsCard(isDark: widget.isDark, children: [
            Row(children: [
              const Icon(Icons.headset_mic_rounded, color: AppColors.serviceEnvios, size: 18),
              const SizedBox(width: 8),
              Text('Soporte Nexum', style: widget.theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700)),
            ]),
            const SizedBox(height: 8),
            Text('Soporte local en Pamplona — Norte de Santander',
                style: widget.theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.chat_rounded, size: 16, color: Color(0xFF25D366)),
              label: const Text('Contactar por WhatsApp'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF25D366),
                side: const BorderSide(color: Color(0xFF25D366)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppConstants.radiusMedium)),
              ),
            ),
          ]),

          const SizedBox(height: AppConstants.spacingM),
          OutlinedButton.icon(
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go(AppRoutes.login);
            },
            icon: const Icon(Icons.logout_rounded, size: 16),
            label: const Text('Cerrar sesión'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.error,
              side: const BorderSide(color: AppColors.error),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppConstants.radiusMedium)),
            ),
          ),
        ],
      ),
    );
  }
}

class _CommissionRow extends StatelessWidget {
  const _CommissionRow({required this.label, required this.pct, required this.color, required this.theme});
  final String label;
  final double pct;
  final Color color;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Row(children: [
      SizedBox(width: 80, child: Text(label, style: theme.textTheme.bodySmall)),
      Expanded(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: pct,
            backgroundColor: color.withValues(alpha: 0.12),
            color: color,
            minHeight: 8,
          ),
        ),
      ),
      const SizedBox(width: 8),
      Text('${(pct * 100).toStringAsFixed(0)}%', style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700, color: color)),
    ]),
  );
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.isDark, required this.children});
  final bool isDark;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(AppConstants.spacingM),
    decoration: BoxDecoration(
      color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      border: Border.all(color: isDark ? AppColors.outlineDark : AppColors.outlineLight),
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message, required this.theme, required this.isDark});
  final String message;
  final ThemeData theme;
  final bool isDark;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(AppConstants.spacingM),
    decoration: BoxDecoration(
      color: AppColors.errorContainer.withValues(alpha: 0.3),
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
    ),
    child: Text(message, style: theme.textTheme.bodySmall?.copyWith(color: AppColors.error)),
  );
}
