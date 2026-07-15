import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/core/widgets/loading_overlay.dart';
import 'package:nexum_client/features/auth/presentation/providers/auth_provider.dart';
import 'package:nexum_client/features/auth/presentation/widgets/otp_input_field.dart';

/// Pantalla de verificación del código OTP (6 dígitos).
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({required this.phone, super.key});

  final String phone;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen>
    with SingleTickerProviderStateMixin {
  final List<TextEditingController> _controllers =
      List.generate(AppConstants.otpLength, (_) => TextEditingController());
  final List<FocusNode> _focusNodes =
      List.generate(AppConstants.otpLength, (_) => FocusNode());

  bool _hasError = false;

  String get _otpCode => _controllers.map((c) => c.text).join();
  bool get _isComplete => _otpCode.length == AppConstants.otpLength;

  late final AnimationController _shakeCtrl;
  late final Animation<double> _shakeAnim;

  int _resendSeconds = AppConstants.otpTimeoutSeconds;
  Timer? _resendTimer;

  @override
  void initState() {
    super.initState();
    _shakeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _shakeAnim = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0, end: -8), weight: 1),
      TweenSequenceItem(tween: Tween(begin: -8, end: 8), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 8, end: -6), weight: 2),
      TweenSequenceItem(tween: Tween(begin: -6, end: 6), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 6, end: 0), weight: 1),
    ]).animate(CurvedAnimation(parent: _shakeCtrl, curve: Curves.easeInOut));
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
    _shakeCtrl.dispose();
    _resendTimer?.cancel();
    super.dispose();
  }

  void _startResendTimer() {
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_resendSeconds <= 1) {
        t.cancel();
        if (mounted) setState(() => _resendSeconds = 0);
        return;
      }
      if (mounted) setState(() => _resendSeconds--);
    });
  }

  void _onDigitChanged(int index, String value) {
    if (value.isNotEmpty && index < AppConstants.otpLength - 1) {
      _focusNodes[index + 1].requestFocus();
    }
    if (_isComplete) _verify();
    setState(() => _hasError = false);
  }

  void _onBackspace(int index) {
    if (index > 0) _focusNodes[index - 1].requestFocus();
  }

  Future<void> _verify() async {
    if (!_isComplete) return;
    FocusScope.of(context).unfocus();
    await ref
        .read(authProvider.notifier)
        .verifyOtp(widget.phone, _otpCode);
  }

  Future<void> _resend() async {
    if (_resendSeconds > 0) return;
    for (final c in _controllers) {
      c.clear();
    }
    _focusNodes.first.requestFocus();
    setState(() {
      _resendSeconds = AppConstants.otpTimeoutSeconds;
      _hasError = false;
    });
    _startResendTimer();
    await ref.read(authProvider.notifier).sendOtp(widget.phone);
    if (mounted) AppSnackbar.showInfo(context, 'Código reenviado');
  }

  void _handleAuthState(AuthState? _, AuthState current) {
    if (!mounted) return;
    if (current is AuthAuthenticated) {
      context.go(AppRoutes.home);
    } else if (current is AuthError) {
      setState(() => _hasError = true);
      _shakeCtrl
        ..reset()
        ..forward();
      AppSnackbar.showError(context, current.failure.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authProvider, _handleAuthState);

    final isLoading = ref.watch(authProvider) is AuthLoading;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return LoadingOverlay(
      isLoading: isLoading,
      child: Scaffold(
        backgroundColor:
            isDark ? AppColors.backgroundDark : context.backgroundColor,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          title: const Text('Verificación'),
        ),
        body: SafeArea(
          child: GestureDetector(
            onTap: () => FocusScope.of(context).unfocus(),
            behavior: HitTestBehavior.opaque,
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingL,
                vertical: AppConstants.spacingM,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Icono de marca
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer,
                      borderRadius:
                          BorderRadius.circular(AppConstants.radiusXLarge),
                    ),
                    child: const Icon(
                      Icons.sms_outlined,
                      size: 32,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingL),
                  Text(
                    'Verifica tu número',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingXS),
                  Text.rich(
                    TextSpan(
                      text: 'Ingresa el código de 6 dígitos que enviamos al ',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: context.textSecondaryColor,
                        height: 1.45,
                      ),
                      children: [
                        TextSpan(
                          text: widget.phone,
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: context.textPrimaryColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 6),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      onPressed: () => safeBack(context, fallback: AppRoutes.login),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: const Text('Cambiar número'),
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingXL),
                  AnimatedBuilder(
                    animation: _shakeAnim,
                    builder: (context, child) => Transform.translate(
                      offset: Offset(_shakeAnim.value, 0),
                      child: child,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: List.generate(
                        AppConstants.otpLength,
                        (i) => OtpInputField(
                          controller: _controllers[i],
                          focusNode: _focusNodes[i],
                          hasError: _hasError,
                          enabled: !isLoading,
                          onChanged: (v) => _onDigitChanged(i, v),
                          onBackspace: () => _onBackspace(i),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingXL),
                  SizedBox(
                    height: AppConstants.minTouchTarget + 10,
                    child: ElevatedButton(
                      onPressed: (isLoading || !_isComplete) ? null : _verify,
                      style: ElevatedButton.styleFrom(
                        elevation: _isComplete ? 2 : 0,
                        shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(AppConstants.radiusLarge),
                        ),
                      ),
                      child: const Text(
                        'Verificar',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingM),
                  Center(
                    child: _resendSeconds > 0
                        ? Text(
                            'Reenviar código en $_resendSeconds s',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: context.textSecondaryColor,
                            ),
                          )
                        : TextButton.icon(
                            onPressed: _resend,
                            icon: const Icon(Icons.refresh_rounded, size: 18),
                            label: const Text('Reenviar código'),
                          ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
