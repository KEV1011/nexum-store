import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/theme_provider.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/addresses/presentation/providers/'
    'addresses_provider.dart';
import 'package:nexum_client/features/auth/domain/entities/client_entity.dart';
import 'package:nexum_client/features/auth/presentation/providers/auth_provider.dart';

/// Pestaña "Cuenta": perfil del cliente y preferencias.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeNotifier = ref.read(themeProvider.notifier);
    final isDark = ref.watch(themeProvider) == ThemeMode.dark;
    final client = ref.watch(currentClientProvider);

    ref.listen(authProvider, (_, next) {
      if (next is AuthUnauthenticated) context.go(AppRoutes.login);
    });

    return Scaffold(
      appBar: AppBar(title: const Text('Mi cuenta')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
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
                subtitle: 'Efectivo, tarjeta, Nequi',
                onTap: () => AppSnackbar.showInfo(
                  context,
                  'Métodos de pago próximamente',
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

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.client});

  final ClientEntity? client;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        CircleAvatar(
          radius: 32,
          backgroundColor: AppColors.primaryContainer,
          child: Text(
            _initial,
            style: const TextStyle(
              fontFamily: 'Inter',
              fontSize: 24,
              fontWeight: FontWeight.w700,
              color: AppColors.primaryDim,
            ),
          ),
        ),
        const SizedBox(width: AppConstants.spacingM),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              client?.name ?? 'Cliente Nexum',
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              client?.phone ?? '',
              style: const TextStyle(
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

  String get _initial {
    final name = client?.name ?? 'C';
    return name.isNotEmpty ? name[0].toUpperCase() : 'C';
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
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 13,
                color: AppColors.textSecondary,
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
              const Text(
                'Aún no tienes cupones. Invita a un amigo para ganar el primero.',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 13,
                  color: AppColors.textSecondary,
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
