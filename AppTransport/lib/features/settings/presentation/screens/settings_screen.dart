import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/auth/presentation/providers/auth_provider.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _notificationsEnabled = true;
  bool _soundEnabled = true;
  bool _vibrationEnabled = true;
  bool _darkModeEnabled = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Configuración')),
      body: ListView(
        children: [
          _SectionHeader(title: 'Notificaciones'),
          _SettingsTile(
            icon: Icons.notifications_rounded,
            iconColor: AppColors.info,
            title: 'Notificaciones push',
            subtitle: 'Recibir alertas de solicitudes',
            trailing: Switch(
              value: _notificationsEnabled,
              onChanged: (v) => setState(() => _notificationsEnabled = v),
            ),
          ),
          _SettingsTile(
            icon: Icons.volume_up_rounded,
            iconColor: AppColors.warning,
            title: 'Sonidos',
            subtitle: 'Alertas sonoras de viajes',
            trailing: Switch(
              value: _soundEnabled,
              onChanged: (v) => setState(() => _soundEnabled = v),
            ),
          ),
          _SettingsTile(
            icon: Icons.vibration_rounded,
            iconColor: AppColors.secondary,
            title: 'Vibración',
            subtitle: 'Vibrar al recibir solicitud',
            trailing: Switch(
              value: _vibrationEnabled,
              onChanged: (v) => setState(() => _vibrationEnabled = v),
            ),
          ),
          const Divider(),
          _SectionHeader(title: 'Apariencia'),
          _SettingsTile(
            icon: Icons.dark_mode_rounded,
            iconColor: const Color(0xFF6366F1),
            title: 'Modo oscuro',
            subtitle: 'Cambia el tema de la aplicación',
            trailing: Switch(
              value: _darkModeEnabled,
              onChanged: (v) => setState(() => _darkModeEnabled = v),
            ),
          ),
          const Divider(),
          _SectionHeader(title: 'Navegación'),
          _SettingsTile(
            icon: Icons.map_rounded,
            iconColor: AppColors.primary,
            title: 'Aplicación de mapas',
            subtitle: 'Google Maps',
            trailing: const Icon(Icons.chevron_right_rounded,
                color: AppColors.textSecondary),
            onTap: () => _showComingSoon(context),
          ),
          const Divider(),
          _SectionHeader(title: 'Cuenta'),
          _SettingsTile(
            icon: Icons.lock_outline_rounded,
            iconColor: AppColors.textSecondary,
            title: 'Privacidad y seguridad',
            trailing: const Icon(Icons.chevron_right_rounded,
                color: AppColors.textSecondary),
            onTap: () => _showComingSoon(context),
          ),
          _SettingsTile(
            icon: Icons.info_outline_rounded,
            iconColor: AppColors.info,
            title: 'Versión de la app',
            subtitle: AppConstants.appVersion,
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.all(AppConstants.spacingM),
            child: OutlinedButton.icon(
              onPressed: () => _confirmLogout(context),
              icon: const Icon(Icons.logout_rounded, color: AppColors.error),
              label: const Text(
                'Cerrar sesión',
                style: TextStyle(color: AppColors.error),
              ),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AppColors.error),
                minimumSize: const Size.fromHeight(AppConstants.minTouchTarget),
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingL),
        ],
      ),
    );
  }

  void _showComingSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Próximamente disponible')),
    );
  }

  void _confirmLogout(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cerrar sesión'),
        content:
            const Text('¿Estás seguro de que deseas cerrar tu sesión?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go(AppRoutes.login);
            },
            style:
                ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Cerrar sesión'),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

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
        title.toUpperCase(),
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AppColors.textSecondary,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.icon,
    required this.iconColor,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListTile(
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: iconColor.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
        ),
        child: Icon(icon, color: iconColor, size: 18),
      ),
      title: Text(title, style: theme.textTheme.bodyMedium),
      subtitle: subtitle != null
          ? Text(
              subtitle!,
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: AppColors.textSecondary),
            )
          : null,
      trailing: trailing,
      onTap: onTap,
    );
  }
}
