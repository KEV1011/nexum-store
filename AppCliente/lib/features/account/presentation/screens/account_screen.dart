import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/theme_provider.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/addresses/presentation/providers/'
    'addresses_provider.dart';
import 'package:nexum_client/features/account/presentation/providers/'
    'client_profile_provider.dart';
import 'package:nexum_client/features/auth/domain/entities/client_entity.dart';
import 'package:nexum_client/features/support/presentation/screens/support_tickets_screen.dart';
import 'package:nexum_client/features/account/presentation/screens/client_verification_screen.dart';
import 'package:nexum_client/features/account/presentation/screens/payment_methods_screen.dart';
import 'package:nexum_client/features/account/presentation/screens/privacy_screen.dart';
import 'package:nexum_client/features/auth/presentation/providers/auth_provider.dart';

/// Pestaña "Cuenta": perfil del cliente y preferencias.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final client = ref.watch(currentClientProvider);

    ref.listen(authProvider, (_, next) {
      if (next is AuthUnauthenticated) context.go(AppRoutes.login);
    });

    return Scaffold(
      appBar: AppBar(title: const Text('Mi cuenta')),
      body: ListView(
        // Espacio inferior extra para que el último ítem (Cerrar sesión) no
        // quede tapado por la barra de navegación flotante (glass bar).
        padding: const EdgeInsets.fromLTRB(
          AppConstants.spacingM,
          AppConstants.spacingM,
          AppConstants.spacingM,
          100,
        ),
        children: [
          _ProfileHeader(client: client),
          const SizedBox(height: AppConstants.spacingL),
          _SettingsGroup(
            children: [
              _SettingTile(
                icon: Icons.location_on_rounded,
                title: 'Mis direcciones',
                subtitle: ref.watch(defaultAddressProvider)?.fullAddress ??
                    'Sin dirección guardada',
                onTap: () => context.push(AppRoutes.addresses),
              ),
              _SettingTile(
                icon: Icons.account_balance_wallet_rounded,
                title: 'Métodos de pago',
                subtitle: 'Efectivo o pago en línea (Wompi)',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const PaymentMethodsScreen(),
                  ),
                ),
              ),
              _SettingTile(
                icon: Icons.verified_user_outlined,
                title: 'Verificar mi identidad',
                subtitle: 'Da confianza al conductor · viaja más seguro',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const ClientVerificationScreen(),
                  ),
                ),
              ),
              _SettingTile(
                icon: Icons.shield_outlined,
                title: 'Contacto de confianza',
                subtitle: 'Para el botón SOS durante un viaje',
                onTap: () => context.push(AppRoutes.trustedContact),
              ),
              _SettingTile(
                icon: Icons.card_giftcard_rounded,
                title: 'Invita y gana',
                subtitle: 'Tu código de referido y cupones',
                onTap: () => _showPromosSheet(context),
              ),
              const _DarkModeTile(),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),
          _SettingsGroup(
            children: [
              _SettingTile(
                icon: Icons.help_outline_rounded,
                title: 'Ayuda y soporte',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const SupportTicketsScreen(basePath: '/client'),
                  ),
                ),
              ),
              _SettingTile(
                icon: Icons.privacy_tip_outlined,
                title: 'Privacidad y datos',
                subtitle: 'Cómo cuidamos tu información',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const PrivacyScreen(),
                  ),
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
          const SizedBox(height: AppConstants.spacingM),
          _SettingsGroup(
            children: [
              _LogoutTile(
                onTap: () => _confirmLogout(context, ref),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingL),
        ],
      ),
    );
  }

  void _showPromosSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _PromosSheet(),
    );
  }

  void _confirmLogout(BuildContext context, WidgetRef ref) {
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text(
          'Cerrar sesión',
          style: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w700),
        ),
        content: const Text(
          '¿Deseas cerrar sesión de Nexum?',
          style: TextStyle(fontFamily: 'Inter'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text(
              'Cerrar sesión',
              style: TextStyle(color: AppColors.error),
            ),
          ),
        ],
      ),
    ).then((confirmed) {
      if (confirmed ?? false) {
        ref.read(authProvider.notifier).logout();
        // La navegación la maneja ref.listen en build.
      }
    });
  }
}

class _ProfileHeader extends ConsumerWidget {
  const _ProfileHeader({required this.client});

  final ClientEntity? client;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(clientProfileProvider);
    final name = profile?.name ?? client?.name ?? 'Cliente Nexum';
    final phone = profile?.phone ?? client?.phone ?? '';
    final avatarUrl = profile?.avatarUrl;

    return Row(
      children: [
        Stack(
          alignment: Alignment.bottomRight,
          children: [
            CircleAvatar(
              radius: 32,
              backgroundColor: AppColors.primaryContainer,
              foregroundImage: avatarUrl != null
                  ? NetworkImage(ApiConfig.resolveUrl(avatarUrl))
                  : null,
              child: Text(
                name.isNotEmpty ? name[0].toUpperCase() : 'C',
                style: const TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primaryDim,
                ),
              ),
            ),
            GestureDetector(
              onTap: () => _pickAndUploadPhoto(context, ref),
              child: Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 2),
                ),
                child: const Icon(
                  Icons.camera_alt_rounded,
                  color: Colors.white,
                  size: 12,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(width: AppConstants.spacingM),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: const TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                phone,
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 14,
                  color: context.textSecondaryColor,
                ),
              ),
            ],
          ),
        ),
        IconButton(
          onPressed: () => _editName(context, ref, name),
          tooltip: 'Editar nombre',
          icon: Icon(
            Icons.edit_rounded,
            size: 20,
            color: context.textSecondaryColor,
          ),
        ),
      ],
    );
  }

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
        .read(clientProfileProvider.notifier)
        .uploadPhoto(bytes, picked.name);
    if (!context.mounted) return;
    if (error == null) {
      AppSnackbar.showSuccess(context, 'Foto de perfil actualizada.');
    } else {
      AppSnackbar.showError(context, error);
    }
  }

  void _editName(BuildContext context, WidgetRef ref, String current) {
    final controller = TextEditingController(text: current);
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text(
          'Tu nombre',
          style: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w700),
        ),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(hintText: 'Nombre y apellido'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () async {
              final messengerContext = context;
              Navigator.of(ctx).pop();
              final error = await ref
                  .read(clientProfileProvider.notifier)
                  .updateName(controller.text);
              if (!messengerContext.mounted) return;
              if (error == null) {
                AppSnackbar.showSuccess(messengerContext, 'Nombre actualizado.');
              } else {
                AppSnackbar.showError(messengerContext, error);
              }
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
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
        color: isDark ? AppColors.cardDark : context.cardColor2,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : context.outlineColor,
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
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 13,
                color: context.textSecondaryColor,
              ),
            ),
      trailing: Icon(
        Icons.chevron_right_rounded,
        color: context.textTertiaryColor,
      ),
    );
  }
}

class _LogoutTile extends StatelessWidget {
  const _LogoutTile({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      leading: const Icon(Icons.logout_rounded, color: AppColors.error),
      title: const Text(
        'Cerrar sesión',
        style: TextStyle(
          fontFamily: 'Inter',
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: AppColors.error,
        ),
      ),
    );
  }
}

/// Hoja "Invita y gana": código de referido propio, canje de código ajeno
/// y cupones personales vigentes (GET /client/promos).
class _PromosSheet extends ConsumerStatefulWidget {
  const _PromosSheet();

  @override
  ConsumerState<_PromosSheet> createState() => _PromosSheetState();
}

class _PromosSheetState extends ConsumerState<_PromosSheet> {
  final _codeController = TextEditingController();
  Map<String, dynamic>? _data;
  String? _error;
  bool _redeeming = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final res = await ref
          .read(apiClientProvider)
          .get<Map<String, dynamic>>('/client/promos');
      if (!mounted) return;
      setState(() => _data = res.data?['data'] as Map<String, dynamic>?);
    } on DioException {
      if (!mounted) return;
      setState(() => _error = 'No se pudieron cargar tus promociones');
    }
  }

  Future<void> _redeemReferral() async {
    final code = _codeController.text.trim();
    if (code.isEmpty || _redeeming) return;
    setState(() => _redeeming = true);
    try {
      await ref.read(apiClientProvider).post<Map<String, dynamic>>(
        '/client/promos/redeem-referral',
        data: {'code': code},
      );
      if (!mounted) return;
      AppSnackbar.showSuccess(context, '¡Código canjeado! Revisa tus cupones.');
      _codeController.clear();
      await _load();
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = (e.response?.data as Map?)?['error'] as String? ??
          'No se pudo canjear el código';
      AppSnackbar.showError(context, msg);
    } finally {
      if (mounted) setState(() => _redeeming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    final coupons =
        (data?['coupons'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final referralCode = data?['referralCode'] as String?;
    final reward = (data?['referralRewardCop'] as num?)?.toDouble() ?? 0;
    final alreadyReferred = data?['alreadyReferred'] == true;

    return Padding(
      padding: EdgeInsets.only(
        left: AppConstants.spacingM,
        right: AppConstants.spacingM,
        top: AppConstants.spacingM,
        bottom:
            MediaQuery.of(context).viewInsets.bottom + AppConstants.spacingL,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Invita y gana',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: AppColors.error))
          else if (data == null)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(AppConstants.spacingL),
                child: CircularProgressIndicator(),
              ),
            )
          else ...[
            Text(
              'Comparte tu código: cuando un amigo lo canjee, ambos reciben '
              'un cupón de ${CurrencyFormatter.format(reward)}.',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 13,
                color: context.textSecondaryColor,
              ),
            ),
            const SizedBox(height: AppConstants.spacingM),
            if (referralCode != null)
              InkWell(
                onTap: () {
                  Clipboard.setData(ClipboardData(text: referralCode));
                  AppSnackbar.showSuccess(context, 'Código copiado');
                },
                borderRadius:
                    BorderRadius.circular(AppConstants.radiusMedium),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(AppConstants.spacingM),
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer,
                    borderRadius:
                        BorderRadius.circular(AppConstants.radiusMedium),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        referralCode,
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.5,
                          color: AppColors.primaryDim,
                        ),
                      ),
                      const Icon(Icons.copy_rounded,
                          color: AppColors.primaryDim),
                    ],
                  ),
                ),
              ),
            if (!alreadyReferred) ...[
              const SizedBox(height: AppConstants.spacingM),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _codeController,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        hintText: '¿Te invitaron? Ingresa el código',
                      ),
                      onSubmitted: (_) => _redeemReferral(),
                    ),
                  ),
                  const SizedBox(width: AppConstants.spacingS),
                  SizedBox(
                    height: 48,
                    child: OutlinedButton(
                      onPressed: _redeeming ? null : _redeemReferral,
                      child: _redeeming
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Canjear'),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: AppConstants.spacingL),
            const Text(
              'Mis cupones',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: AppConstants.spacingS),
            if (coupons.isEmpty)
              Text(
                'Aún no tienes cupones. Invita a un amigo para ganar el primero.',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 13,
                  color: context.textSecondaryColor,
                ),
              )
            else
              ...coupons.map((c) {
                final isPercent = c['type'] == 'PERCENT';
                final value = (c['value'] as num?)?.toDouble() ?? 0;
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.local_offer_rounded,
                      color: AppColors.primary),
                  title: Text(
                    c['code'] as String? ?? '',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  subtitle: Text(
                    (c['description'] as String?) ?? 'Cupón de descuento',
                    style: const TextStyle(fontFamily: 'Inter', fontSize: 12),
                  ),
                  trailing: Text(
                    isPercent
                        ? '${value.toStringAsFixed(0)}%'
                        : '-${CurrencyFormatter.format(value)}',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontWeight: FontWeight.w800,
                      color: AppColors.primary,
                    ),
                  ),
                );
              }),
          ],
        ],
      ),
    );
  }
}

class _DarkModeTile extends ConsumerWidget {
  const _DarkModeTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SwitchListTile(
      value: ref.watch(themeProvider) == ThemeMode.dark,
      onChanged: (v) => ref.read(themeProvider.notifier).setDark(dark: v),
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
      subtitle: const Text('Tema oscuro en toda la app'),
    );
  }
}
