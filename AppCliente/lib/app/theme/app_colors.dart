import 'package:flutter/material.dart';

abstract final class AppColors {
  // ── Primary (Verde operativo) ─────────────────────────────────────────────
  static const Color primary = Color(0xFF00C853);
  static const Color primaryDim = Color(0xFF00963D);
  static const Color primaryLight = Color(0xFF5EFF82);
  static const Color primaryContainer = Color(0xFFE8F5E9);

  // ── Secondary (Azul institucional) ───────────────────────────────────────
  static const Color secondary = Color(0xFF1565C0);
  static const Color secondaryDark = Color(0xFF003C8F);
  static const Color secondaryLight = Color(0xFF5E92F3);
  static const Color secondaryContainer = Color(0xFFE3F2FD);

  // ── Estados del conductor ─────────────────────────────────────────────────
  static const Color online = Color(0xFF00C853);
  static const Color offline = Color(0xFFE53935);
  static const Color waiting = Color(0xFFFF9800);

  // ── Superficies modo claro ────────────────────────────────────────────────
  static const Color backgroundLight = Color(0xFFF8F9FA);
  static const Color surfaceLight = Color(0xFFFFFFFF);
  static const Color surfaceVariantLight = Color(0xFFF0F2F5);
  static const Color outlineLight = Color(0xFFDDE1E7);
  static const Color cardLight = Color(0xFFFFFFFF);

  // ── Superficies modo oscuro ───────────────────────────────────────────────
  static const Color backgroundDark = Color(0xFF0F1117);
  static const Color surfaceDark = Color(0xFF1A1D27);
  static const Color surfaceVariantDark = Color(0xFF252836);
  static const Color outlineDark = Color(0xFF2E3347);
  static const Color cardDark = Color(0xFF1A1D27);

  // ── Texto ─────────────────────────────────────────────────────────────────
  static const Color textPrimary = Color(0xFF111827);
  static const Color textSecondary = Color(0xFF6B7280);
  static const Color textTertiary = Color(0xFF9CA3AF);
  static const Color textOnPrimary = Color(0xFFFFFFFF);
  static const Color textOnDark = Color(0xFFE2E8F0);
  static const Color textSecondaryDark = Color(0xFF94A3B8);

  // ── Semánticos ────────────────────────────────────────────────────────────
  static const Color success = Color(0xFF00C853);
  static const Color successContainer = Color(0xFFDCFCE7);
  static const Color error = Color(0xFFDC2626);
  static const Color errorContainer = Color(0xFFFEE2E2);
  static const Color warning = Color(0xFFF59E0B);
  static const Color warningContainer = Color(0xFFFEF3C7);
  static const Color info = Color(0xFF3B82F6);
  static const Color infoContainer = Color(0xFFDBEAFE);

  // ── Tipos de servicio ─────────────────────────────────────────────────────
  static const Color serviceParticular = Color(0xFF3949AB);
  static const Color serviceTaxi = Color(0xFFF57F17);
  static const Color serviceMoto = Color(0xFFE64A19);
  static const Color serviceMotocarro = Color(0xFF5D4037);
  static const Color serviceEnvios = Color(0xFF00695C);

  static const Color serviceParticularContainer = Color(0xFFE8EAF6);
  static const Color serviceTaxiContainer = Color(0xFFFFF8E1);
  static const Color serviceMotoContainer = Color(0xFFFBE9E7);
  static const Color serviceMotocarroContainer = Color(0xFFEFEBE9);
  static const Color serviceEnviosContainer = Color(0xFFE0F2F1);

  // ── Mapa ──────────────────────────────────────────────────────────────────
  static const Color routeColor = Color(0xFF1565C0);
  static const Color pickupMarker = Color(0xFF00C853);
  static const Color destinationMarker = Color(0xFFDC2626);

  // ── UI miscelánea ─────────────────────────────────────────────────────────
  static const Color divider = Color(0xFFE5E7EB);
  static const Color dividerDark = Color(0xFF2E3347);
  static const Color shadow = Color(0x14000000);
  static const Color shadowMedium = Color(0x29000000);
  static const Color star = Color(0xFFFBBF24);
  static const Color starContainer = Color(0xFFFEF9C3);
  static const Color overlay = Color(0x80000000);
  static const Color overlayLight = Color(0x33000000);
}
