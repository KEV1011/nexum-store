import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/core/widgets/loading_overlay.dart';
import 'package:nexum_client/features/auth/presentation/providers/auth_provider.dart';

/// Pantalla de ingreso del número de celular del cliente.
///
/// Flujo: número → [AuthNotifier.sendOtp] → navega a /otp.
class PhoneInputScreen extends ConsumerStatefulWidget {
  const PhoneInputScreen({super.key});

  @override
  ConsumerState<PhoneInputScreen> createState() => _PhoneInputScreenState();
}

class _PhoneInputScreenState extends ConsumerState<PhoneInputScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _phoneFocusNode = FocusNode();

  String get _fullPhone {
    final raw = _phoneController.text.replaceAll(' ', '');
    return '+57$raw';
  }

  @override
  void initState() {
    super.initState();
    // Repinta al escribir (habilitar el botón) y al enfocar (borde activo).
    _phoneController.addListener(_onChanged);
    _phoneFocusNode.addListener(_onChanged);
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _phoneFocusNode.dispose();
    super.dispose();
  }

  Future<void> _onContinue() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    _phoneFocusNode.unfocus();
    await ref.read(authProvider.notifier).sendOtp(_fullPhone);
  }

  void _handleAuthState(AuthState? _, AuthState current) {
    if (!mounted) return;
    if (current is AuthOtpSent) {
      context.push(AppRoutes.otp, extra: current.phone);
    } else if (current is AuthError) {
      AppSnackbar.showError(context, current.failure.message);
    }
  }

  String? _validatePhone(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Ingresa tu número de celular';
    }
    final digits = value.replaceAll(' ', '');
    if (digits.length < 10) return 'El número debe tener 10 dígitos';
    if (!digits.startsWith('3')) return 'El número debe empezar con 3';
    return null;
  }

  bool get _isValid {
    final d = _phoneController.text.replaceAll(' ', '');
    return d.length == 10 && d.startsWith('3');
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authProvider, _handleAuthState);

    final isLoading = ref.watch(authProvider) is AuthLoading;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final surface = isDark ? AppColors.cardDark : context.surfaceColor;
    final outline = isDark ? AppColors.outlineDark : context.outlineColor;

    return LoadingOverlay(
      isLoading: isLoading,
      child: Scaffold(
        backgroundColor:
            isDark ? AppColors.backgroundDark : context.backgroundColor,
        body: GestureDetector(
          onTap: () => FocusScope.of(context).unfocus(),
          behavior: HitTestBehavior.opaque,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── Hero de marca ──────────────────────────────────────────
                _BrandHero(),

                // ── Formulario ─────────────────────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppConstants.spacingL,
                    AppConstants.spacingXL,
                    AppConstants.spacingL,
                    AppConstants.spacingL,
                  ),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'Ingresa tu celular',
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.5,
                          ),
                        ),
                        const SizedBox(height: AppConstants.spacingXS),
                        Text(
                          'Te enviaremos un código por SMS para verificar '
                          'tu cuenta.',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: context.textSecondaryColor,
                            height: 1.45,
                          ),
                        ),
                        const SizedBox(height: AppConstants.spacingXL),

                        // Etiqueta
                        Text(
                          'NÚMERO DE CELULAR',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: context.textTertiaryColor,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8,
                          ),
                        ),
                        const SizedBox(height: AppConstants.spacingS),

                        // Campo
                        Container(
                          decoration: BoxDecoration(
                            color: surface,
                            borderRadius: BorderRadius.circular(
                              AppConstants.radiusLarge,
                            ),
                            border: Border.all(
                              color: _phoneFocusNode.hasFocus
                                  ? AppColors.primary
                                  : outline,
                              width: _phoneFocusNode.hasFocus ? 1.6 : 1,
                            ),
                          ),
                          child: Row(
                            children: [
                              const Padding(
                                padding: EdgeInsets.symmetric(
                                  horizontal: AppConstants.spacingM,
                                ),
                                child: Text(
                                  '🇨🇴 +57',
                                  style: TextStyle(
                                    fontFamily: 'Inter',
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              Container(width: 1, height: 28, color: outline),
                              Expanded(
                                child: TextFormField(
                                  controller: _phoneController,
                                  focusNode: _phoneFocusNode,
                                  keyboardType: TextInputType.phone,
                                  autofocus: true,
                                  inputFormatters: [
                                    FilteringTextInputFormatter.digitsOnly,
                                    LengthLimitingTextInputFormatter(10),
                                  ],
                                  style: const TextStyle(
                                    fontFamily: 'Inter',
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 1.5,
                                  ),
                                  decoration: const InputDecoration(
                                    hintText: '300 123 4567',
                                    border: InputBorder.none,
                                    filled: false,
                                    errorStyle: TextStyle(height: 0.9),
                                    contentPadding: EdgeInsets.symmetric(
                                      horizontal: AppConstants.spacingM,
                                      vertical: AppConstants.spacingM + 2,
                                    ),
                                  ),
                                  validator: _validatePhone,
                                  onFieldSubmitted: (_) => _onContinue(),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: AppConstants.spacingXL),

                        // CTA
                        SizedBox(
                          height: AppConstants.minTouchTarget + 10,
                          child: ElevatedButton(
                            onPressed:
                                (isLoading || !_isValid) ? null : _onContinue,
                            style: ElevatedButton.styleFrom(
                              elevation: _isValid ? 2 : 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(
                                  AppConstants.radiusLarge,
                                ),
                              ),
                            ),
                            child: const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  'Continuar',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                  ),
                                ),
                                SizedBox(width: 8),
                                Icon(Icons.arrow_forward_rounded, size: 20),
                              ],
                            ),
                          ),
                        ),

                        const SizedBox(height: AppConstants.spacingL),
                        Text(
                          'Al continuar aceptas nuestros Términos y la '
                          'Política de privacidad.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: context.textTertiaryColor,
                            height: 1.4,
                          ),
                        ),

                        // Pista de demo — solo builds de desarrollo.
                        if (kDebugMode) ...[
                          const SizedBox(height: AppConstants.spacingM),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppConstants.spacingM,
                              vertical: AppConstants.spacingS,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer
                                  .withValues(alpha: 0.5),
                              borderRadius: BorderRadius.circular(
                                AppConstants.radiusMedium,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.info_outline_rounded,
                                  size: 15,
                                  color: AppColors.primary,
                                ),
                                const SizedBox(width: 6),
                                Flexible(
                                  child: Text(
                                    'Demo: cualquier número · código 123456',
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      color: AppColors.primary,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Cabecera de marca con degradado: logo + nombre + tagline.
class _BrandHero extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(
        AppConstants.spacingL,
        media.padding.top + AppConstants.spacingXL,
        AppConstants.spacingL,
        AppConstants.spacingXL + 4,
      ),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.primary,
            AppColors.primary.withValues(alpha: 0.82),
          ],
        ),
        borderRadius: const BorderRadius.vertical(
          bottom: Radius.circular(32),
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.30),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
              border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
            ),
            child: const Icon(
              Icons.bolt_rounded,
              color: Colors.white,
              size: 34,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          const Text(
            'ZIPA',
            style: TextStyle(
              fontFamily: 'Inter',
              color: Colors.white,
              fontSize: 32,
              fontWeight: FontWeight.w900,
              letterSpacing: -1,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Viajes, mandados y domicilios en tu ciudad',
            style: TextStyle(
              fontFamily: 'Inter',
              color: Colors.white.withValues(alpha: 0.92),
              fontSize: 14.5,
              height: 1.3,
            ),
          ),
        ],
      ),
    );
  }
}
