import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/app/theme/theme_provider.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/auth/presentation/providers/auth_provider.dart';
import 'package:nexum_driver/features/profile_verification/presentation/providers/driver_profile_provider.dart';
import 'package:nexum_driver/features/settings/presentation/screens/delete_account_screen.dart';
import 'package:nexum_driver/features/settings/presentation/screens/legal_doc_screen.dart';
import 'package:nexum_driver/features/settings/presentation/screens/privacy_screen.dart';
import 'package:nexum_driver/shared/services/navegacion_externa.dart';
import 'package:nexum_driver/features/moderacion/presentation/bloqueados_screen.dart';
import 'package:nexum_driver/app/theme/contraste.dart';

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
  // La app de navegación del conductor. Antes era estado local de esta
  // pantalla: se olvidaba al salir y NADIE la usaba para navegar. Ahora se
  // guarda y es la que abre el botón «Navegar» del viaje.
  AppDeMapas _appDeMapas = AppDeMapas.googleMaps;

  // Simulated cache size in MB
  double _cacheMb = 24.3;

  @override
  void initState() {
    super.initState();
    // La elección guardada: sin esto la pantalla diría «Google Maps» cuando el
    // conductor ya eligió Waze.
    appDeMapasGuardada().then((a) {
      if (mounted) setState(() => _appDeMapas = a);
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Configuración')),
      body: ListView(
        // Espacio inferior para que "Cerrar sesión" no quede pegado al borde /
        // tapado por la barra del sistema.
        padding: const EdgeInsets.only(bottom: 40),
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
            subtitle: _appDeMapas.etiqueta,
            trailing: Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
            onTap: _showMapPickerSheet,
          ),
          const Divider(),
          _SectionHeader(title: 'Seguridad'),
          // La clave personal de verdad. Aquí había una hoja «Cambiar PIN de
          // seguridad» que no guardaba nada en ninguna parte y decía «PIN
          // actualizado correctamente»: una pantalla de seguridad que miente
          // es peor que no tenerla.
          _SettingsTile(
            icon: Icons.lock_outline_rounded,
            iconColor: AppColors.error,
            title: 'Clave personal',
            subtitle: 'La que te pedimos al entrar',
            trailing: Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
            onTap: () => context.push(AppRoutes.clavePersonal),
          ),
          _SettingsTile(
            icon: Icons.privacy_tip_outlined,
            iconColor: context.textSecondaryColor,
            title: 'Privacidad de datos',
            subtitle: 'Cómo cuidamos tu información',
            trailing: Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const PrivacyScreen()),
            ),
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
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const LegalDocScreen(kind: 'terms'),
              ),
            ),
          ),
          _SettingsTile(
            icon: Icons.shield_outlined,
            iconColor: context.textSecondaryColor,
            title: 'Política de privacidad',
            trailing: Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const PrivacyScreen()),
            ),
          ),
          // Ver y deshacer los bloqueos. Aquí el coste de un bloqueo es
          // directo: cada pasajero bloqueado es un viaje que este conductor ya
          // no va a recibir, así que tiene que poder revisarlos.
          _SettingsTile(
            icon: Icons.block_outlined,
            iconColor: context.textSecondaryColor,
            title: 'Pasajeros bloqueados',
            trailing: Icon(Icons.chevron_right_rounded,
                color: context.textSecondaryColor),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const BloqueadosScreen()),
            ),
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
          // Eliminar la cuenta tiene que estar EN la app, no en un correo a
          // soporte: App Store y Play lo exigen así.
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppConstants.spacingM,
            ),
            child: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const DeleteAccountScreen(),
                ),
              ),
              style: TextButton.styleFrom(
                minimumSize: const Size.fromHeight(AppConstants.minTouchTarget),
              ),
              child: Text(
                'Eliminar mi cuenta',
                style: TextStyle(color: context.textSecondaryColor),
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
                          profile.rating?.toStringAsFixed(2) ?? 'Nuevo',
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
              ...AppDeMapas.values.map(
                (app) => RadioListTile<AppDeMapas>(
                  value: app,
                  groupValue: _appDeMapas,
                  title: Text(app.etiqueta),
                  subtitle: Text(app.detalle,
                      style: const TextStyle(fontSize: 12)),
                  secondary: Icon(_mapAppIcon(app),
                      color: AppColors.primary, size: 22),
                  activeColor: AppColors.primary,
                  onChanged: (v) async {
                    if (v == null) return;
                    setSheet(() {});
                    setState(() => _appDeMapas = v);
                    await guardarAppDeMapas(v);
                    if (!ctx.mounted) return;
                    Navigator.of(ctx).pop();
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content: Text(
                              'El botón «Navegar» del viaje abrirá ${v.etiqueta}')),
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
                foregroundColor: colorDeTextoSobre(AppColors.error)),
            child: const Text('Cerrar sesión'),
          ),
        ],
      ),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  IconData _mapAppIcon(AppDeMapas app) => switch (app) {
        AppDeMapas.googleMaps => Icons.map_rounded,
        AppDeMapas.waze => Icons.navigation_rounded,
        AppDeMapas.sistema => Icons.phone_android_rounded,
      };
}

// ── Change PIN sheet ───────────────────────────────────────────────────────────

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
