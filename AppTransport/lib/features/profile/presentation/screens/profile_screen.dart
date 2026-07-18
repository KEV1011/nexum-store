import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/config/api_config.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/domain/service_type.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/safe_back.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/driver_status/domain/entities/driver_status_entity.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';
import 'package:nexum_driver/features/profile/presentation/providers/editable_profile_provider.dart';
import 'package:nexum_driver/features/profile_verification/domain/entities/driver_profile_entity.dart';
import 'package:nexum_driver/features/profile_verification/presentation/providers/driver_profile_provider.dart';

// ── Documentos (reales, de /driver/profile vía driverProfileProvider) ─────────

IconData _docIcon(String type) {
  switch (type) {
    case 'CEDULA':
      return Icons.badge_rounded;
    case 'LICENSE':
      return Icons.credit_card_rounded;
    case 'SOAT':
      return Icons.security_rounded;
    case 'PROPERTY_CARD':
      return Icons.directions_car_filled_rounded;
    default:
      return Icons.description_rounded;
  }
}

/// 'Vence: 14 mar 2027' (o 'Venció: …') a partir del ISO `expiresAt`.
String? _expiryLabel(DriverDocument doc) {
  final raw = doc.expiresAt;
  if (raw == null || raw.isEmpty) return null;
  final date = DateTime.tryParse(raw);
  if (date == null) return null;
  final formatted = DateFormat('d MMM y', 'es_CO').format(date);
  return date.isBefore(DateTime.now()) ? 'Venció: $formatted' : 'Vence: $formatted';
}

// ── Screen ────────────────────────────────────────────────────────────────────

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final driverStatus = ref.watch(driverStatusProvider);
    final profile = ref.watch(editableProfileProvider);
    final docState = ref.watch(driverProfileProvider);
    // Carga perezosa por si se entra al perfil sin haber pasado por el home.
    if (docState.profile == null && !docState.isLoading && docState.error == null) {
      Future.microtask(() => ref.read(driverProfileProvider.notifier).load());
    }

    return Scaffold(
      backgroundColor: isDark ? AppColors.backgroundDark : context.backgroundColor,
      appBar: AppBar(
        title: const Text('Mi perfil'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => safeBack(context),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Editar perfil',
            onPressed: () => _showEditProfileSheet(context, ref, profile),
          ),
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
            // ── Avatar + identity ──────────────────────────────────────────
            _buildAvatarCard(context, ref, theme, profile),
            const SizedBox(height: AppConstants.spacingM),

            // ── Affiliation (empresa / operador) ───────────────────────────
            if (profile.affiliation != null) ...[
              _buildAffiliationCard(theme, profile.affiliation!),
              const SizedBox(height: AppConstants.spacingM),
            ],

            // ── Rating breakdown ───────────────────────────────────────────
            _buildRatingCard(theme, profile),
            const SizedBox(height: AppConstants.spacingM),

            // ── Session + performance stats ────────────────────────────────
            _buildStatsCard(theme, driverStatus, profile),
            const SizedBox(height: AppConstants.spacingM),

            // ── Vehicle ────────────────────────────────────────────────────
            _buildVehicleCard(context, ref, theme, profile),
            const SizedBox(height: AppConstants.spacingM),

            // ── Documents ──────────────────────────────────────────────────
            _buildDocumentsCard(context, theme, docState),
            const SizedBox(height: AppConstants.spacingM),

            // ── Bank account ───────────────────────────────────────────────
            _buildBankCard(theme, profile),
            const SizedBox(height: AppConstants.spacingM),

            // ── Account actions ────────────────────────────────────────────
            _buildAccountCard(context, theme),
            const SizedBox(height: AppConstants.spacingXL),
          ],
        ),
      ),
    );
  }

  // ── Foto de perfil ──────────────────────────────────────────────────────────

  /// Abre la galería, sube la imagen al backend y refleja el avatar nuevo.
  /// Lee bytes (no rutas) para funcionar igual en Android y en web.
  Future<void> _pickAndUploadPhoto(BuildContext context, WidgetRef ref) async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 85,
    );
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    if (!context.mounted) return;
    AppSnackbar.showInfo(context, 'Subiendo foto…');
    final error = await ref
        .read(editableProfileProvider.notifier)
        .uploadPhoto(bytes, picked.name);
    if (!context.mounted) return;
    if (error == null) {
      AppSnackbar.showSuccess(context, 'Foto de perfil actualizada.');
    } else {
      AppSnackbar.showError(context, error);
    }
  }

  // ── Avatar card ─────────────────────────────────────────────────────────────

  Widget _buildAvatarCard(
    BuildContext context,
    WidgetRef ref,
    ThemeData theme,
    EditableProfile profile,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingL),
        child: Column(
          children: [
            // Avatar with camera overlay
            Stack(
              alignment: Alignment.bottomRight,
              children: [
                CircleAvatar(
                  radius: 48,
                  backgroundColor: AppColors.primaryContainer,
                  foregroundImage: profile.photoUrl != null
                      ? NetworkImage(ApiConfig.resolveUrl(profile.photoUrl!))
                      : null,
                  child: Text(
                    profile.initials,
                    style: theme.textTheme.headlineMedium?.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: () => _pickAndUploadPhoto(context, ref),
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                    child: const Icon(
                      Icons.camera_alt_rounded,
                      color: Colors.white,
                      size: 16,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingM),
            // Name + verified badge
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Flexible(
                  child: Text(
                    profile.displayName,
                    style: theme.textTheme.titleLarge
                        ?.copyWith(fontWeight: FontWeight.w700),
                    textAlign: TextAlign.center,
                  ),
                ),
                if (profile.isVerified) ...[
                  const SizedBox(width: 6),
                  const Icon(Icons.verified_rounded,
                      color: AppColors.info, size: 18),
                ],
              ],
            ),
            const SizedBox(height: AppConstants.spacingXS),
            Text(
              profile.phone,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.textSecondaryColor,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              profile.email,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.textSecondaryColor,
              ),
            ),
            const SizedBox(height: AppConstants.spacingXS),
            Text(
              // Base de operación de la plataforma (no es dato personal).
              'Colombia',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.textTertiaryColor,
              ),
            ),
            const SizedBox(height: AppConstants.spacingM),
            // Edit identity button
            OutlinedButton.icon(
              onPressed: () => _showEditProfileSheet(context, ref, profile),
              icon: const Icon(Icons.edit_rounded, size: 16),
              label: const Text('Editar perfil'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(40),
                textStyle: const TextStyle(fontSize: 13),
              ),
            ),
            const SizedBox(height: AppConstants.spacingM),
            // Service type chips
            Wrap(
              spacing: 6,
              runSpacing: 6,
              alignment: WrapAlignment.center,
              children: ServiceType.values.map((type) {
                return Chip(
                  avatar: Icon(type.icon, size: 12, color: type.color),
                  label: Text(
                    type.displayName,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: type.color,
                    ),
                  ),
                  backgroundColor: type.containerColor,
                  side: BorderSide(color: type.color.withValues(alpha: 0.3)),
                  padding: EdgeInsets.zero,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  // ── Affiliation card (empresa / operador) ────────────────────────────────────

  Widget _buildAffiliationCard(ThemeData theme, DriverAffiliation aff) {
    final (statusColor, statusIcon) = switch (aff.status) {
      'ACTIVE' => (AppColors.success, Icons.verified_rounded),
      'SUSPENDED' => (AppColors.error, Icons.block_rounded),
      _ => (AppColors.warning, Icons.hourglass_top_rounded),
    };
    final employmentLabel =
        aff.employmentType == 'OWN' ? 'Vehículo propio' : 'Vehículo afiliado';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CardHeader(
              icon: Icons.apartment_rounded,
              label: 'Empresa',
              iconColor: AppColors.primary,
            ),
            const SizedBox(height: AppConstants.spacingM),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer,
                    borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                  ),
                  child: const Icon(Icons.business_rounded,
                      color: AppColors.primary, size: 24),
                ),
                const SizedBox(width: AppConstants.spacingM),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Conduces para',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.textSecondaryColor,
                          fontSize: 11,
                        ),
                      ),
                      Text(
                        aff.legalName,
                        style: theme.textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${aff.typeLabel} · $employmentLabel',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.textSecondaryColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingM),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingM,
                vertical: AppConstants.spacingS,
              ),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                border: Border.all(color: statusColor.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  Icon(statusIcon, color: statusColor, size: 18),
                  const SizedBox(width: AppConstants.spacingS),
                  Expanded(
                    child: Text(
                      aff.isActiveVerified
                          ? 'Empresa habilitada y verificada por ZIPA.'
                          : aff.status == 'SUSPENDED'
                              ? 'Empresa suspendida. No puedes operar bajo ella.'
                              : 'Empresa en verificación. Podrás operar cuando ZIPA la habilite.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: statusColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Rating breakdown card ────────────────────────────────────────────────────

  Widget _buildRatingCard(ThemeData theme, EditableProfile profile) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CardHeader(
              icon: Icons.star_rounded,
              label: 'Calificación',
              iconColor: AppColors.star,
            ),
            const SizedBox(height: AppConstants.spacingM),
            // Overall rating hero
            Row(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      profile.rating.toStringAsFixed(2),
                      style: theme.textTheme.displaySmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.star,
                      ),
                    ),
                    Row(
                      children: List.generate(5, (i) {
                        final filled = i < profile.rating.floor();
                        final half = !filled &&
                            i < profile.rating &&
                            (profile.rating - i) >= 0.5;
                        return Icon(
                          filled
                              ? Icons.star_rounded
                              : half
                                  ? Icons.star_half_rounded
                                  : Icons.star_outline_rounded,
                          color: AppColors.star,
                          size: 16,
                        );
                      }),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${profile.totalTrips} viajes completados',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.textSecondaryColor,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ── Stats card ───────────────────────────────────────────────────────────────

  Widget _buildStatsCard(
    ThemeData theme,
    DriverStatusEntity driverStatus,
    EditableProfile profile,
  ) {
    final todayTrips = driverStatus.dailyTrips;
    final todayEarnings = driverStatus.dailyEarnings;
    final onlineMinutes = driverStatus.timeOnline.inMinutes;
    final onlineLabel = onlineMinutes >= 60
        ? '${onlineMinutes ~/ 60}h ${onlineMinutes % 60}m'
        : onlineMinutes > 0
            ? '${onlineMinutes}m'
            : '--';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CardHeader(
              icon: Icons.insights_rounded,
              label: 'Estadísticas',
              iconColor: AppColors.primary,
            ),
            const SizedBox(height: AppConstants.spacingM),
            // Today row
            _StatRow(
              label: 'Viajes hoy',
              value: todayTrips.toString(),
              icon: Icons.two_wheeler_rounded,
              color: AppColors.primary,
              sublabel: 'sesión actual',
            ),
            const Divider(height: AppConstants.spacingM),
            _StatRow(
              label: 'Ganancias hoy',
              value: CurrencyFormatter.format(todayEarnings),
              icon: Icons.payments_outlined,
              color: AppColors.primary,
              sublabel: 'neto sesión',
            ),
            const Divider(height: AppConstants.spacingM),
            _StatRow(
              label: 'Tiempo en línea',
              value: onlineLabel,
              icon: Icons.timer_outlined,
              color: AppColors.info,
              sublabel: 'hoy',
            ),
            const Divider(height: AppConstants.spacingM),
            _StatRow(
              label: 'Viajes totales',
              value: profile.totalTrips.toString(),
              icon: Icons.route_rounded,
              color: theme.textSecondaryColor,
              sublabel: 'histórico',
            ),
            const Divider(height: AppConstants.spacingM),
            _StatRow(
              label: 'Tasa de aceptación',
              value: '94 %',
              icon: Icons.thumb_up_outlined,
              color: AppColors.success,
              sublabel: 'últimos 30 días',
            ),
          ],
        ),
      ),
    );
  }

  // ── Vehicle card ─────────────────────────────────────────────────────────────

  Widget _buildVehicleCard(
    BuildContext context,
    WidgetRef ref,
    ThemeData theme,
    EditableProfile profile,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CardHeader(
              icon: Icons.directions_car_rounded,
              label: 'Vehículo',
              iconColor: AppColors.primary,
            ),
            const SizedBox(height: AppConstants.spacingM),
            _InfoRow(label: 'Marca', value: profile.vehicleBrand),
            _InfoRow(label: 'Modelo', value: profile.vehicleModel),
            _InfoRow(
                label: 'Año',
                value: profile.vehicleYear > 0
                    ? profile.vehicleYear.toString()
                    : '—'),
            _InfoRow(
              label: 'Placa',
              value: profile.vehiclePlate,
              valueBold: true,
              letterSpacing: 2.0,
            ),
            _InfoRow(label: 'Color', value: profile.vehicleColor),
            _InfoRow(label: 'Tipo', value: profile.vehicleType),
            const SizedBox(height: AppConstants.spacingS),
            OutlinedButton.icon(
              onPressed: () => _showEditVehicleSheet(context, ref, profile),
              icon: const Icon(Icons.edit_rounded, size: 16),
              label: const Text('Editar información'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(40),
                textStyle: const TextStyle(fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Edit sheets ──────────────────────────────────────────────────────────────

  void _showEditProfileSheet(
    BuildContext context,
    WidgetRef ref,
    EditableProfile profile,
  ) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EditProfileSheet(profile: profile, ref: ref),
    );
  }

  void _showEditVehicleSheet(
    BuildContext context,
    WidgetRef ref,
    EditableProfile profile,
  ) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EditVehicleSheet(profile: profile, ref: ref),
    );
  }

  // ── Documents card ───────────────────────────────────────────────────────────

  Widget _buildDocumentsCard(
    BuildContext context,
    ThemeData theme,
    DriverProfileState docState,
  ) {
    final docs = docState.profile?.documents ?? const <DriverDocument>[];
    final rejectedCount =
        docs.where((d) => d.status == DocumentStatus.rejected).length;
    final pendingCount =
        docs.where((d) => d.status == DocumentStatus.pending).length;
    final missingCount =
        docs.where((d) => d.status == DocumentStatus.missing).length;
    final allApproved = docs.isNotEmpty &&
        rejectedCount == 0 &&
        pendingCount == 0 &&
        missingCount == 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _CardHeader(
                  icon: Icons.folder_rounded,
                  label: 'Documentos',
                  iconColor: AppColors.primary,
                ),
                const Spacer(),
                if (rejectedCount > 0)
                  _AlertChip(
                    label: rejectedCount == 1
                        ? '1 rechazado'
                        : '$rejectedCount rechazados',
                    color: AppColors.error,
                  )
                else if (missingCount > 0)
                  _AlertChip(
                    label: missingCount == 1
                        ? '1 pendiente'
                        : '$missingCount pendientes',
                    color: AppColors.warning,
                  )
                else if (pendingCount > 0)
                  _AlertChip(label: 'En revisión', color: AppColors.info)
                else if (allApproved)
                  _AlertChip(label: 'Verificados', color: AppColors.success),
              ],
            ),
            const SizedBox(height: AppConstants.spacingM),
            if (docState.isLoading && docs.isEmpty)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              )
            else if (docs.isEmpty)
              Text(
                'Aún no has subido tus documentos.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.textSecondaryColor,
                ),
              )
            else
              ...docs.map((doc) => _DocumentRow(doc: doc)),
            const SizedBox(height: AppConstants.spacingXS),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () => context.push('/verification'),
                icon: const Icon(Icons.upload_file_rounded, size: 16),
                label: const Text('Gestionar documentos'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Bank card ────────────────────────────────────────────────────────────────

  Widget _buildBankCard(ThemeData theme, EditableProfile profile) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CardHeader(
              icon: Icons.account_balance_rounded,
              label: 'Cuenta bancaria',
              iconColor: AppColors.primary,
            ),
            const SizedBox(height: AppConstants.spacingM),
            _InfoRow(label: 'Banco', value: profile.bankName),
            _InfoRow(label: 'Tipo', value: profile.bankAccountType),
            _InfoRow(label: 'Número', value: profile.bankAccountNumber),
            const SizedBox(height: AppConstants.spacingXS),
            Text(
              'Los pagos se depositan cada lunes antes de las 10 a.m.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.textSecondaryColor,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Account card ─────────────────────────────────────────────────────────────

  Widget _buildAccountCard(BuildContext context, ThemeData theme) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CardHeader(
              icon: Icons.manage_accounts_rounded,
              label: 'Cuenta',
              iconColor: AppColors.primary,
            ),
            const SizedBox(height: AppConstants.spacingS),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading:
                  const Icon(Icons.help_outline_rounded, color: AppColors.info),
              title: const Text('Centro de ayuda'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => context.push('/support'),
            ),
            const Divider(height: 1),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.settings_outlined,
                  color: theme.textSecondaryColor),
              title: const Text('Configuración'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => context.push('/settings'),
            ),
            const Divider(height: 1),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.info_outline_rounded,
                  color: theme.textSecondaryColor),
              title: const Text('Versión de la app'),
              trailing: Text(
                AppConstants.appVersion,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.textSecondaryColor),
              ),
            ),
            const Divider(height: 1),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading:
                  const Icon(Icons.logout_rounded, color: AppColors.error),
              title: const Text(
                'Cerrar sesión',
                style: TextStyle(color: AppColors.error),
              ),
              onTap: () => _confirmLogout(context),
            ),
          ],
        ),
      ),
    );
  }

  // ── Logout dialog ────────────────────────────────────────────────────────────

  void _confirmLogout(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cerrar sesión'),
        content:
            const Text('¿Estás seguro de que deseas cerrar sesión?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            style:
                ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () async {
              Navigator.of(ctx).pop();
              await _storage.deleteAll();
              if (context.mounted) context.go('/login');
            },
            child: const Text('Cerrar sesión'),
          ),
        ],
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _CardHeader extends StatelessWidget {
  const _CardHeader({
    required this.icon,
    required this.label,
    required this.iconColor,
  });
  final IconData icon;
  final String label;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: iconColor, size: 18),
        const SizedBox(width: AppConstants.spacingS),
        Text(
          label,
          style: Theme.of(context)
              .textTheme
              .titleSmall
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    required this.sublabel,
  });
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final String sublabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: AppConstants.spacingS),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: theme.textTheme.bodyMedium),
              Text(
                sublabel,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.textSecondaryColor,
                  fontSize: 10,
                ),
              ),
            ],
          ),
        ),
        Text(
          value,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: color == theme.textSecondaryColor ? context.textPrimaryColor : color,
          ),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.label,
    required this.value,
    this.valueBold = false,
    this.letterSpacing,
  });
  final String label;
  final String value;
  final bool valueBold;
  final double? letterSpacing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.textSecondaryColor),
          ),
          Text(
            value,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: valueBold ? FontWeight.w800 : FontWeight.w600,
              letterSpacing: letterSpacing,
            ),
          ),
        ],
      ),
    );
  }
}

class _DocumentRow extends StatelessWidget {
  const _DocumentRow({required this.doc});
  final DriverDocument doc;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = doc.status.color;
    final expiry = _expiryLabel(doc);
    final expired = expiry != null && expiry.startsWith('Venció');
    // Con rechazo se muestra el motivo del admin; si no, el vencimiento.
    final rejection = doc.rejectionReason;
    final detail = doc.status == DocumentStatus.rejected &&
            rejection != null &&
            rejection.isNotEmpty
        ? rejection
        : expiry;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(_docIcon(doc.type), size: 18, color: color),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(doc.label, style: theme.textTheme.bodyMedium),
                if (detail != null && detail.isNotEmpty)
                  Text(
                    detail,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: expired || doc.status == DocumentStatus.rejected
                          ? AppColors.error
                          : theme.textSecondaryColor,
                      fontSize: 11,
                    ),
                  ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
            ),
            child: Text(
              doc.status.label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: color,
                fontWeight: FontWeight.w700,
                fontSize: 11,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AlertChip extends StatelessWidget {
  const _AlertChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

// ── Edit profile sheet ──────────────────────────────────────────────────────────

class _EditProfileSheet extends StatefulWidget {
  const _EditProfileSheet({required this.profile, required this.ref});
  final EditableProfile profile;
  final WidgetRef ref;

  @override
  State<_EditProfileSheet> createState() => _EditProfileSheetState();
}

class _EditProfileSheetState extends State<_EditProfileSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _firstName;
  late final TextEditingController _lastName;
  late final TextEditingController _phone;
  late final TextEditingController _email;

  @override
  void initState() {
    super.initState();
    _firstName = TextEditingController(text: widget.profile.firstName);
    _lastName = TextEditingController(text: widget.profile.lastName);
    _phone = TextEditingController(text: widget.profile.phone);
    _email = TextEditingController(text: widget.profile.email);
  }

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _phone.dispose();
    _email.dispose();
    super.dispose();
  }

  void _save() {
    if (!_formKey.currentState!.validate()) return;
    widget.ref.read(editableProfileProvider.notifier).updateIdentity(
          firstName: _firstName.text,
          lastName: _lastName.text,
          phone: _phone.text,
          email: _email.text,
        );
    Navigator.of(context).pop();
    AppSnackbar.showSuccess(context, 'Perfil actualizado correctamente');
  }

  @override
  Widget build(BuildContext context) {
    return _SheetScaffold(
      title: 'Editar perfil',
      icon: Icons.person_rounded,
      onSave: _save,
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _SheetField(
              controller: _firstName,
              label: 'Nombres',
              icon: Icons.badge_outlined,
              textCapitalization: TextCapitalization.words,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Ingresa tus nombres' : null,
            ),
            _SheetField(
              controller: _lastName,
              label: 'Apellidos',
              icon: Icons.badge_outlined,
              textCapitalization: TextCapitalization.words,
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? 'Ingresa tus apellidos'
                  : null,
            ),
            _SheetField(
              controller: _phone,
              label: 'Teléfono',
              icon: Icons.phone_outlined,
              keyboardType: TextInputType.phone,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp('[0-9+ ]')),
              ],
              validator: (v) {
                final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                if (digits.length < 10) return 'Teléfono inválido';
                return null;
              },
            ),
            _SheetField(
              controller: _email,
              label: 'Correo electrónico',
              icon: Icons.email_outlined,
              keyboardType: TextInputType.emailAddress,
              validator: (v) {
                final value = (v ?? '').trim();
                if (value.isEmpty) return 'Ingresa tu correo';
                if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value)) {
                  return 'Correo inválido';
                }
                return null;
              },
            ),
          ],
        ),
      ),
    );
  }
}

// ── Edit vehicle sheet ───────────────────────────────────────────────────────

class _EditVehicleSheet extends StatefulWidget {
  const _EditVehicleSheet({required this.profile, required this.ref});
  final EditableProfile profile;
  final WidgetRef ref;

  @override
  State<_EditVehicleSheet> createState() => _EditVehicleSheetState();
}

class _EditVehicleSheetState extends State<_EditVehicleSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _brand;
  late final TextEditingController _model;
  late final TextEditingController _year;
  late final TextEditingController _plate;
  late final TextEditingController _color;
  late final TextEditingController _type;

  @override
  void initState() {
    super.initState();
    _brand = TextEditingController(text: widget.profile.vehicleBrand);
    _model = TextEditingController(text: widget.profile.vehicleModel);
    _year = TextEditingController(text: widget.profile.vehicleYear.toString());
    _plate = TextEditingController(text: widget.profile.vehiclePlate);
    _color = TextEditingController(text: widget.profile.vehicleColor);
    _type = TextEditingController(text: widget.profile.vehicleType);
  }

  @override
  void dispose() {
    _brand.dispose();
    _model.dispose();
    _year.dispose();
    _plate.dispose();
    _color.dispose();
    _type.dispose();
    super.dispose();
  }

  void _save() {
    if (!_formKey.currentState!.validate()) return;
    final year = int.tryParse(_year.text) ?? widget.profile.vehicleYear;
    widget.ref.read(editableProfileProvider.notifier).updateVehicle(
          brand: _brand.text,
          model: _model.text,
          year: year,
          plate: _plate.text,
          color: _color.text,
          type: _type.text,
        );
    Navigator.of(context).pop();
    AppSnackbar.showSuccess(context, 'Vehículo actualizado correctamente');
  }

  String? _required(String? v) =>
      (v == null || v.trim().isEmpty) ? 'Campo requerido' : null;

  @override
  Widget build(BuildContext context) {
    final currentYear = DateTime.now().year;
    return _SheetScaffold(
      title: 'Editar vehículo',
      icon: Icons.directions_car_rounded,
      onSave: _save,
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _SheetField(
              controller: _brand,
              label: 'Marca',
              icon: Icons.factory_outlined,
              textCapitalization: TextCapitalization.words,
              validator: _required,
            ),
            _SheetField(
              controller: _model,
              label: 'Modelo',
              icon: Icons.directions_car_outlined,
              textCapitalization: TextCapitalization.words,
              validator: _required,
            ),
            _SheetField(
              controller: _year,
              label: 'Año',
              icon: Icons.calendar_today_outlined,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(4),
              ],
              validator: (v) {
                final year = int.tryParse(v ?? '');
                if (year == null) return 'Año inválido';
                if (year < 1990 || year > currentYear + 1) {
                  return 'Entre 1990 y ${currentYear + 1}';
                }
                return null;
              },
            ),
            _SheetField(
              controller: _plate,
              label: 'Placa',
              icon: Icons.pin_outlined,
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9-]')),
                LengthLimitingTextInputFormatter(7),
              ],
              validator: _required,
            ),
            _SheetField(
              controller: _color,
              label: 'Color',
              icon: Icons.palette_outlined,
              textCapitalization: TextCapitalization.words,
              validator: _required,
            ),
            _SheetField(
              controller: _type,
              label: 'Tipo',
              icon: Icons.category_outlined,
              textCapitalization: TextCapitalization.words,
              validator: _required,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Shared sheet widgets ─────────────────────────────────────────────────────

class _SheetScaffold extends StatelessWidget {
  const _SheetScaffold({
    required this.title,
    required this.icon,
    required this.onSave,
    required this.child,
  });
  final String title;
  final IconData icon;
  final VoidCallback onSave;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppConstants.radiusXLarge),
        ),
      ),
      padding: EdgeInsets.fromLTRB(
        AppConstants.spacingL,
        AppConstants.spacingS,
        AppConstants.spacingL,
        AppConstants.spacingL + bottomInset,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: AppConstants.spacingM),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Row(
              children: [
                Icon(icon, color: AppColors.primary, size: 22),
                const SizedBox(width: AppConstants.spacingS),
                Text(
                  title,
                  style: theme.textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingL),
            child,
            const SizedBox(height: AppConstants.spacingL),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                    ),
                    child: const Text('Cancelar'),
                  ),
                ),
                const SizedBox(width: AppConstants.spacingM),
                Expanded(
                  child: ElevatedButton(
                    onPressed: onSave,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                    ),
                    child: const Text('Guardar'),
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

class _SheetField extends StatelessWidget {
  const _SheetField({
    required this.controller,
    required this.label,
    required this.icon,
    this.keyboardType,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
    this.validator,
  });
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppConstants.spacingM),
      child: TextFormField(
        controller: controller,
        keyboardType: keyboardType,
        inputFormatters: inputFormatters,
        textCapitalization: textCapitalization,
        validator: validator,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: Icon(icon, size: 20),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          ),
        ),
      ),
    );
  }
}
