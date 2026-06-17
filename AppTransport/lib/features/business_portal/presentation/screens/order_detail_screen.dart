import 'dart:io';

import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/date_formatter.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/'
    'business_order_entity.dart';

class OrderDetailScreen extends StatelessWidget {
  const OrderDetailScreen({required this.order, super.key});

  final BusinessOrderEntity order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark
          ? AppColors.backgroundDark
          : AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor:
            isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        elevation: 0,
        title: Text(
          'Pedido ${order.orderRef}',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: [
          if (order.isDelivered)
            Padding(
              padding: const EdgeInsets.only(right: AppConstants.spacingM),
              child: _CustodyBadgeLarge(
                full: order.hasFullCustody,
                theme: theme,
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          _OrderHeaderCard(
            order: order,
            isDark: isDark,
            theme: theme,
          ),
          const SizedBox(height: AppConstants.spacingM),
          _ChainOfCustodyCard(
            order: order,
            isDark: isDark,
            theme: theme,
          ),
          const SizedBox(height: AppConstants.spacingM),
          _DriverCard(order: order, isDark: isDark, theme: theme),
          const SizedBox(height: AppConstants.spacingM),
          if (!order.isDelivered)
            _TrackingCard(order: order, theme: theme),
        ],
      ),
    );
  }
}

// ── Order header ─────────────────────────────────────────────────────────────

class _OrderHeaderCard extends StatelessWidget {
  const _OrderHeaderCard({
    required this.order,
    required this.isDark,
    required this.theme,
  });

  final BusinessOrderEntity order;
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return _Card(
      isDark: isDark,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.receipt_long_rounded,
                size: 16,
                color: AppColors.serviceEnvios,
              ),
              const SizedBox(width: 6),
              Text(
                'Información del pedido',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: AppColors.serviceEnvios,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),
          _InfoRow(
            icon: Icons.person_rounded,
            label: 'Cliente',
            value: order.customerName,
            theme: theme,
          ),
          _InfoRow(
            icon: Icons.location_on_rounded,
            label: 'Dirección',
            value: order.customerAddress,
            theme: theme,
          ),
          _InfoRow(
            icon: Icons.access_time_rounded,
            label: 'Pedido a las',
            value: DateFormatter.formatTime(order.createdAt),
            theme: theme,
          ),
          _InfoRow(
            icon: Icons.monetization_on_rounded,
            label: 'Valor',
            value: CurrencyFormatter.format(order.grossFare),
            valueColor: AppColors.serviceEnvios,
            theme: theme,
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.theme,
    this.valueColor,
  });

  final IconData icon;
  final String label;
  final String value;
  final ThemeData theme;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: AppColors.textTertiary),
          const SizedBox(width: 8),
          SizedBox(
            width: 80,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textTertiary,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w500,
                color: valueColor,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Chain of custody ─────────────────────────────────────────────────────────

class _ChainOfCustodyCard extends StatelessWidget {
  const _ChainOfCustodyCard({
    required this.order,
    required this.isDark,
    required this.theme,
  });

  final BusinessOrderEntity order;
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return _Card(
      isDark: isDark,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.verified_user_rounded,
                size: 16,
                color: AppColors.serviceEnvios,
              ),
              const SizedBox(width: 6),
              Text(
                'Cadena de custodia',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: AppColors.serviceEnvios,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
              const Spacer(),
              if (order.isDelivered)
                _CustodyBadgeLarge(
                  full: order.hasFullCustody,
                  theme: theme,
                ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),

          // ── Step 1: pickup ───────────────────────────────────────────
          _CustodyStep(
            done: order.pickedUpAt != null,
            isLast: false,
            icon: Icons.storefront_rounded,
            iconColor: AppColors.serviceEnvios,
            title: 'Recogido en el local',
            subtitle: order.pickedUpAt != null
                ? 'a las ${DateFormatter.formatTime(order.pickedUpAt!)}'
                : 'Pendiente de recogida',
            theme: theme,
            isDark: isDark,
            photoPath: order.pickupPhotoPath,
            extraChip: order.pickupPhotoPath != null
                ? null
                : (order.pickedUpAt != null
                    ? _NoPhotoChip(theme: theme)
                    : null),
          ),

          // ── Step 2: delivery ─────────────────────────────────────────
          _CustodyStep(
            done: order.isDelivered,
            isLast: true,
            icon: Icons.home_rounded,
            iconColor: order.isDelivered
                ? AppColors.success
                : AppColors.textTertiary,
            title: 'Entregado al cliente',
            subtitle: order.deliveredAt != null
                ? 'a las ${DateFormatter.formatTime(order.deliveredAt!)}'
                : 'Pendiente de entrega',
            theme: theme,
            isDark: isDark,
            photoPath: order.deliveryPhotoPath,
            extraChip: order.hasSignature
                ? _SignatureChip(theme: theme)
                : null,
          ),
        ],
      ),
    );
  }
}

class _CustodyStep extends StatelessWidget {
  const _CustodyStep({
    required this.done,
    required this.isLast,
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.theme,
    required this.isDark,
    this.photoPath,
    this.extraChip,
  });

  final bool done;
  final bool isLast;
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final ThemeData theme;
  final bool isDark;
  final String? photoPath;
  final Widget? extraChip;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Timeline node ──────────────────────────────────────────
          Column(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: done
                      ? iconColor.withValues(alpha: 0.15)
                      : (isDark
                          ? AppColors.surfaceVariantDark
                          : AppColors.surfaceVariantLight),
                  border: Border.all(
                    color: done ? iconColor : AppColors.textTertiary,
                    width: 1.5,
                  ),
                ),
                child: Icon(icon, size: 18, color: iconColor),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    color: done
                        ? AppColors.success.withValues(alpha: 0.4)
                        : (isDark
                            ? AppColors.outlineDark
                            : AppColors.outlineLight),
                  ),
                ),
            ],
          ),
          const SizedBox(width: AppConstants.spacingM),

          // ── Content ────────────────────────────────────────────────
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(
                bottom: isLast ? 0 : AppConstants.spacingL,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: done
                          ? AppColors.textSecondary
                          : AppColors.textTertiary,
                    ),
                  ),
                  if (photoPath != null || extraChip != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        if (photoPath != null)
                          _PhotoThumb(path: photoPath!),
                        if (extraChip != null) ...[
                          if (photoPath != null)
                            const SizedBox(width: 8),
                          extraChip!,
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PhotoThumb extends StatelessWidget {
  const _PhotoThumb({required this.path});

  final String path;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image(
            image: (kIsWeb ? NetworkImage(path) : FileImage(File(path)))
                as ImageProvider,
            width: 64,
            height: 64,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppColors.serviceEnviosContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.photo_camera_rounded,
                color: AppColors.serviceEnvios,
                size: 28,
              ),
            ),
          ),
        ),
        Positioned(
          bottom: 2,
          right: 2,
          child: Container(
            width: 16,
            height: 16,
            decoration: const BoxDecoration(
              color: AppColors.success,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check,
              size: 10,
              color: Colors.white,
            ),
          ),
        ),
      ],
    );
  }
}

class _SignatureChip extends StatelessWidget {
  const _SignatureChip({required this.theme});

  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.successContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.draw_rounded,
            size: 12,
            color: AppColors.success,
          ),
          const SizedBox(width: 4),
          Text(
            'Firmado',
            style: theme.textTheme.labelSmall?.copyWith(
              color: AppColors.success,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _NoPhotoChip extends StatelessWidget {
  const _NoPhotoChip({required this.theme});

  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.warningContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.warning_amber_rounded,
            size: 12,
            color: AppColors.warning,
          ),
          const SizedBox(width: 4),
          Text(
            'Sin foto de recogida',
            style: theme.textTheme.labelSmall?.copyWith(
              color: AppColors.warning,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Driver card ──────────────────────────────────────────────────────────────

class _DriverCard extends StatelessWidget {
  const _DriverCard({
    required this.order,
    required this.isDark,
    required this.theme,
  });

  final BusinessOrderEntity order;
  final bool isDark;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    if (order.driverName == null) return const SizedBox.shrink();

    return _Card(
      isDark: isDark,
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              color: AppColors.serviceEnviosContainer,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.delivery_dining_rounded,
              color: AppColors.serviceEnvios,
              size: 22,
            ),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.driverName!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (order.driverPhone != null)
                  Text(
                    order.driverPhone!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
              ],
            ),
          ),
          if (order.driverPhone != null)
            IconButton(
              onPressed: () {},
              icon: const Icon(
                Icons.phone_rounded,
                color: AppColors.serviceEnvios,
              ),
              tooltip: 'Llamar al conductor',
            ),
        ],
      ),
    );
  }
}

// ── Tracking card (active orders) ────────────────────────────────────────────

class _TrackingCard extends StatelessWidget {
  const _TrackingCard({
    required this.order,
    required this.theme,
  });

  final BusinessOrderEntity order;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final (icon, color, message) = _meta(order.status);

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: color,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  (IconData, Color, String) _meta(BusinessOrderStatus status) {
    switch (status) {
      case BusinessOrderStatus.pending:
        return (
          Icons.directions_bike_rounded,
          AppColors.warning,
          'El conductor está en camino al local a recoger el pedido.',
        );
      case BusinessOrderStatus.atPickup:
        return (
          Icons.storefront_rounded,
          AppColors.info,
          'El conductor llegó al local. Pronto fotograciará el pedido.',
        );
      case BusinessOrderStatus.inTransit:
        return (
          Icons.local_shipping_rounded,
          AppColors.serviceEnvios,
          'Pedido recogido y en camino al cliente. '
              'La foto de recogida ya está registrada.',
        );
      case BusinessOrderStatus.delivered:
        return (
          Icons.check_circle_rounded,
          AppColors.success,
          'Pedido entregado.',
        );
    }
  }
}

// ── Shared card shell ────────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  const _Card({required this.isDark, required this.child});

  final bool isDark;
  final Widget child;

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
      child: child,
    );
  }
}

// ── Custody badge (large) ────────────────────────────────────────────────────

class _CustodyBadgeLarge extends StatelessWidget {
  const _CustodyBadgeLarge({
    required this.full,
    required this.theme,
  });

  final bool full;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: full
            ? AppColors.successContainer
            : AppColors.warningContainer,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            full
                ? Icons.verified_rounded
                : Icons.warning_amber_rounded,
            size: 14,
            color: full ? AppColors.success : AppColors.warning,
          ),
          const SizedBox(width: 4),
          Text(
            full ? 'Verificada' : 'Cadena parcial',
            style: theme.textTheme.labelMedium?.copyWith(
              color: full ? AppColors.success : AppColors.warning,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
