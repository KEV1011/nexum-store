import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/auth/presentation/providers/auth_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ── Step enum ─────────────────────────────────────────────────────────────────

enum _Step { identifier, password }

// ── Input type detection ──────────────────────────────────────────────────────

enum _IdentifierType { phone, email, username }

_IdentifierType _detectType(String value) {
  if (value.contains('@')) return _IdentifierType.email;
  final digits = value.replaceAll(RegExp(r'\D'), '');
  if (digits.length >= 7) return _IdentifierType.phone;
  return _IdentifierType.username;
}

// ── Screen ────────────────────────────────────────────────────────────────────

class DriverLoginScreen extends ConsumerStatefulWidget {
  const DriverLoginScreen({super.key});

  @override
  ConsumerState<DriverLoginScreen> createState() => _DriverLoginScreenState();
}

class _DriverLoginScreenState extends ConsumerState<DriverLoginScreen>
    with TickerProviderStateMixin {
  final _identifierCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _identifierFocus = FocusNode();
  final _passwordFocus = FocusNode();

  _Step _step = _Step.identifier;
  _IdentifierType _idType = _IdentifierType.phone;
  bool _obscurePassword = true;
  bool _isBiometricLoading = false;
  bool _isLoading = false;
  bool _biometricAvailable = false;

  late final AnimationController _slideCtrl;
  late final Animation<Offset> _slideAnim;
  late final AnimationController _fadeCtrl;
  late final Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _slideCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 380),
    );
    _slideAnim = Tween<Offset>(
      begin: const Offset(1, 0),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _slideCtrl, curve: Curves.easeOutCubic));

    _fadeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 280),
    )..forward();
    _fadeAnim = CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut);

    _identifierCtrl.addListener(() {
      final detected = _detectType(_identifierCtrl.text);
      if (detected != _idType) {
        setState(() => _idType = detected);
      }
    });

    _checkBiometric();
  }

  @override
  void dispose() {
    _identifierCtrl.dispose();
    _passwordCtrl.dispose();
    _identifierFocus.dispose();
    _passwordFocus.dispose();
    _slideCtrl.dispose();
    _fadeCtrl.dispose();
    super.dispose();
  }

  Future<void> _checkBiometric() async {
    final prefs = await SharedPreferences.getInstance();
    final enabled = prefs.getBool('biometric_login_enabled') ?? false;
    if (mounted) setState(() => _biometricAvailable = enabled);
  }

  // ── Step navigation ────────────────────────────────────────────────────────

  Future<void> _goToPassword() async {
    final id = _identifierCtrl.text.trim();
    if (id.isEmpty) {
      AppSnackbar.showError(context, 'Ingresa tu usuario, correo o celular');
      return;
    }
    unawaited(HapticFeedback.selectionClick());
    setState(() => _step = _Step.password);
    await _slideCtrl.forward();
    _passwordFocus.requestFocus();
  }

  void _goBack() {
    HapticFeedback.selectionClick();
    _slideCtrl.reverse().then((_) {
      if (mounted) {
        setState(() {
          _step = _Step.identifier;
          _passwordCtrl.clear();
        });
        _identifierFocus.requestFocus();
      }
    });
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  Future<void> _login() async {
    final id = _identifierCtrl.text.trim();
    final pw = _passwordCtrl.text;
    if (pw.isEmpty) {
      AppSnackbar.showError(context, 'Ingresa tu contraseña o PIN');
      return;
    }
    unawaited(HapticFeedback.mediumImpact());
    setState(() => _isLoading = true);

    // For phone-based login delegate to existing OTP flow
    if (_idType == _IdentifierType.phone) {
      final phone = '+57${id.replaceAll(RegExp(r'\D'), '')}';
      await ref.read(authProvider.notifier).sendOtp(phone);
    } else {
      // Email/username: simulate credential check (mock — replace with real API)
      await Future<void>.delayed(const Duration(milliseconds: 900));
      if (mounted) {
        // Treat as unauthenticated in demo; adapt to real backend here
        AppSnackbar.showError(
          context,
          'Inicio con correo/usuario próximamente. Usa tu celular.',
        );
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _tryBiometric() async {
    unawaited(HapticFeedback.heavyImpact());
    setState(() => _isBiometricLoading = true);

    // Mock biometric: replace with local_auth in production
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;

    // In demo, re-use OTP flow with the stored mock phone
    await ref
        .read(authProvider.notifier)
        .sendOtp(AppConstants.mockDriverPhone.replaceAll(' ', ''));
    setState(() => _isBiometricLoading = false);
  }

  void _handleAuthState(AuthState? _, AuthState current) {
    if (!mounted) return;
    setState(() => _isLoading = false);

    if (current is AuthOtpSent) {
      context.push('/otp', extra: current.phone);
      return;
    }
    if (current is AuthAuthenticated) {
      context.go('/home');
      return;
    }
    if (current is AuthError) {
      AppSnackbar.showError(context, current.failure.message);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authProvider, _handleAuthState);
    final size = MediaQuery.sizeOf(context);
    final bottom = MediaQuery.of(context).padding.bottom;

    return Scaffold(
      backgroundColor: const Color(0xFF0F1117),
      resizeToAvoidBottomInset: false,
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        behavior: HitTestBehavior.opaque,
        child: Stack(
          children: [
            // ── Gradient background ───────────────────────────────────
            Positioned.fill(
              child: CustomPaint(painter: _BgPainter()),
            ),

            // ── Content ───────────────────────────────────────────────
            SafeArea(
              bottom: false,
              child: Column(
                children: [
                  // Back button (step 2 only)
                  AnimatedOpacity(
                    opacity: _step == _Step.password ? 1 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: Align(
                      alignment: Alignment.topLeft,
                      child: IconButton(
                        onPressed:
                            _step == _Step.password ? _goBack : null,
                        icon: const Icon(
                          Icons.arrow_back_rounded,
                          color: Colors.white70,
                        ),
                        padding: const EdgeInsets.all(AppConstants.spacingM),
                      ),
                    ),
                  ),

                  Expanded(
                    child: SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      padding: EdgeInsets.fromLTRB(
                        AppConstants.spacingL,
                        0,
                        AppConstants.spacingL,
                        bottom + AppConstants.spacingXL,
                      ),
                      child: FadeTransition(
                        opacity: _fadeAnim,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SizedBox(height: size.height * 0.07),
                            _buildLogo(),
                            SizedBox(height: size.height * 0.06),
                            _buildStepContent(),
                          ],
                        ),
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

  Widget _buildLogo() {
    return Column(
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF00C853), Color(0xFF1565C0)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(22),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.38),
                blurRadius: 24,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: const Icon(
            Icons.local_taxi_rounded,
            color: Colors.white,
            size: 38,
          ),
        ),
        const SizedBox(height: AppConstants.spacingM),
        const Text(
          'Nexum Driver',
          style: TextStyle(
            color: Colors.white,
            fontSize: 24,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.3,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Pamplona, Norte de Santander',
          style: TextStyle(
            color: Color(0xFF64748B),
            fontSize: 13,
          ),
        ),
      ],
    );
  }

  Widget _buildStepContent() {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 260),
      child: _step == _Step.identifier
          ? _buildIdentifierStep()
          : SlideTransition(
              position: _slideAnim,
              child: _buildPasswordStep(),
            ),
    );
  }

  // ── Step 1: Identifier ────────────────────────────────────────────────────

  Widget _buildIdentifierStep() {
    return Column(
      key: const ValueKey('identifier'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Bienvenido de vuelta',
          style: TextStyle(
            color: Colors.white,
            fontSize: 26,
            fontWeight: FontWeight.w800,
            height: 1.15,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          _idType == _IdentifierType.email
              ? 'Ingresa tu correo electrónico'
              : _idType == _IdentifierType.phone
                  ? 'Ingresa tu número de celular'
                  : 'Ingresa tu usuario, correo o celular',
          style: const TextStyle(
            color: Color(0xFF94A3B8),
            fontSize: 14,
          ),
        ),
        const SizedBox(height: AppConstants.spacingXL),
        _IdentifierField(
          controller: _identifierCtrl,
          focusNode: _identifierFocus,
          idType: _idType,
          onSubmitted: (_) => _goToPassword(),
        ),
        const SizedBox(height: AppConstants.spacingM),
        _GlowButton(
          label: 'Continuar',
          onTap: _goToPassword,
          isLoading: false,
        ),
        if (_biometricAvailable) ...[
          const SizedBox(height: AppConstants.spacingM),
          _BiometricButton(
            isLoading: _isBiometricLoading,
            onTap: _tryBiometric,
          ),
        ],
        const SizedBox(height: AppConstants.spacingXL),
        _TermsText(),
      ],
    );
  }

  // ── Step 2: Password ──────────────────────────────────────────────────────

  Widget _buildPasswordStep() {
    final id = _identifierCtrl.text.trim();
    final maskedId = id.length > 4
        ? '${id.substring(0, 3)}${'•' * (id.length - 4)}${id.substring(id.length - 1)}'
        : id;

    return Column(
      key: const ValueKey('password'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Ingresa tu contraseña',
          style: TextStyle(
            color: Colors.white,
            fontSize: 26,
            fontWeight: FontWeight.w800,
            height: 1.15,
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            const Icon(Icons.person_rounded, size: 14, color: Color(0xFF64748B)),
            const SizedBox(width: 4),
            Text(
              maskedId,
              style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
            ),
          ],
        ),
        const SizedBox(height: AppConstants.spacingXL),
        _PasswordField(
          controller: _passwordCtrl,
          focusNode: _passwordFocus,
          obscure: _obscurePassword,
          onToggleObscure: () =>
              setState(() => _obscurePassword = !_obscurePassword),
          onSubmitted: (_) => _login(),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () {},
            child: const Text(
              '¿Olvidaste tu contraseña?',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
            ),
          ),
        ),
        const SizedBox(height: AppConstants.spacingS),
        _GlowButton(
          label: 'Ingresar',
          onTap: _login,
          isLoading: _isLoading,
        ),
        if (_biometricAvailable) ...[
          const SizedBox(height: AppConstants.spacingM),
          _BiometricButton(
            isLoading: _isBiometricLoading,
            onTap: _tryBiometric,
          ),
        ],
      ],
    );
  }
}

// ── Identifier field ──────────────────────────────────────────────────────────

class _IdentifierField extends StatelessWidget {
  const _IdentifierField({
    required this.controller,
    required this.focusNode,
    required this.idType,
    required this.onSubmitted,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final _IdentifierType idType;
  final ValueChanged<String> onSubmitted;

  @override
  Widget build(BuildContext context) {
    final keyboard = switch (idType) {
      _IdentifierType.phone => TextInputType.phone,
      _IdentifierType.email => TextInputType.emailAddress,
      _IdentifierType.username => TextInputType.text,
    };

    return _GlassTextField(
      controller: controller,
      focusNode: focusNode,
      keyboardType: keyboard,
      hintText: 'Número, correo o usuario',
      prefixIcon: AnimatedSwitcher(
        duration: const Duration(milliseconds: 200),
        child: Icon(
          key: ValueKey(idType),
          switch (idType) {
            _IdentifierType.phone => Icons.phone_android_rounded,
            _IdentifierType.email => Icons.alternate_email_rounded,
            _IdentifierType.username => Icons.person_rounded,
          },
          color: AppColors.primary,
          size: 20,
        ),
      ),
      onSubmitted: onSubmitted,
    );
  }
}

// ── Password field ────────────────────────────────────────────────────────────

class _PasswordField extends StatelessWidget {
  const _PasswordField({
    required this.controller,
    required this.focusNode,
    required this.obscure,
    required this.onToggleObscure,
    required this.onSubmitted,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool obscure;
  final VoidCallback onToggleObscure;
  final ValueChanged<String> onSubmitted;

  @override
  Widget build(BuildContext context) {
    return _GlassTextField(
      controller: controller,
      focusNode: focusNode,
      keyboardType: TextInputType.visiblePassword,
      hintText: 'Contraseña o PIN',
      obscure: obscure,
      prefixIcon: const Icon(
        Icons.lock_rounded,
        color: AppColors.primary,
        size: 20,
      ),
      suffixIcon: IconButton(
        icon: Icon(
          obscure ? Icons.visibility_off_rounded : Icons.visibility_rounded,
          color: const Color(0xFF64748B),
          size: 20,
        ),
        onPressed: onToggleObscure,
      ),
      onSubmitted: onSubmitted,
    );
  }
}

// ── Glass text field ──────────────────────────────────────────────────────────

class _GlassTextField extends StatelessWidget {
  const _GlassTextField({
    required this.controller,
    required this.focusNode,
    required this.hintText,
    required this.onSubmitted,
    this.keyboardType = TextInputType.text,
    this.prefixIcon,
    this.suffixIcon,
    this.obscure = false,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final TextInputType keyboardType;
  final String hintText;
  final Widget? prefixIcon;
  final Widget? suffixIcon;
  final bool obscure;
  final ValueChanged<String> onSubmitted;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: TextField(
          controller: controller,
          focusNode: focusNode,
          keyboardType: keyboardType,
          textInputAction: TextInputAction.next,
          onSubmitted: onSubmitted,
          obscureText: obscure,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
          decoration: InputDecoration(
            hintText: hintText,
            hintStyle: const TextStyle(color: Color(0xFF475569), fontSize: 15),
            prefixIcon: prefixIcon != null
                ? Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    child: prefixIcon,
                  )
                : null,
            prefixIconConstraints:
                const BoxConstraints(minWidth: 48, minHeight: 48),
            suffixIcon: suffixIcon,
            filled: true,
            fillColor: const Color(0xFF1E2333),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
              borderSide: const BorderSide(
                color: Color(0xFF2E3347),
                width: 1.2,
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
              borderSide: const BorderSide(
                color: Color(0xFF2E3347),
                width: 1.2,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
              borderSide: const BorderSide(
                color: AppColors.primary,
                width: 1.8,
              ),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: AppConstants.spacingM,
              vertical: AppConstants.spacingM,
            ),
          ),
        ),
      ),
    );
  }
}

// ── Glow CTA button ───────────────────────────────────────────────────────────

class _GlowButton extends StatelessWidget {
  const _GlowButton({
    required this.label,
    required this.onTap,
    required this.isLoading,
  });

  final String label;
  final VoidCallback onTap;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isLoading ? null : onTap,
      child: Container(
        height: 54,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF00C853), Color(0xFF00963D)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withValues(alpha: 0.40),
              blurRadius: 20,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Center(
          child: isLoading
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    color: Colors.white,
                    strokeWidth: 2.5,
                  ),
                )
              : Text(
                  label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.3,
                  ),
                ),
        ),
      ),
    );
  }
}

// ── Biometric button ──────────────────────────────────────────────────────────

class _BiometricButton extends StatelessWidget {
  const _BiometricButton({required this.isLoading, required this.onTap});

  final bool isLoading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isLoading ? null : onTap,
      child: Container(
        height: 54,
        decoration: BoxDecoration(
          color: const Color(0xFF1A1D27),
          borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
          border: Border.all(
            color: const Color(0xFF2E3347),
            width: 1.2,
          ),
        ),
        child: Center(
          child: isLoading
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    color: AppColors.primary,
                    strokeWidth: 2.5,
                  ),
                )
              : const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.fingerprint_rounded,
                      color: AppColors.primary,
                      size: 24,
                    ),
                    SizedBox(width: 8),
                    Text(
                      'Entrar con Face ID / huella',
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

// ── Terms text ────────────────────────────────────────────────────────────────

class _TermsText extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return const Text(
      'Al continuar aceptas los Términos y Condiciones\ny la Política de Privacidad de Nexum.',
      style: TextStyle(
        color: Color(0xFF475569),
        fontSize: 11,
      ),
      textAlign: TextAlign.center,
    );
  }
}

// ── Background painter ────────────────────────────────────────────────────────

class _BgPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;

    // Deep dark base
    canvas.drawRect(
      Rect.fromLTWH(0, 0, size.width, size.height),
      paint..color = const Color(0xFF0F1117),
    );

    // Green glow top-left
    paint.shader = RadialGradient(
      colors: [
        const Color(0xFF00C853).withValues(alpha: 0.18),
        Colors.transparent,
      ],
    ).createShader(Rect.fromCircle(
      center: Offset(size.width * 0.15, size.height * 0.12),
      radius: size.width * 0.6,
    ));
    canvas.drawCircle(
      Offset(size.width * 0.15, size.height * 0.12),
      size.width * 0.6,
      paint,
    );

    // Blue glow bottom-right
    paint.shader = RadialGradient(
      colors: [
        const Color(0xFF1565C0).withValues(alpha: 0.14),
        Colors.transparent,
      ],
    ).createShader(Rect.fromCircle(
      center: Offset(size.width * 0.85, size.height * 0.75),
      radius: size.width * 0.55,
    ));
    canvas.drawCircle(
      Offset(size.width * 0.85, size.height * 0.75),
      size.width * 0.55,
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
