import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

/// Widget reutilizable de una caja de dígito OTP.
///
/// Características:
/// - Acepta exactamente un dígito (0-9).
/// - Avanza automáticamente el foco al siguiente campo al escribir.
/// - Retrocede al campo anterior al presionar backspace en una caja vacía.
/// - Estilo: caja con borde redondeado (12 dp).
/// - Estado enfocado: borde verde primario (#00C853).
/// - Estado de error: borde rojo (#E53935).
/// - Tamaño mínimo: 48 × 52 dp.
class OtpInputField extends StatefulWidget {
  const OtpInputField({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
    required this.onBackspace,
    this.hasError = false,
    this.enabled = true,
    super.key,
  });

  /// Controlador del campo de texto.
  final TextEditingController controller;

  /// FocusNode para controlar el foco programáticamente.
  final FocusNode focusNode;

  /// Callback que se ejecuta cuando el valor del campo cambia.
  /// Recibe el nuevo texto (cadena de 0 o 1 caracteres).
  final ValueChanged<String> onChanged;

  /// Callback que se ejecuta cuando se presiona backspace en una caja vacía.
  /// Debe mover el foco al campo anterior.
  final VoidCallback onBackspace;

  /// Si es `true`, el borde cambia a rojo para indicar error de validación.
  final bool hasError;

  /// Controla si el campo acepta entrada del usuario.
  final bool enabled;

  @override
  State<OtpInputField> createState() => _OtpInputFieldState();
}

class _OtpInputFieldState extends State<OtpInputField> {
  /// Tracks whether this specific field has focus for border styling.
  bool _isFocused = false;

  @override
  void initState() {
    super.initState();
    widget.focusNode.addListener(_onFocusChange);
  }

  @override
  void dispose() {
    widget.focusNode.removeListener(_onFocusChange);
    super.dispose();
  }

  void _onFocusChange() {
    setState(() => _isFocused = widget.focusNode.hasFocus);
  }

  // ── Border helpers ─────────────────────────────────────────────────────────

  Color get _borderColor {
    if (widget.hasError) return AppColors.error;
    if (_isFocused) return AppColors.primary;
    if (widget.controller.text.isNotEmpty) return AppColors.primary.withOpacity(0.5);
    return AppColors.divider;
  }

  double get _borderWidth {
    if (_isFocused || widget.hasError) return 2.0;
    return 1.5;
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return ConstrainedBox(
      constraints: const BoxConstraints(
        minWidth: 48,
        minHeight: 52,
      ),
      child: SizedBox(
        width: 48,
        height: 52,
        child: KeyboardListener(
          // We use a separate FocusNode for the KeyboardListener so it does
          // not steal focus from the TextField.
          focusNode: FocusNode(skipTraversal: true, canRequestFocus: false),
          onKeyEvent: (event) {
            if (event is KeyDownEvent &&
                event.logicalKey == LogicalKeyboardKey.backspace &&
                widget.controller.text.isEmpty) {
              widget.onBackspace();
            }
          },
          child: TextField(
            controller: widget.controller,
            focusNode: widget.focusNode,
            enabled: widget.enabled,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.next,
            textAlign: TextAlign.center,
            maxLength: 1,
            obscureText: false,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: isDark ? AppColors.textOnDark : context.textPrimaryColor,
              height: 1.2,
            ),
            decoration: InputDecoration(
              counterText: '',
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
              filled: true,
              fillColor: widget.hasError
                  ? AppColors.error.withOpacity(0.06)
                  : (isDark ? AppColors.cardDark : context.surfaceColor),
              enabledBorder: OutlineInputBorder(
                borderRadius:
                    BorderRadius.circular(AppConstants.radiusMedium),
                borderSide: BorderSide(
                  color: _borderColor,
                  width: _borderWidth,
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius:
                    BorderRadius.circular(AppConstants.radiusMedium),
                borderSide: BorderSide(
                  color: widget.hasError ? AppColors.error : AppColors.primary,
                  width: 2.0,
                ),
              ),
              errorBorder: OutlineInputBorder(
                borderRadius:
                    BorderRadius.circular(AppConstants.radiusMedium),
                borderSide:
                    const BorderSide(color: AppColors.error, width: 2.0),
              ),
              focusedErrorBorder: OutlineInputBorder(
                borderRadius:
                    BorderRadius.circular(AppConstants.radiusMedium),
                borderSide:
                    const BorderSide(color: AppColors.error, width: 2.0),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius:
                    BorderRadius.circular(AppConstants.radiusMedium),
                borderSide: BorderSide(
                  color: AppColors.divider.withOpacity(0.5),
                  width: 1.5,
                ),
              ),
            ),
            onChanged: (value) {
              // Enforce single character: if somehow multiple chars arrive
              // (e.g., paste), keep only the last digit.
              if (value.length > 1) {
                final lastChar = value[value.length - 1];
                widget.controller.value = TextEditingValue(
                  text: lastChar,
                  selection: TextSelection.collapsed(offset: 1),
                );
                widget.onChanged(lastChar);
                return;
              }
              widget.onChanged(value);
            },
          ),
        ),
      ),
    );
  }
}
