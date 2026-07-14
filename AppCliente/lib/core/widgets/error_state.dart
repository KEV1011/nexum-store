import 'package:flutter/material.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';

/// Estado de error reutilizable: dice qué pasó y cómo resolverlo, con una
/// acción de reintento. Sin disculpas vagas.
///
/// Va centrado. Dentro de un `CustomScrollView`, envuélvelo en un
/// `SliverFillRemaining(hasScrollBody: false, child: ErrorState(...))`.
class ErrorState extends StatelessWidget {
  const ErrorState({
    super.key,
    this.title,
    this.message,
    this.icon = Icons.cloud_off_rounded,
    this.onRetry,
  });

  /// Qué pasó. Por defecto: "No pudimos cargar esto".
  final String? title;

  /// Cómo resolver. Por defecto invita a revisar la conexión y reintentar.
  final String? message;

  /// Icono del error.
  final IconData icon;

  /// Acción de reintento. Si es null, no se muestra el botón.
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingXL,
          vertical: AppConstants.spacingL,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 64, color: context.textTertiaryColor),
            const SizedBox(height: AppConstants.spacingM),
            Text(
              title ?? 'No pudimos cargar esto',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppConstants.spacingXS),
            Text(
              message ?? 'Revisa tu conexión e intenta de nuevo.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.textSecondaryColor,
              ),
              textAlign: TextAlign.center,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: AppConstants.spacingL),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Reintentar'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
