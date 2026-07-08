import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/core/widgets/loading_overlay.dart';
import 'package:nexum_driver/features/auth/presentation/providers/auth_provider.dart';

/// Pantalla de ingreso del número de celular del conductor.
///
/// Flujo:
/// 1. El conductor escribe su número colombiano (3XX XXX XXXX).
/// 2. Al pulsar "Continuar" se invoca [AuthNotifier.sendOtp].
/// 3. Si el OTP se envía correctamente navega a `/otp` pasando el phone
///    como extra de GoRouter.
/// 4. En caso de error muestra un [SnackBar] estilizado via [AppSnackbar].
class PhoneInputScreen extends ConsumerStatefulWidget {
  const PhoneInputScreen({super.key});

  @override
  ConsumerState<PhoneInputScreen> createState() => _PhoneInputScreenState();
}

class _PhoneInputScreenState extends ConsumerState<PhoneInputScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _phoneFocusNode = FocusNode();

  /// Número completo con prefijo colombiano, listo para enviar al use case.
  String get _fullPhone {
    final raw = _phoneController.text.replaceAll(' ', '');
    return '+57$raw';
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _phoneFocusNode.dispose();
    super.dispose();
  }

  // ── OTP send handler ───────────────────────────────────────────────────────

  Future<void> _onContinue() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    _phoneFocusNode.unfocus();
    await ref.read(authProvider.notifier).sendOtp(_fullPhone);
  }

  // ── Auth state listener ────────────────────────────────────────────────────

  void _handleAuthState(AuthState? previous, AuthState current) {
    if (!mounted) return;

    if (current is AuthOtpSent) {
      // Navigate to OTP screen passing the full normalized phone as extra
      context.push('/otp', extra: current.phone);
      return;
    }

    if (current is AuthError) {
      AppSnackbar.showError(context, current.failure.message);
    }
  }

  // ── Validators ─────────────────────────────────────────────────────────────

  String? _validatePhone(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Ingresa tu número de celular';
    }
    final digits = value.replaceAll(' ', '');
    if (digits.length < 10) {
      return 'El número debe tener 10 dígitos';
    }
    if (!digits.startsWith('3')) {
      return 'El número debe empezar con 3';
    }
    return null;
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authProvider, _handleAuthState);

    final authState = ref.watch(authProvider);
    final isLoading = authState is AuthLoading;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return LoadingOverlay(
      isLoading: isLoading,
      child: Scaffold(
        backgroundColor:
            isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
        appBar: AppBar(
          title: const Text('Iniciar sesión'),
          backgroundColor: Colors.transparent,
          elevation: 0,
          foregroundColor:
              isDark ? AppColors.textOnDark : AppColors.textPrimary,
        ),
        body: SafeArea(
          child: GestureDetector(
            onTap: () => FocusScope.of(context).unfocus(),
            behavior: HitTestBehavior.opaque,
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingL,
                vertical: AppConstants.spacingXL,
              ),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: AppConstants.spacingXXL),

                    // ── Logo ─────────────────────────────────────────────
                    Center(child: _NexumDriverLogo()),

                    const SizedBox(height: AppConstants.spacingXXL),

                    // ── Title ────────────────────────────────────────────
                    Text(
                      'Ingresa tu número de celular',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: isDark
                            ? AppColors.textOnDark
                            : AppColors.textPrimary,
                      ),
                      textAlign: TextAlign.center,
                    ),

                    const SizedBox(height: AppConstants.spacingS),

                    // ── Subtitle ─────────────────────────────────────────
                    Text(
                      'Te enviaremos un código de verificación',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                      textAlign: TextAlign.center,
                    ),

                    const SizedBox(height: AppConstants.spacingXXL),

                    // ── Phone field ───────────────────────────────────────
                    _PhoneTextField(
                      controller: _phoneController,
                      focusNode: _phoneFocusNode,
                      enabled: !isLoading,
                      onSubmitted: (_) => _onContinue(),
                      validator: _validatePhone,
                    ),

                    // ── Demo hint (solo builds de desarrollo) ─────────────
                    if (kDebugMode) ...[
                      const SizedBox(height: AppConstants.spacingS),
                      Text(
                        'Demo: usa ${AppConstants.mockDriverPhone}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],

                    const SizedBox(height: AppConstants.spacingXL),

                    // ── Continue button ───────────────────────────────────
                    _ContinueButton(
                      isLoading: isLoading,
                      onPressed: isLoading ? null : _onContinue,
                    ),

                    const SizedBox(height: AppConstants.spacingXL),

                    // ── Terms disclaimer ──────────────────────────────────
                    Text(
                      'Al continuar aceptas los Términos y Condiciones y la\nPolítica de Privacidad de Nexum.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _NexumDriverLogo extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppConstants.spacingL,
        vertical: AppConstants.spacingXL,
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
        borderRadius: BorderRadius.circular(AppConstants.radiusXLarge),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.30),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        children: [
          Container(
            width: 66,
            height: 66,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
              border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
            ),
            child: const Icon(
              Icons.local_taxi_rounded,
              color: Colors.white,
              size: 38,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          const Text(
            'Nexum Conductor',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 24,
              fontWeight: FontWeight.w900,
              color: Colors.white,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: AppConstants.spacingXS),
          Text(
            'Conduce y gana en Pamplona',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 13.5,
              color: Colors.white.withValues(alpha: 0.92),
            ),
          ),
        ],
      ),
    );
  }
}

class _PhoneTextField extends StatelessWidget {
  const _PhoneTextField({
    required this.controller,
    required this.focusNode,
    required this.enabled,
    required this.onSubmitted,
    required this.validator,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool enabled;
  final ValueChanged<String> onSubmitted;
  final FormFieldValidator<String> validator;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return TextFormField(
      controller: controller,
      focusNode: focusNode,
      enabled: enabled,
      keyboardType: TextInputType.phone,
      textInputAction: TextInputAction.done,
      onFieldSubmitted: onSubmitted,
      inputFormatters: [
        FilteringTextInputFormatter.digitsOnly,
        _ColombianPhoneFormatter(),
      ],
      style: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        letterSpacing: 1.5,
        color: isDark ? AppColors.textOnDark : AppColors.textPrimary,
      ),
      decoration: InputDecoration(
        prefixIcon: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppConstants.spacingM,
            vertical: AppConstants.spacingS + 2,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🇨🇴', style: TextStyle(fontSize: 20)),
              const SizedBox(width: AppConstants.spacingS),
              Text(
                '+57',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: isDark
                      ? AppColors.textOnDark
                      : AppColors.textPrimary,
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
              Container(
                width: 1,
                height: 22,
                color: AppColors.divider,
              ),
            ],
          ),
        ),
        hintText: '3XX XXX XXXX',
        hintStyle: const TextStyle(
          color: AppColors.textSecondary,
          letterSpacing: 1.0,
        ),
        filled: true,
        fillColor: isDark ? AppColors.cardDark : AppColors.surfaceLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          borderSide: const BorderSide(color: AppColors.divider, width: 1.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          borderSide: const BorderSide(color: AppColors.error, width: 1.5),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          borderSide: const BorderSide(color: AppColors.error, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingM,
        ),
      ),
      validator: validator,
    );
  }
}

class _ContinueButton extends StatelessWidget {
  const _ContinueButton({
    required this.isLoading,
    required this.onPressed,
  });

  final bool isLoading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.primary.withOpacity(0.6),
          shape: RoundedRectangleBorder(
            borderRadius:
                BorderRadius.circular(AppConstants.radiusMedium),
          ),
          elevation: 2,
          shadowColor: const Color(0x4000C853),
        ),
        child: isLoading
            ? const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  color: Colors.white,
                  strokeWidth: 2.5,
                ),
              )
            : const Text(
                'Continuar',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
      ),
    );
  }
}

// ── Colombian phone number formatter ──────────────────────────────────────────

/// Formatea el número mientras el usuario escribe: `3XX XXX XXXX`.
/// Solo dígitos; espacios se insertan automáticamente en las posiciones 3 y 6.
class _ColombianPhoneFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(' ', '');
    // Limit to 10 digits (Colombian mobile numbers)
    final truncated =
        digits.length > 10 ? digits.substring(0, 10) : digits;

    final buffer = StringBuffer();
    for (int i = 0; i < truncated.length; i++) {
      if (i == 3 || i == 6) buffer.write(' ');
      buffer.write(truncated[i]);
    }

    final formatted = buffer.toString();
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
