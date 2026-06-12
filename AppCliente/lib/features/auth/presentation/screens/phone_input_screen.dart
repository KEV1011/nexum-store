import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
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

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authProvider, _handleAuthState);

    final isLoading = ref.watch(authProvider) is AuthLoading;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return LoadingOverlay(
      isLoading: isLoading,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Iniciar sesión'),
          backgroundColor: Colors.transparent,
          elevation: 0,
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
                    Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: AppColors.primaryContainer,
                        borderRadius: BorderRadius.circular(
                          AppConstants.radiusXLarge,
                        ),
                      ),
                      child: const Icon(
                        Icons.delivery_dining_rounded,
                        size: 44,
                        color: AppColors.primary,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingL),
                    const Text(
                      'Bienvenido a Nexum',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingS),
                    const Text(
                      'Ingresa tu número de celular para recibir '
                      'un código de verificación.',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 15,
                        color: AppColors.textSecondary,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingXL),
                    Container(
                      decoration: BoxDecoration(
                        color: isDark
                            ? AppColors.cardDark
                            : AppColors.surfaceLight,
                        borderRadius: BorderRadius.circular(
                          AppConstants.radiusMedium,
                        ),
                        border: Border.all(
                          color: isDark
                              ? AppColors.outlineDark
                              : AppColors.outlineLight,
                        ),
                      ),
                      child: Row(
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppConstants.spacingM,
                            ),
                            child: Text(
                              '🇨🇴 +57',
                              style: TextStyle(
                                fontFamily: 'Inter',
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: isDark
                                    ? AppColors.textOnDark
                                    : AppColors.textPrimary,
                              ),
                            ),
                          ),
                          Container(
                            width: 1,
                            height: 24,
                            color: isDark
                                ? AppColors.outlineDark
                                : AppColors.outlineLight,
                          ),
                          Expanded(
                            child: TextFormField(
                              controller: _phoneController,
                              focusNode: _phoneFocusNode,
                              keyboardType: TextInputType.phone,
                              inputFormatters: [
                                FilteringTextInputFormatter.digitsOnly,
                                LengthLimitingTextInputFormatter(10),
                              ],
                              style: const TextStyle(
                                fontFamily: 'Inter',
                                fontSize: 18,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 2,
                              ),
                              decoration: const InputDecoration(
                                hintText: '3XX XXX XXXX',
                                border: InputBorder.none,
                                filled: false,
                                contentPadding: EdgeInsets.symmetric(
                                  horizontal: AppConstants.spacingM,
                                  vertical: AppConstants.spacingM,
                                ),
                              ),
                              validator: _validatePhone,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingL),
                    SizedBox(
                      height: AppConstants.minTouchTarget + 8,
                      child: ElevatedButton(
                        onPressed: isLoading ? null : _onContinue,
                        child: const Text('Continuar'),
                      ),
                    ),
                    // Pista de demo — solo builds de desarrollo.
                    if (kDebugMode) ...[
                      const SizedBox(height: AppConstants.spacingL),
                      Text(
                        'Para demo: cualquier número y código 123456',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 12,
                          color: isDark
                              ? AppColors.textSecondaryDark
                              : AppColors.textTertiary,
                        ),
                      ),
                    ],
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
