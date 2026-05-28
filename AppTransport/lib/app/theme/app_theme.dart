import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

/// Configuración de temas para la aplicación Nexum Driver.
///
/// Proporciona [lightTheme] y [darkTheme] construidos sobre Material 3,
/// usando la fuente Poppins (Google Fonts) y la paleta de [AppColors].
abstract final class AppTheme {
  // ── Radios compartidos ───────────────────────────────────────────────────

  static final _cardShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
  );

  static final _buttonShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
  );

  static final _inputBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
    borderSide: const BorderSide(color: AppColors.divider),
  );

  static final _focusedInputBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
    borderSide: const BorderSide(color: AppColors.primary, width: 2),
  );

  static final _errorInputBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
    borderSide: const BorderSide(color: AppColors.error, width: 1.5),
  );

  // ── Texto base ───────────────────────────────────────────────────────────

  static TextTheme _buildTextTheme(TextTheme base) =>
      GoogleFonts.interTextTheme(base);

  // ── Tema claro ───────────────────────────────────────────────────────────

  /// Tema Material 3 claro con paleta basada en [AppColors.primary].
  static ThemeData lightTheme() {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.backgroundLight,
      textTheme: _buildTextTheme(ThemeData.light().textTheme),
      // AppBar
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.backgroundLight,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: true,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
        iconTheme: const IconThemeData(color: AppColors.textPrimary),
      ),
      // Cards
      cardTheme: CardThemeData(
        shape: _cardShape,
        elevation: 2,
        color: AppColors.cardLight,
        surfaceTintColor: Colors.transparent,
        shadowColor: AppColors.shadow,
        margin: EdgeInsets.zero,
      ),
      // Elevated button
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.textOnPrimary,
          minimumSize: const Size.fromHeight(AppConstants.minTouchTarget),
          shape: _buttonShape,
          elevation: 0,
          textStyle: GoogleFonts.inter(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      // Outlined button
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size.fromHeight(AppConstants.minTouchTarget),
          shape: _buttonShape,
          side: const BorderSide(color: AppColors.primary, width: 1.5),
          textStyle: GoogleFonts.inter(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      // Text button
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size(
            AppConstants.minTouchTarget,
            AppConstants.minTouchTarget,
          ),
          shape: _buttonShape,
          textStyle: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      // FAB
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.textOnPrimary,
        elevation: 4,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
        ),
        extendedPadding:
            const EdgeInsets.symmetric(horizontal: AppConstants.spacingL),
      ),
      // Input decoration
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceLight,
        border: _inputBorder,
        enabledBorder: _inputBorder,
        focusedBorder: _focusedInputBorder,
        errorBorder: _errorInputBorder,
        focusedErrorBorder: _errorInputBorder,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingM,
        ),
        hintStyle: GoogleFonts.inter(
          color: AppColors.textSecondary,
          fontSize: 14,
        ),
        labelStyle: GoogleFonts.inter(
          color: AppColors.textSecondary,
          fontSize: 14,
        ),
        floatingLabelStyle: GoogleFonts.inter(
          color: AppColors.primary,
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
      ),
      // Bottom sheet
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.backgroundLight,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppConstants.radiusXLarge),
          ),
        ),
        elevation: 8,
        dragHandleColor: AppColors.divider,
        showDragHandle: true,
      ),
      // Divider
      dividerTheme: const DividerThemeData(
        color: AppColors.divider,
        thickness: 1,
        space: 1,
      ),
      // Chip
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surfaceLight,
        labelStyle: GoogleFonts.inter(fontSize: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
        ),
      ),
      // Switch
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.primary
              : Colors.white,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.primaryLight
              : AppColors.divider,
        ),
      ),
      // Progress indicator
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.primary,
        linearTrackColor: AppColors.divider,
      ),
    );
  }

  // ── Tema oscuro ───────────────────────────────────────────────────────────

  /// Tema Material 3 oscuro con paleta basada en [AppColors.primary].
  static ThemeData darkTheme() {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: Brightness.dark,
      surface: AppColors.surfaceDark,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.backgroundDark,
      textTheme: _buildTextTheme(ThemeData.dark().textTheme),
      // AppBar
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.backgroundDark,
        foregroundColor: AppColors.textOnDark,
        elevation: 0,
        scrolledUnderElevation: 2,
        centerTitle: true,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: AppColors.textOnDark,
        ),
        iconTheme: const IconThemeData(color: AppColors.textOnDark),
      ),
      // Cards
      cardTheme: CardThemeData(
        shape: _cardShape,
        elevation: 4,
        color: AppColors.cardDark,
        surfaceTintColor: Colors.transparent,
        shadowColor: Colors.black54,
        margin: EdgeInsets.zero,
      ),
      // Elevated button
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.textOnPrimary,
          minimumSize: const Size.fromHeight(AppConstants.minTouchTarget),
          shape: _buttonShape,
          elevation: 0,
          textStyle: GoogleFonts.inter(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      // Outlined button
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primaryLight,
          minimumSize: const Size.fromHeight(AppConstants.minTouchTarget),
          shape: _buttonShape,
          side: const BorderSide(color: AppColors.primaryLight, width: 1.5),
          textStyle: GoogleFonts.inter(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      // Text button
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primaryLight,
          minimumSize: const Size(
            AppConstants.minTouchTarget,
            AppConstants.minTouchTarget,
          ),
          shape: _buttonShape,
          textStyle: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      // FAB
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.textOnPrimary,
        elevation: 6,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
        ),
        extendedPadding:
            const EdgeInsets.symmetric(horizontal: AppConstants.spacingL),
      ),
      // Input decoration
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceDark,
        border: _inputBorder,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          borderSide: const BorderSide(color: Colors.white24),
        ),
        focusedBorder: _focusedInputBorder,
        errorBorder: _errorInputBorder,
        focusedErrorBorder: _errorInputBorder,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingM,
        ),
        hintStyle: GoogleFonts.inter(
          color: Colors.white38,
          fontSize: 14,
        ),
        labelStyle: GoogleFonts.inter(
          color: Colors.white54,
          fontSize: 14,
        ),
        floatingLabelStyle: GoogleFonts.inter(
          color: AppColors.primaryLight,
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
      ),
      // Bottom sheet
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surfaceDark,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppConstants.radiusXLarge),
          ),
        ),
        elevation: 12,
        dragHandleColor: Colors.white24,
        showDragHandle: true,
      ),
      // Divider
      dividerTheme: const DividerThemeData(
        color: Colors.white12,
        thickness: 1,
        space: 1,
      ),
      // Chip
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.cardDark,
        labelStyle: GoogleFonts.inter(
          fontSize: 12,
          color: AppColors.textOnDark,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
        ),
      ),
      // Switch
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.primary
              : Colors.grey,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.primaryDark
              : Colors.white12,
        ),
      ),
      // Progress indicator
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.primary,
        linearTrackColor: Colors.white12,
      ),
    );
  }
}
