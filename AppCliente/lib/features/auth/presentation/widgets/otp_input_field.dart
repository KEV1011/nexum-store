import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';

/// Caja individual de un dígito OTP.
///
/// Avanza el foco automáticamente al escribir y retrocede al borrar.
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

  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onChanged;
  final VoidCallback onBackspace;
  final bool hasError;
  final bool enabled;

  @override
  State<OtpInputField> createState() => _OtpInputFieldState();
}

class _OtpInputFieldState extends State<OtpInputField> {
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

  Color get _borderColor {
    if (widget.hasError) return AppColors.error;
    if (_isFocused) return AppColors.primary;
    if (widget.controller.text.isNotEmpty) {
      return AppColors.primary.withValues(alpha: 0.5);
    }
    return AppColors.divider;
  }

  double get _borderWidth => (_isFocused || widget.hasError) ? 2 : 1.5;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return SizedBox(
      width: 48,
      height: 52,
      child: KeyboardListener(
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
          textAlign: TextAlign.center,
          maxLength: 1,
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
                ? AppColors.error.withValues(alpha: 0.06)
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
                color:
                    widget.hasError ? AppColors.error : AppColors.primary,
                width: 2,
              ),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius:
                  BorderRadius.circular(AppConstants.radiusMedium),
              borderSide:
                  const BorderSide(color: AppColors.error, width: 2),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius:
                  BorderRadius.circular(AppConstants.radiusMedium),
              borderSide:
                  const BorderSide(color: AppColors.error, width: 2),
            ),
          ),
          onChanged: (value) {
            if (value.length > 1) {
              final last = value[value.length - 1];
              widget.controller.value = TextEditingValue(
                text: last,
                selection: const TextSelection.collapsed(offset: 1),
              );
              widget.onChanged(last);
              return;
            }
            widget.onChanged(value);
          },
        ),
      ),
    );
  }
}
