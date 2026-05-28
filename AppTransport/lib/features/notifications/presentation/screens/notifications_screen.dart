import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/notifications/presentation/providers/notification_provider.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationProvider);
    final notifier = ref.read(notificationProvider.notifier);
    final unread = notifier.unreadCount;
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notificaciones'),
        actions: [
          if (unread > 0)
            TextButton(
              onPressed: notifier.markAllAsRead,
              child: const Text('Marcar todas'),
            ),
          if (notifications.isNotEmpty)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert_rounded),
              onSelected: (v) {
                if (v == 'clear') notifier.clearAll();
              },
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'clear',
                  child: Text('Borrar todas'),
                ),
              ],
            ),
        ],
      ),
      body: notifications.isEmpty
          ? _EmptyState()
          : _GroupedList(notifications: notifications, theme: theme),
    );
  }
}

// ── Grouped list ───────────────────────────────────────────────────────────────

class _GroupedList extends ConsumerWidget {
  const _GroupedList({required this.notifications, required this.theme});
  final List<AppNotification> notifications;
  final ThemeData theme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groups = _group(notifications);

    return ListView(
      padding: const EdgeInsets.only(bottom: AppConstants.spacingXL),
      children: [
        for (final group in groups) ...[
          _GroupHeader(label: group.label),
          for (final n in group.items)
            _NotifTile(
              notification: n,
              onDismiss: () =>
                  ref.read(notificationProvider.notifier).remove(n.id),
              onTap: () =>
                  ref.read(notificationProvider.notifier).markAsRead(n.id),
            ),
        ],
      ],
    );
  }

  List<_Group> _group(List<AppNotification> items) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final weekAgo = today.subtract(const Duration(days: 7));

    final todayItems =
        items.where((n) => _dayOf(n.timestamp) == today).toList();
    final yesterdayItems =
        items.where((n) => _dayOf(n.timestamp) == yesterday).toList();
    final weekItems = items
        .where((n) =>
            _dayOf(n.timestamp).isAfter(weekAgo) &&
            _dayOf(n.timestamp) != today &&
            _dayOf(n.timestamp) != yesterday)
        .toList();
    final olderItems = items
        .where((n) => !_dayOf(n.timestamp).isAfter(weekAgo))
        .toList();

    return [
      if (todayItems.isNotEmpty) _Group('Hoy', todayItems),
      if (yesterdayItems.isNotEmpty) _Group('Ayer', yesterdayItems),
      if (weekItems.isNotEmpty) _Group('Esta semana', weekItems),
      if (olderItems.isNotEmpty) _Group('Anteriores', olderItems),
    ];
  }

  DateTime _dayOf(DateTime dt) => DateTime(dt.year, dt.month, dt.day);
}

class _Group {
  const _Group(this.label, this.items);
  final String label;
  final List<AppNotification> items;
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppConstants.spacingM,
        AppConstants.spacingM,
        AppConstants.spacingM,
        AppConstants.spacingXS,
      ),
      child: Text(
        label.toUpperCase(),
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AppColors.textSecondary,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
      ),
    );
  }
}

// ── Notification tile ──────────────────────────────────────────────────────────

class _NotifTile extends StatelessWidget {
  const _NotifTile({
    required this.notification,
    required this.onDismiss,
    required this.onTap,
  });

  final AppNotification notification;
  final VoidCallback onDismiss;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final (iconData, iconColor, iconBg) = _iconStyle(notification.type);

    return Dismissible(
      key: ValueKey(notification.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding:
            const EdgeInsets.only(right: AppConstants.spacingL),
        color: AppColors.error,
        child: const Icon(Icons.delete_outline_rounded, color: Colors.white),
      ),
      onDismissed: (_) => onDismiss(),
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            color: notification.isRead
                ? Colors.transparent
                : (isDark
                    ? AppColors.secondaryContainer.withValues(alpha: 0.08)
                    : AppColors.secondaryContainer.withValues(alpha: 0.4)),
            border: Border(
              bottom: BorderSide(
                color:
                    isDark ? AppColors.outlineDark : AppColors.outlineLight,
                width: 0.5,
              ),
            ),
          ),
          padding: const EdgeInsets.symmetric(
            horizontal: AppConstants.spacingM,
            vertical: AppConstants.spacingM,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: iconBg,
                  shape: BoxShape.circle,
                ),
                child: Icon(iconData, color: iconColor, size: 20),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            notification.title,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: notification.isRead
                                  ? FontWeight.w500
                                  : FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(width: AppConstants.spacingS),
                        Text(
                          _formatTime(notification.timestamp),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.textTertiary,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      notification.body,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              if (!notification.isRead) ...[
                const SizedBox(width: AppConstants.spacingS),
                Container(
                  width: 8,
                  height: 8,
                  margin: const EdgeInsets.only(top: 6),
                  decoration: const BoxDecoration(
                    color: AppColors.info,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  (IconData, Color, Color) _iconStyle(NotificationType type) =>
      switch (type) {
        NotificationType.trip => (
            Icons.directions_car_rounded,
            AppColors.primary,
            AppColors.primaryContainer,
          ),
        NotificationType.payment => (
            Icons.account_balance_wallet_rounded,
            AppColors.success,
            AppColors.successContainer,
          ),
        NotificationType.document => (
            Icons.description_rounded,
            AppColors.warning,
            AppColors.warningContainer,
          ),
        NotificationType.promo => (
            Icons.card_giftcard_rounded,
            AppColors.serviceParticular,
            AppColors.serviceParticularContainer,
          ),
        NotificationType.system => (
            Icons.system_update_rounded,
            AppColors.info,
            AppColors.infoContainer,
          ),
        NotificationType.rating => (
            Icons.star_rounded,
            AppColors.star,
            AppColors.starContainer,
          ),
      };

  String _formatTime(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);

    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes}m';
    if (diff.inHours < 24) return 'hace ${diff.inHours}h';
    if (diff.inDays == 1) return 'ayer';
    if (diff.inDays < 7) return 'hace ${diff.inDays}d';
    return '${dt.day}/${dt.month}';
  }
}

// ── Empty state ────────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: AppColors.surfaceVariantLight,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.notifications_off_outlined,
              size: 40,
              color: AppColors.textTertiary,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          Text(
            'Sin notificaciones',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: AppConstants.spacingS),
          const Text(
            'Aquí aparecerán tus alertas de\nviajes, pagos y documentos.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}
