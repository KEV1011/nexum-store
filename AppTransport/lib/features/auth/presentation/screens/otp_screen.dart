import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/auth/presentation/providers/auth_provider.dart';
import 'package:nexum_driver/features/auth/presentation/widgets/otp_input_field.dart';

/// Pantalla de verificación de código OTP.
///
/// Recibe el [phone] como `extra` del GoRouter, pasado desde [PhoneInputScreen].
///
/// Flujo:
/// 1. Usuario ingresa los 6 dígitos en las cajas individuales.
/// 2. Al completar el 6° dígito se auto-envía la verificación.
/// 3. Éxito → navega a `/home` reemplazando toda la pila con [context.go].
/// 4. Error → animación de sacudida en las cajas + SnackBar de error.
/// 5. "Reenviar código" disponible tras una cuenta regresiva de 60 s.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({required this.phone, super.key});

  /// Número de teléfono con prefijo (+57 3XX XXX XXXX).
  final String phone;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen>
    with SingleTickerProviderStateMixin {
  // ── OTP controllers & focus ────────────────────────────────────────────────

  final List<TextEditingController> _controllers = List.generate(
    AppConstants.otpLength,
    (_) => TextEditingController(),
  );
  final List<FocusNode> _focusNodes = List.generate(
    AppConstants.otpLength,
    (_) => FocusNode(),
  );

  bool _hasError = false;

  String get _otpCode => _controllers.map((c) => c.text).join();
  bool get _isComplete => _otpCode.length == AppConstants.otpLength;

  // ── Shake animation ────────────────────────────────────────────────────────

  late final AnimationController _shakeController;
  late final Animation<double> _shakeAnimation;

  // ── Resend countdown ───────────────────────────────────────────────────────

  int _resendSeconds = AppConstants.otpTimeoutSeconds;
  Timer? _resendTimer;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();

    _shakeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _shakeAnimation = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: -8.0), weight: 1),
      TweenSequenceItem(tween: Tween(begin: -8.0, end: 8.0), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 8.0, end: -6.0), weight: 2),
      TweenSequenceItem(tween: Tween(begin: -6.0, end: 6.0), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 6.0, end: 0.0), weight: 1),
    ]).animate(CurvedAnimation(
      parent: _shakeController,
      curve: Curves.easeInOut,
    ));

    _startResendTimer();
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    _shakeController.dispose();
    _resendTimer?.cancel();
    super.dispose();
  }

  // ── Resend timer ───────────────────────────────────────────────────────────

  void _startResendTimer() {
    _resendTimer?.cancel();
    setState(() => _resendSeconds = AppConstants.otpTimeoutSeconds);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_resendSeconds <= 1) {
        t.cancel();
        setState(() => _resendSeconds = 0);
      } else {
        setState(() => _resendSeconds--);
      }
    });
  }

  Future<void> _onResend() async {
    _clearOtp();
    _startResendTimer();
    await ref.read(authProvider.notifier).sendOtp(widget.phone);
    if (mounted) {
      AppSnackbar.showInfo(context, 'Código reenviado a ${widget.phone}');
    }
  }

  // ── OTP helpers ────────────────────────────────────────────────────────────

  void _clearOtp() {
    for (final c in _controllers) {
      c.clear();
    }
    setState(() => _hasError = false);
    _focusNodes[0].requestFocus();
  }

  /// Called by [OtpInputField] when a digit is entered in box [index].
  void _onDigitEntered(int index, String value) {
    setState(() {});
    if (value.isNotEmpty && index < AppConstants.otpLength - 1) {
      _focusNodes[index + 1].requestFocus();
    }
    // Auto-submit when the last digit is entered
    if (index == AppConstants.otpLength - 1 && value.isNotEmpty) {
      // Delay slightly so the last char is drawn before the overlay appears
      Future.microtask(_onVerify);
    }
  }

  /// Called by [OtpInputField] on backspace in an empty box.
  void _onBackspace(int index) {
    if (index > 0) {
      _controllers[index - 1].clear();
      _focusNodes[index - 1].requestFocus();
      setState(() {});
    }
  }

  // ── Verify handler ─────────────────────────────────────────────────────────

  Future<void> _onVerify() async {
    if (!_isComplete) return;
    FocusScope.of(context).unfocus();
    await ref.read(authProvider.notifier).verifyOtp(widget.phone, _otpCode);
  }

  // ── Auth state listener ────────────────────────────────────────────────────

  void _handleAuthState(AuthState? previous, AuthState current) {
    if (!mounted) return;

    if (current is AuthAuthenticated) {
      context.go('/home');
      return;
    }

    if (current is AuthRegistrationRequired) {
      context.go(
        '/register?phone=${Uri.encodeComponent(current.phone)}',
      );
      return;
    }

    if (current is AuthError) {
      setState(() => _hasError = true);
      _shakeController.forward(from: 0);
      AppSnackbar.showError(context, current.failure.message);
      // Clear boxes and allow retry after the shake settles
      Future.delayed(AppConstants.longAnimation, _clearOtp);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authProvider, _handleAuthState);

    final authState = ref.watch(authProvider);
    final isLoading = authState is AuthLoading;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor:
          isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      appBar: AppBar(
        title: const Text('Verificar código'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor:
            isDark ? AppColors.textOnDark : AppColors.textPrimary,
        leading: BackButton(
          color: isDark ? AppColors.textOnDark : AppColors.textPrimary,
          onPressed: () => context.pop(),
        ),
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const SizedBox(height: AppConstants.spacingXXL),

                // ── Icon ───────────────────────────────────────────────
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.security_rounded,
                    color: AppColors.primary,
                    size: 36,
                  ),
                ),

                const SizedBox(height: AppConstants.spacingL),

                // ── Title ──────────────────────────────────────────────
                Text(
                  'Código de verificación',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color:
                        isDark ? AppColors.textOnDark : AppColors.textPrimary,
                  ),
                  textAlign: TextAlign.center,
                ),

                const SizedBox(height: AppConstants.spacingS),

                // ── Subtitle ───────────────────────────────────────────
                RichText(
                  textAlign: TextAlign.center,
                  text: TextSpan(
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                    children: [
                      const TextSpan(
                          text:
                              'Ingresa el código de 6 dígitos\nenviado a '),
                      TextSpan(
                        text: widget.phone,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppColors.secondary,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: AppConstants.spacingXXL),

                // ── OTP Boxes ──────────────────────────────────────────
                AnimatedBuilder(
                  animation: _shakeAnimation,
                  builder: (context, child) => Transform.translate(
                    offset: Offset(_shakeAnimation.value, 0),
                    child: child,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      AppConstants.otpLength,
                      (index) => Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppConstants.spacingXS,
                        ),
                        child: OtpInputField(
                          controller: _controllers[index],
                          focusNode: _focusNodes[index],
                          hasError: _hasError,
                          enabled: !isLoading,
                          onChanged: (value) =>
                              _onDigitEntered(index, value),
                          onBackspace: () => _onBackspace(index),
                        ),
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: AppConstants.spacingM),

                // ── Test hint ──────────────────────────────────────────
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppConstants.spacingM,
                    vertical: AppConstants.spacingS,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.08),
                    borderRadius:
                        BorderRadius.circular(AppConstants.radiusSmall),
                    border: Border.all(
                      color: AppColors.primary.withOpacity(0.3),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.info_outline_rounded,
                        color: AppColors.primary,
                        size: 16,
                      ),
                      const SizedBox(width: AppConstants.spacingXS),
                      Text(
                        'Código de prueba: ${AppConstants.mockOtpCode}',
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: AppConstants.spacingXXL),

                // ── Verify button ──────────────────────────────────────
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: (_isComplete && !isLoading) ? _onVerify : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      disabledBackgroundColor:
                          AppColors.primary.withOpacity(0.4),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(
                          AppConstants.radiusMedium,
                        ),
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
                            'Verificar',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                            ),
                          ),
                  ),
                ),

                const SizedBox(height: AppConstants.spacingL),

                // ── Resend section ─────────────────────────────────────
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      '¿No recibiste el código? ',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    if (_resendSeconds > 0)
                      Text(
                        'Reenviar en ${_resendSeconds}s',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.textSecondary,
                          fontWeight: FontWeight.w600,
                        ),
                      )
                    else
                      GestureDetector(
                        onTap: isLoading ? null : _onResend,
                        child: Text(
                          'Reenviar código',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: isLoading
                                ? AppColors.textSecondary
                                : AppColors.primary,
                            fontWeight: FontWeight.w700,
                            decoration: TextDecoration.underline,
                            decorationColor: AppColors.primary,
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
