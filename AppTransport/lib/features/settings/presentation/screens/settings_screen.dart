import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/app/theme/theme_provider.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/auth/presentation/providers/auth_provider.dart';
import 'package:nexum_driver/features/profile_verification/presentation/providers/driver_profile_provider.dart';

enum _MapApp { googleMaps, waze, mapsDotMe, system }

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _notificationsEnabled = true;
  bool _soundEnabled = true;
  bool _vibrationEnabled = true;
  bool _promoNotifications = false;
  bool _wifiOnly = false;
  _MapApp _selectedMapApp = _MapApp.googleMaps;

  // Simulated cache size in MB
  double _cacheMb = 24.3;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Configuración')),
      body: ListView(
        children: [
          _buildDriverCard(theme),
          const SizedBox(height: AppConstants.spacingS),
          _SectionHeader(title: 'Notificaciones'),
          _SettingsTile(
            icon: Icons.notifications_rounded,
            iconColor: AppColors.info,
            title: 'Notificaciones push',
            subtitle: 'Alertas de solicitudes de viaje',
            trailing: Switch(
              value: _notificationsEnabled,
              onChanged: (v) => setState(() => _notificationsEnabled = v),
            ),
          ),
          _SettingsTile(
            icon: Icons.volume_up_rounded,
            iconColor: AppColors.warning,
            title: 'Sonidos',
            subtitle: 'Alertas sonoras al recibir viaje',
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
          _SettingsTile(
            icon: Icons.campaign_rounded,
            iconColor: AppColors.serviceTaxi,
            title: 'Notificaciones promocionales',
            subtitle: 'Bonos, incentivos y ofertas',
            trailing: Switch(
              value: _promoNotifications,
              onChanged: (v) => setState(() => _promoNotifications = v),
            ),
          ),
          const Divider(),
          _SectionHeader(title: 'Apariencia'),
          _SettingsTile(
            icon: Icons.dark_mode_rounded,
            iconColor: const Color(0xFF6366F1),
            title: 'Modo oscuro',
            subtitle: 'Tema oscuro en toda la app',
            trailing: Switch(
              value: ref.watch(themeProvider) == ThemeMode.dark,
              onChanged: (v) =>
                  ref.read(themeProvider.notifier).setDark(dark: v),
            ),
          ),
          const Divider(),
          _SectionHeader(title: 'Navegación'),
          _SettingsTile(
            icon: Icons.map_rounded,
            iconColor: AppColors.primary,
            title: 'Aplicación de mapas',
            subtitle: _mapAppLabel(_selectedMapApp),
            trailing: Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
            onTap: _showMapPickerSheet,
          ),
          const Divider(),
          _SectionHeader(title: 'Seguridad'),
          _SettingsTile(
            icon: Icons.lock_outline_rounded,
            iconColor: AppColors.error,
            title: 'Cambiar PIN de seguridad',
            subtitle: 'Actualiza tu PIN de acceso',
            trailing: Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
            onTap: _showChangePinSheet,
          ),
          _SettingsTile(
            icon: Icons.privacy_tip_outlined,
            iconColor: context.textSecondaryColor,
            title: 'Privacidad de datos',
            subtitle: 'Gestiona tus datos personales',
            trailing: Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
            onTap: () => _showComingSoon('Privacidad de datos'),
          ),
          const Divider(),
          _SectionHeader(title: 'Datos y almacenamiento'),
          _SettingsTile(
            icon: Icons.wifi_rounded,
            iconColor: AppColors.info,
            title: 'Solo usar datos en WiFi',
            subtitle: 'No consumir datos móviles para el mapa',
            trailing: Switch(
              value: _wifiOnly,
              onChanged: (v) => setState(() => _wifiOnly = v),
            ),
          ),
          _SettingsTile(
            icon: Icons.cleaning_services_rounded,
            iconColor: AppColors.serviceEnvios,
            title: 'Limpiar caché',
            subtitle:
                '${_cacheMb.toStringAsFixed(1)} MB almacenados',
            trailing: Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
            onTap: _clearCache,
          ),
          const Divider(),
          _SectionHeader(title: 'Acerca de'),
          _SettingsTile(
            icon: Icons.info_outline_rounded,
            iconColor: AppColors.info,
            title: 'Versión de la app',
            subtitle:
                '${AppConstants.appName} ${AppConstants.appVersion} (build 42)',
          ),
          _SettingsTile(
            icon: Icons.description_outlined,
            iconColor: context.textSecondaryColor,
            title: 'Términos de servicio',
            trailing: Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
            onTap: () => _showComingSoon('Términos de servicio'),
          ),
          _SettingsTile(
            icon: Icons.shield_outlined,
            iconColor: context.textSecondaryColor,
            title: 'Política de privacidad',
            trailing: Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
            onTap: () => _showComingSoon('Política de privacidad'),
          ),
          _SettingsTile(
            icon: Icons.star_outline_rounded,
            iconColor: AppColors.star,
            title: 'Calificar la app',
            subtitle: 'Comparte tu opinión en la tienda',
            trailing: Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
            onTap: () => _showComingSoon('Calificar la app'),
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

  Widget _buildDriverCard(ThemeData theme) {
    final isDark = theme.brightness == Brightness.dark;
    // Identidad real del backend; encabezado neutro mientras carga.
    final profile = ref.watch(driverProfileProvider).profile;
    final name = profile?.fullName.trim();
    final initials = (name == null || name.isEmpty)
        ? '·'
        : name
            .split(RegExp(r'\s+'))
            .take(2)
            .map((w) => w[0].toUpperCase())
            .join();

    return GestureDetector(
      // push (no go): conserva el historial para poder volver atrás.
      onTap: () => context.push(AppRoutes.profile),
      child: Container(
        margin: const EdgeInsets.all(AppConstants.spacingM),
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
            CircleAvatar(
              radius: 28,
              backgroundColor: AppColors.primaryContainer,
              child: Text(
                initials,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primaryDim,
                ),
              ),
            ),
            const SizedBox(width: AppConstants.spacingM),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name ?? 'Tu perfil',
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    profile?.phone ?? 'Completa tu registro',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: context.textSecondaryColor),
                  ),
                  if (profile != null) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(Icons.star_rounded,
                            size: 14, color: AppColors.star),
                        const SizedBox(width: 2),
                        Text(
                          profile.rating.toStringAsFixed(2),
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: context.textSecondaryColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
          ],
        ),
      ),
    );
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  void _showMapPickerSheet() {
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppConstants.radiusXLarge)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: const EdgeInsets.fromLTRB(
            AppConstants.spacingM,
            AppConstants.spacingL,
            AppConstants.spacingM,
            AppConstants.spacingXL,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppConstants.spacingS),
                child: Text(
                  'Aplicación de mapas',
                  style: Theme.of(ctx)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: AppConstants.spacingM),
              ..._MapApp.values.map(
                (app) => RadioListTile<_MapApp>(
                  value: app,
                  groupValue: _selectedMapApp,
                  title: Text(_mapAppLabel(app)),
                  secondary: Icon(_mapAppIcon(app),
                      color: AppColors.primary, size: 22),
                  activeColor: AppColors.primary,
                  onChanged: (v) {
                    if (v == null) return;
                    setSheet(() {});
                    setState(() => _selectedMapApp = v);
                    Navigator.of(ctx).pop();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content: Text(
                              '${_mapAppLabel(v)} seleccionado como app de mapas')),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showChangePinSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppConstants.radiusXLarge)),
      ),
      builder: (ctx) => _ChangePinSheet(
        onChanged: () => ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('PIN actualizado correctamente'),
            backgroundColor: AppColors.success,
          ),
        ),
      ),
    );
  }

  void _clearCache() {
    if (_cacheMb == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('La caché ya está limpia')),
      );
      return;
    }
    final cleared = _cacheMb;
    setState(() => _cacheMb = 0);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
            '${cleared.toStringAsFixed(1)} MB eliminados correctamente'),
      ),
    );
  }

  void _showComingSoon(String feature) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$feature — próximamente disponible')),
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
            style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.error,
                foregroundColor: Colors.white),
            child: const Text('Cerrar sesión'),
          ),
        ],
      ),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  String _mapAppLabel(_MapApp app) => switch (app) {
        _MapApp.googleMaps => 'Google Maps',
        _MapApp.waze => 'Waze',
        _MapApp.mapsDotMe => 'Maps.me',
        _MapApp.system => 'Predeterminada del sistema',
      };

  IconData _mapAppIcon(_MapApp app) => switch (app) {
        _MapApp.googleMaps => Icons.map_rounded,
        _MapApp.waze => Icons.navigation_rounded,
        _MapApp.mapsDotMe => Icons.explore_rounded,
        _MapApp.system => Icons.phone_android_rounded,
      };
}

// ── Change PIN sheet ───────────────────────────────────────────────────────────

class _ChangePinSheet extends StatefulWidget {
  const _ChangePinSheet({required this.onChanged});
  final VoidCallback onChanged;

  @override
  State<_ChangePinSheet> createState() => _ChangePinSheetState();
}

class _ChangePinSheetState extends State<_ChangePinSheet> {
  final _formKey = GlobalKey<FormState>();
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureConfirm = true;

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.of(context).pop();
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppConstants.spacingL,
        AppConstants.spacingL,
        AppConstants.spacingL,
        MediaQuery.of(context).viewInsets.bottom + AppConstants.spacingL,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'Cambiar PIN',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingM),
            TextFormField(
              controller: _currentCtrl,
              decoration: InputDecoration(
                labelText: 'PIN actual',
                prefixIcon: const Icon(Icons.lock_outline_rounded),
                suffixIcon: IconButton(
                  icon: Icon(_obscureCurrent
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined),
                  onPressed: () =>
                      setState(() => _obscureCurrent = !_obscureCurrent),
                ),
              ),
              obscureText: _obscureCurrent,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(4),
              ],
              validator: (v) {
                if (v == null || v.length < 4) return 'El PIN debe tener 4 dígitos';
                if (v != '1234') return 'PIN incorrecto';
                return null;
              },
            ),
            const SizedBox(height: AppConstants.spacingM),
            TextFormField(
              controller: _newCtrl,
              decoration: InputDecoration(
                labelText: 'Nuevo PIN',
                prefixIcon: const Icon(Icons.lock_rounded),
                suffixIcon: IconButton(
                  icon: Icon(_obscureNew
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined),
                  onPressed: () =>
                      setState(() => _obscureNew = !_obscureNew),
                ),
              ),
              obscureText: _obscureNew,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(4),
              ],
              validator: (v) {
                if (v == null || v.length < 4) return 'El PIN debe tener 4 dígitos';
                if (v == _currentCtrl.text) {
                  return 'El nuevo PIN no puede ser igual al actual';
                }
                return null;
              },
            ),
            const SizedBox(height: AppConstants.spacingM),
            TextFormField(
              controller: _confirmCtrl,
              decoration: InputDecoration(
                labelText: 'Confirmar nuevo PIN',
                prefixIcon: const Icon(Icons.lock_rounded),
                suffixIcon: IconButton(
                  icon: Icon(_obscureConfirm
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined),
                  onPressed: () =>
                      setState(() => _obscureConfirm = !_obscureConfirm),
                ),
              ),
              obscureText: _obscureConfirm,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(4),
              ],
              validator: (v) {
                if (v != _newCtrl.text) return 'Los PINs no coinciden';
                return null;
              },
            ),
            const SizedBox(height: AppConstants.spacingXS),
            Text(
              'PIN actual de prueba: 1234',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: context.textTertiaryColor),
            ),
            const SizedBox(height: AppConstants.spacingL),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submit,
                child: const Text('Actualizar PIN'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Shared widgets ─────────────────────────────────────────────────────────────

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
              color: context.textSecondaryColor,
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
                  ?.copyWith(color: context.textSecondaryColor),
            )
          : null,
      trailing: trailing,
      onTap: onTap,
    );
  }
}
