import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/theme_provider.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';

/// Pestaña "Cuenta": perfil del cliente y preferencias.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeNotifier = ref.read(themeProvider.notifier);
    final isDark = ref.watch(themeProvider) == ThemeMode.dark;

    return Scaffold(
      appBar: AppBar(title: const Text('Mi cuenta')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          const _ProfileHeader(),
          const SizedBox(height: AppConstants.spacingL),
          _SettingsGroup(
            children: [
              _SettingTile(
                icon: Icons.location_on_rounded,
                title: 'Mis direcciones',
                subtitle: 'Calle 6 #2-30, Barrio Belén',
                onTap: () => AppSnackbar.showInfo(
                  context,
                  'Gestión de direcciones próximamente',
                ),
              ),
              _SettingTile(
                icon: Icons.account_balance_wallet_rounded,
                title: 'Métodos de pago',
                subtitle: 'Efectivo, tarjeta, Nequi',
                onTap: () => AppSnackbar.showInfo(
                  context,
                  'Métodos de pago próximamente',
                ),
              ),
              _DarkModeTile(
                isDark: isDark,
                onChanged: (v) => themeNotifier.setDark(dark: v),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),
          _SettingsGroup(
            children: [
              _SettingTile(
                icon: Icons.help_outline_rounded,
                title: 'Ayuda y soporte',
                onTap: () => AppSnackbar.showInfo(
                  context,
                  'Centro de ayuda próximamente',
                ),
              ),
              _SettingTile(
                icon: Icons.info_outline_rounded,
                title: 'Acerca de Nexum',
                subtitle: 'Versión ${AppConstants.appVersion}',
                onTap: () => AppSnackbar.showInfo(
                  context,
                  'Nexum — Domicilios con cadena de custodia',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader();

  @override
  Widget build(BuildContext context) {
    return const Row(
      children: [
        CircleAvatar(
          radius: 32,
          backgroundColor: AppColors.primaryContainer,
          child: Icon(
            Icons.person_rounded,
            size: 34,
            color: AppColors.primaryDim,
          ),
        ),
        SizedBox(width: AppConstants.spacingM),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Cliente Nexum',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: 2),
            Text(
              '+57 312 456 7890',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 14,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _SettingsGroup extends StatelessWidget {
  const _SettingsGroup({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.cardDark : AppColors.cardLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
        ),
      ),
      child: Column(children: children),
    );
  }
}

class _SettingTile extends StatelessWidget {
  const _SettingTile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      leading: Icon(icon, color: AppColors.primary),
      title: Text(
        title,
        style: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: subtitle == null
          ? null
          : Text(
              subtitle!,
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 13,
                color: AppColors.textSecondary,
              ),
            ),
      trailing: const Icon(
        Icons.chevron_right_rounded,
        color: AppColors.textTertiary,
      ),
    );
  }
}

class _DarkModeTile extends StatelessWidget {
  const _DarkModeTile({required this.isDark, required this.onChanged});

  final bool isDark;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      value: isDark,
      onChanged: onChanged,
      secondary: const Icon(
        Icons.dark_mode_rounded,
        color: AppColors.primary,
      ),
      title: const Text(
        'Modo oscuro',
        style: TextStyle(
          fontFamily: 'Inter',
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
