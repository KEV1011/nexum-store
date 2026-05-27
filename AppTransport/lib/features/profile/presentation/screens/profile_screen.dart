import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';

// ── Mock driver data ─────────────────────────────────────────────────────────

class _DriverProfile {
  const _DriverProfile({
    required this.fullName,
    required this.phone,
    required this.rating,
    required this.totalTrips,
    required this.vehicleBrand,
    required this.vehicleModel,
    required this.vehicleYear,
    required this.plate,
    required this.vehicleColor,
    required this.memberSince,
  });

  final String fullName;
  final String phone;
  final double rating;
  final int totalTrips;
  final String vehicleBrand;
  final String vehicleModel;
  final int vehicleYear;
  final String plate;
  final String vehicleColor;
  final DateTime memberSince;

  String get initials {
    final parts = fullName.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return fullName[0].toUpperCase();
  }

  String get vehicleFullName => '$vehicleBrand $vehicleModel $vehicleYear';
}

const _mockDriver = _DriverProfile(
  fullName: 'Juan Carlos Villamizar Contreras',
  phone: '+57 312 456 7890',
  rating: 4.87,
  totalTrips: 312,
  vehicleBrand: 'Chevrolet',
  vehicleModel: 'Spark GT',
  vehicleYear: 2020,
  plate: 'KGB-742',
  vehicleColor: 'Blanco perla',
  memberSince: Duration.zero, // placeholder, set below
);

// ── Screen ────────────────────────────────────────────────────────────────────

/// Pantalla de perfil del conductor con información del vehículo.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  static const _storage = FlutterSecureStorage();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    // Use fixed mock data (real data would come from a provider)
    const driver = _DriverProfile(
      fullName: 'Juan Carlos Villamizar Contreras',
      phone: AppConstants.mockDriverPhone,
      rating: 4.87,
      totalTrips: 312,
      vehicleBrand: 'Chevrolet',
      vehicleModel: 'Spark GT',
      vehicleYear: 2020,
      plate: 'KGB-742',
      vehicleColor: 'Blanco perla',
      memberSince: Duration.zero,
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mi perfil'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => context.pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Cerrar sesión',
            onPressed: () => _confirmLogout(context),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingM,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Avatar & name card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(AppConstants.spacingL),
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 44,
                      backgroundColor: AppColors.primary,
                      child: Text(
                        driver.initials,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          color: AppColors.textOnPrimary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingM),
                    Text(
                      driver.fullName,
                      style: theme.textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.w700),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppConstants.spacingXS),
                    Text(
                      driver.phone,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingM),
                    // Stats row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        _StatBadge(
                          value: driver.rating.toStringAsFixed(2),
                          label: 'Calificación',
                          icon: Icons.star_rounded,
                          iconColor: AppColors.star,
                        ),
                        Container(width: 1, height: 40, color: AppColors.divider),
                        _StatBadge(
                          value: driver.totalTrips.toString(),
                          label: 'Viajes totales',
                          icon: Icons.local_taxi_rounded,
                          iconColor: AppColors.primary,
                        ),
                        Container(width: 1, height: 40, color: AppColors.divider),
                        _StatBadge(
                          value: 'Activo',
                          label: 'Estado',
                          icon: Icons.verified_rounded,
                          iconColor: AppColors.success,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppConstants.spacingM),
            // Vehicle info card
            _SectionCard(
              title: 'Vehículo',
              icon: Icons.directions_car_rounded,
              children: [
                _InfoRow(
                  label: 'Marca y modelo',
                  value: driver.vehicleFullName,
                ),
                _InfoRow(
                  label: 'Placa',
                  value: driver.plate,
                  valueStyle: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.5,
                    color: AppColors.secondary,
                  ),
                ),
                _InfoRow(
                  label: 'Color',
                  value: driver.vehicleColor,
                ),
                _InfoRow(
                  label: 'Año',
                  value: driver.vehicleYear.toString(),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingM),
            // Documents card
            _SectionCard(
              title: 'Documentos',
              icon: Icons.folder_rounded,
              children: [
                _DocumentRow(
                  label: 'Licencia de conducción',
                  status: _DocumentStatus.valid,
                ),
                _DocumentRow(
                  label: 'SOAT vigente',
                  status: _DocumentStatus.valid,
                ),
                _DocumentRow(
                  label: 'Revisión técnico-mecánica',
                  status: _DocumentStatus.valid,
                ),
                _DocumentRow(
                  label: 'Tarjeta de operación',
                  status: _DocumentStatus.valid,
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingM),
            // Account actions
            _SectionCard(
              title: 'Cuenta',
              icon: Icons.manage_accounts_rounded,
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.help_outline_rounded,
                      color: AppColors.info),
                  title: const Text('Centro de ayuda'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => AppSnackbar.showInfo(
                    context,
                    'Centro de ayuda disponible próximamente.',
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.info_outline_rounded,
                      color: AppColors.textSecondary),
                  title: const Text('Versión de la app'),
                  trailing: Text(
                    AppConstants.appVersion,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.textSecondary,
                        ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingL),
          ],
        ),
      ),
    );
  }

  void _confirmLogout(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cerrar sesión'),
        content: const Text(
          '¿Estás seguro de que deseas cerrar sesión?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
            ),
            onPressed: () async {
              Navigator.of(ctx).pop();
              await _storage.deleteAll();
              if (context.mounted) {
                context.go('/login');
              }
            },
            child: const Text('Cerrar sesión'),
          ),
        ],
      ),
    );
  }
}

// ── Sub-widgets ──────────────────────────────────────────────────────────────

class _StatBadge extends StatelessWidget {
  const _StatBadge({
    required this.value,
    required this.label,
    required this.icon,
    required this.iconColor,
  });

  final String value;
  final String label;
  final IconData icon;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Icon(icon, color: iconColor, size: 20),
        const SizedBox(height: 4),
        Text(
          value,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.textSecondary,
            fontSize: 10,
          ),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.icon,
    required this.children,
  });

  final String title;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: AppColors.primary, size: 18),
                const SizedBox(width: AppConstants.spacingS),
                Text(
                  title,
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingM),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.label,
    required this.value,
    this.valueStyle,
  });

  final String label;
  final String value;
  final TextStyle? valueStyle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: theme.textTheme.bodySmall
                ?.copyWith(color: AppColors.textSecondary),
          ),
          Text(
            value,
            style: valueStyle ??
                theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

enum _DocumentStatus { valid, expiringSoon, expired }

class _DocumentRow extends StatelessWidget {
  const _DocumentRow({
    required this.label,
    required this.status,
  });

  final String label;
  final _DocumentStatus status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (color, icon, statusText) = switch (status) {
      _DocumentStatus.valid => (AppColors.success, Icons.check_circle_rounded, 'Vigente'),
      _DocumentStatus.expiringSoon => (AppColors.warning, Icons.warning_rounded, 'Por vencer'),
      _DocumentStatus.expired => (AppColors.error, Icons.cancel_rounded, 'Vencido'),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Text(
              label,
              style: theme.textTheme.bodyMedium,
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppConstants.spacingS,
              vertical: 2,
            ),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius:
                  BorderRadius.circular(AppConstants.radiusCircular),
            ),
            child: Text(
              statusText,
              style: theme.textTheme.bodySmall?.copyWith(
                color: color,
                fontWeight: FontWeight.w600,
                fontSize: 11,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
