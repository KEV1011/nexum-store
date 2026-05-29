import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
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

    return LoadingOverlay(
      isLoading: isLoading,
      child: Scaffold(
        appBar: AppBar(title: const Text('Verificar número')),
        body: SafeArea(
          child: GestureDetector(
            onTap: () => FocusScope.of(context).unfocus(),
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingL,
                vertical: AppConstants.spacingXL,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Código de verificación',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingS),
                  Text(
                    'Ingresaste el código enviado a ${widget.phone}',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 15,
                      color: AppColors.textSecondary,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingXXL),
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
                    height: AppConstants.minTouchTarget + 8,
                    child: ElevatedButton(
                      onPressed: (isLoading || !_isComplete) ? null : _verify,
                      child: const Text('Verificar'),
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingM),
                  Center(
                    child: _resendSeconds > 0
                        ? Text(
                            'Reenviar en $_resendSeconds s',
                            style: const TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 14,
                              color: AppColors.textSecondary,
                            ),
                          )
                        : TextButton(
                            onPressed: _resend,
                            child: const Text('Reenviar código'),
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
