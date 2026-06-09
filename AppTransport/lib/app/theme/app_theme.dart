import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

// ── Helpers ───────────────────────────────────────────────────────────────────

TextStyle _inter({
  double? fontSize,
  FontWeight? fontWeight,
  Color? color,
  double? letterSpacing,
  double? height,
}) {
  return TextStyle(
    fontFamily: 'Inter',
    fontSize: fontSize,
    fontWeight: fontWeight,
    color: color,
    letterSpacing: letterSpacing,
    height: height,
  );
}

/// Type pairing: **Sora** (geometric, with personality) for display, headline
/// and the large title — a confident brand voice for headers and hero numbers —
/// while **Inter** carries titles, body and labels for maximum legibility.
TextTheme _buildTextTheme(TextTheme base) {
  TextStyle? text(TextStyle? s) => s?.copyWith(fontFamily: 'Inter');
  TextStyle display(TextStyle? s, {FontWeight weight = FontWeight.w700}) =>
      GoogleFonts.sora(textStyle: s, fontWeight: weight);
  return base.copyWith(
    displayLarge: display(base.displayLarge, weight: FontWeight.w800),
    displayMedium: display(base.displayMedium, weight: FontWeight.w800),
    displaySmall: display(base.displaySmall),
    headlineLarge: display(base.headlineLarge),
    headlineMedium: display(base.headlineMedium),
    headlineSmall: display(base.headlineSmall),
    titleLarge: display(base.titleLarge, weight: FontWeight.w600),
    titleMedium: text(base.titleMedium),
    titleSmall: text(base.titleSmall),
    bodyLarge: text(base.bodyLarge),
    bodyMedium: text(base.bodyMedium),
    bodySmall: text(base.bodySmall),
    labelLarge: text(base.labelLarge),
    labelMedium: text(base.labelMedium),
    labelSmall: text(base.labelSmall),
  );
}

// ── Theme ─────────────────────────────────────────────────────────────────────

abstract final class AppTheme {
  // ── Shared shapes ─────────────────────────────────────────────────────────

  static final _cardShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
  );

  static final _buttonShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
  );

  static OutlineInputBorder _inputBorder(Color borderColor) =>
      OutlineInputBorder(
        borderRadius:
            BorderRadius.circular(AppConstants.radiusMedium),
        borderSide: BorderSide(color: borderColor),
      );

  static OutlineInputBorder _focusedInputBorder(Color focusColor) =>
      OutlineInputBorder(
        borderRadius:
            BorderRadius.circular(AppConstants.radiusMedium),
        borderSide: BorderSide(color: focusColor, width: 2),
      );

  static final _errorInputBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
    borderSide:
        const BorderSide(color: AppColors.error, width: 1.5),
  );

  // ── Light theme ───────────────────────────────────────────────────────────

  static ThemeData lightTheme() {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      primary: AppColors.primary,
      secondary: AppColors.secondary,
      surface: AppColors.surfaceLight,
      error: AppColors.error,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.backgroundLight,
      textTheme: _buildTextTheme(ThemeData.light().textTheme),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.surfaceLight,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 1,
        shadowColor: AppColors.shadow,
        centerTitle: true,
        titleTextStyle: _inter(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
        iconTheme:
            const IconThemeData(color: AppColors.textPrimary),
      ),
      cardTheme: CardThemeData(
        shape: _cardShape,
        elevation: 0,
        color: AppColors.cardLight,
        surfaceTintColor: Colors.transparent,
        shadowColor: AppColors.shadow,
        margin: EdgeInsets.zero,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.textOnPrimary,
          minimumSize: const Size.fromHeight(
            AppConstants.minTouchTarget,
          ),
          shape: _buttonShape,
          elevation: 0,
          shadowColor: Colors.transparent,
          textStyle: _inter(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size.fromHeight(
            AppConstants.minTouchTarget,
          ),
          shape: _buttonShape,
          side: const BorderSide(
            color: AppColors.primary,
            width: 1.5,
          ),
          textStyle: _inter(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size(
            AppConstants.minTouchTarget,
            AppConstants.minTouchTarget,
          ),
          shape: _buttonShape,
          textStyle: _inter(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.textOnPrimary,
        elevation: 4,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(
            AppConstants.radiusCircular,
          ),
        ),
        extendedPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingL,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceVariantLight,
        border: _inputBorder(AppColors.outlineLight),
        enabledBorder: _inputBorder(AppColors.outlineLight),
        focusedBorder: _focusedInputBorder(AppColors.primary),
        errorBorder: _errorInputBorder,
        focusedErrorBorder: _errorInputBorder,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingM,
        ),
        hintStyle: _inter(
          color: AppColors.textTertiary,
          fontSize: 14,
        ),
        labelStyle: _inter(
          color: AppColors.textSecondary,
          fontSize: 14,
        ),
        floatingLabelStyle: _inter(
          color: AppColors.primary,
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surfaceLight,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppConstants.radiusXLarge),
          ),
        ),
        elevation: 8,
        dragHandleColor: AppColors.outlineLight,
        showDragHandle: true,
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.divider,
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surfaceVariantLight,
        labelStyle: _inter(
          fontSize: 12,
          color: AppColors.textSecondary,
        ),
        shape: RoundedRectangleBorder(
          borderRadius:
              BorderRadius.circular(AppConstants.radiusSmall),
        ),
        side: const BorderSide(color: AppColors.outlineLight),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.primary
              : Colors.white,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.primaryContainer
              : AppColors.outlineLight,
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.primary,
        linearTrackColor: AppColors.outlineLight,
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(
          borderRadius:
              BorderRadius.circular(AppConstants.radiusMedium),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingXS,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius:
              BorderRadius.circular(AppConstants.radiusMedium),
        ),
        backgroundColor: AppColors.textPrimary,
        contentTextStyle: _inter(
          color: Colors.white,
          fontSize: 14,
        ),
      ),
    );
  }

  // ── Dark theme ────────────────────────────────────────────────────────────

  static ThemeData darkTheme() {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: Brightness.dark,
      primary: AppColors.primary,
      secondary: AppColors.secondaryLight,
      surface: AppColors.surfaceDark,
      error: AppColors.error,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.backgroundDark,
      textTheme: _buildTextTheme(ThemeData.dark().textTheme),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.surfaceDark,
        foregroundColor: AppColors.textOnDark,
        elevation: 0,
        scrolledUnderElevation: 1,
        shadowColor: Colors.black26,
        centerTitle: true,
        titleTextStyle: _inter(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: AppColors.textOnDark,
        ),
        iconTheme:
            const IconThemeData(color: AppColors.textOnDark),
      ),
      cardTheme: CardThemeData(
        shape: _cardShape,
        elevation: 0,
        color: AppColors.cardDark,
        surfaceTintColor: Colors.transparent,
        shadowColor: Colors.transparent,
        margin: EdgeInsets.zero,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.textOnPrimary,
          minimumSize: const Size.fromHeight(
            AppConstants.minTouchTarget,
          ),
          shape: _buttonShape,
          elevation: 0,
          shadowColor: Colors.transparent,
          textStyle: _inter(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primaryLight,
          minimumSize: const Size.fromHeight(
            AppConstants.minTouchTarget,
          ),
          shape: _buttonShape,
          side: const BorderSide(
            color: AppColors.primaryLight,
            width: 1.5,
          ),
          textStyle: _inter(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primaryLight,
          minimumSize: const Size(
            AppConstants.minTouchTarget,
            AppConstants.minTouchTarget,
          ),
          shape: _buttonShape,
          textStyle: _inter(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.textOnPrimary,
        elevation: 6,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(
            AppConstants.radiusCircular,
          ),
        ),
        extendedPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingL,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceVariantDark,
        border: _inputBorder(AppColors.outlineDark),
        enabledBorder: _inputBorder(AppColors.outlineDark),
        focusedBorder: _focusedInputBorder(AppColors.primary),
        errorBorder: _errorInputBorder,
        focusedErrorBorder: _errorInputBorder,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingM,
        ),
        hintStyle: _inter(
          color: AppColors.textSecondaryDark,
          fontSize: 14,
        ),
        labelStyle: _inter(
          color: AppColors.textSecondaryDark,
          fontSize: 14,
        ),
        floatingLabelStyle: _inter(
          color: AppColors.primary,
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surfaceDark,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppConstants.radiusXLarge),
          ),
        ),
        elevation: 12,
        dragHandleColor: AppColors.outlineDark,
        showDragHandle: true,
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.dividerDark,
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surfaceVariantDark,
        labelStyle: _inter(
          fontSize: 12,
          color: AppColors.textOnDark,
        ),
        shape: RoundedRectangleBorder(
          borderRadius:
              BorderRadius.circular(AppConstants.radiusSmall),
        ),
        side: const BorderSide(color: AppColors.outlineDark),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.primary
              : AppColors.textSecondaryDark,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.primaryDim
              : AppColors.surfaceVariantDark,
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.primary,
        linearTrackColor: AppColors.outlineDark,
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(
          borderRadius:
              BorderRadius.circular(AppConstants.radiusMedium),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingXS,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius:
              BorderRadius.circular(AppConstants.radiusMedium),
        ),
        backgroundColor: AppColors.surfaceVariantDark,
        contentTextStyle: _inter(
          color: AppColors.textOnDark,
          fontSize: 14,
        ),
      ),
    );
  }
}
